"""
GitDecode — Supabase / PostgreSQL Client
========================================
Manages the Supabase Python SDK client and provides typed query methods
for repos, vector chunks (pgvector), and chat history.

RLS Enforcement
----------------
Every query method includes a ``user_id`` parameter and filters explicitly,
even though we use the ``service_role`` key (which bypasses RLS). This is
defense-in-depth: if the client is ever accidentally exposed with the
``anon`` key, RLS still protects data isolation.

Vector Storage
---------------
Embeddings use ``nomic-embed-code`` (768 dimensions). The pgvector similarity
search is performed via a server-side SQL function ``match_vectors`` called
through Supabase's ``.rpc()`` interface.
"""

from __future__ import annotations

import logging
from typing import Any

from supabase import create_client, Client as SupabaseClient

logger = logging.getLogger(__name__)


class SupabasePGClient:
    """Supabase/PostgreSQL client for vector storage and chat history.

    Args:
        supabase_url: The Supabase project URL.
        service_role_key: Service role key (bypasses RLS).
    """

    def __init__(self, supabase_url: str, service_role_key: str) -> None:
        self._client: SupabaseClient = create_client(supabase_url, service_role_key)
        logger.info("Supabase client initialized for %s", supabase_url)

    # ══════════════════════════════════════════════════════════════════════
    #  Repos
    # ══════════════════════════════════════════════════════════════════════

    async def insert_repo(
        self,
        user_id: str,
        github_url: str,
        branch: str = "main",
    ) -> dict[str, Any]:
        """Insert a new repository record with status ``"queued"``.

        Args:
            user_id: The Supabase user UUID (from JWT ``sub`` claim).
            github_url: The GitHub repository HTTPS URL.
            branch: The branch to sync.

        Returns:
            The inserted row as a dictionary (includes ``id``, ``status``, etc.).
        """
        response = (
            self._client.table("repos")
            .insert(
                {
                    "user_id": user_id,
                    "github_url": github_url,
                    "branch": branch,
                    "status": "queued",
                    "detailed_status": "queued",
                }
            )
            .execute()
        )
        row = response.data[0]
        logger.info("Inserted repo %s for user %s", row["id"], user_id)
        return row

    async def update_repo_status(
        self,
        repo_id: str,
        user_id: str,
        status: str,
        detailed_status: str | None = None,
        error_message: str | None = None,
    ) -> dict[str, Any]:
        """Update the sync status of a repository.

        Args:
            repo_id: The repository UUID.
            user_id: The owner's user UUID (for RLS filtering).
            status: New status (``"queued"``, ``"processing"``, ``"completed"``, ``"failed"``).
            detailed_status: Detailed status step (e.g. ``"cloning"``, ``"parsing"``, etc.).
            error_message: Optional error logs if failed.

        Returns:
            The updated row as a dictionary.
        """
        update_data: dict[str, Any] = {"status": status}
        if detailed_status is not None:
            update_data["detailed_status"] = detailed_status
        if error_message is not None:
            update_data["error_message"] = error_message

        response = (
            self._client.table("repos")
            .update(update_data)
            .eq("id", repo_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not response.data:
            logger.error("Failed to update repo status: repository %s not found for user %s", repo_id, user_id)
            return {}
        row = response.data[0]
        logger.info("Updated repo %s status to '%s'", repo_id, status)
        return row

    async def get_repo(
        self,
        repo_id: str,
        user_id: str,
    ) -> dict[str, Any] | None:
        """Fetch a single repository by ID, scoped to the user.

        Args:
            repo_id: The repository UUID.
            user_id: The owner's user UUID (for RLS filtering).

        Returns:
            The row as a dictionary, or ``None`` if not found.
        """
        response = (
            self._client.table("repos")
            .select("*")
            .eq("id", repo_id)
            .eq("user_id", user_id)
            .execute()
        )
        return response.data[0] if (response and getattr(response, "data", None)) else None

    async def get_repo_by_id(
        self,
        repo_id: str,
        user_id: str,
    ) -> dict[str, Any] | None:
        """Fetch a single repository by ID, scoped to the user (alias for get_repo)."""
        return await self.get_repo(repo_id, user_id)

    async def get_repo_by_url(
        self,
        user_id: str,
        github_url: str,
    ) -> dict[str, Any] | None:
        """Fetch a single repository by GitHub URL, scoped to the user.

        Normalizes URL variations (trailing slashes, .git suffix, case differences)
        to prevent false 404 lookup failures.
        """
        clean_target = github_url.rstrip("/").removesuffix(".git").lower()
        user_repos = await self.get_user_repos(user_id)
        for r in user_repos:
            r_url = r.get("github_url", "").rstrip("/").removesuffix(".git").lower()
            if r_url == clean_target:
                return r
        return None


    async def get_user_repos(
        self,
        user_id: str,
    ) -> list[dict[str, Any]]:
        """Fetch all repositories for a user, ordered by most recent first.

        Args:
            user_id: The owner's user UUID.

        Returns:
            List of repo row dicts.
        """
        response = (
            self._client.table("repos")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return response.data

    async def delete_repo(
        self,
        repo_id: str,
        user_id: str,
    ) -> None:
        """Delete a repository record.

        Args:
            repo_id: The repository UUID.
            user_id: The owner's user UUID (for RLS filtering).
        """
        (
            self._client.table("repos")
            .delete()
            .eq("id", repo_id)
            .eq("user_id", user_id)
            .execute()
        )
        logger.info("Deleted repo %s for user %s", repo_id, user_id)

    async def update_repo_sync_commit(
        self,
        repo_id: str,
        user_id: str,
        commit_sha: str,
        commit_msg: str | None = None,
        changed_files: list[str] | None = None,
    ) -> dict[str, Any]:
        """Persist the HEAD commit SHA, commit message, changed files, and sync timestamp after a successful sync.

        Args:
            repo_id: The repository UUID.
            user_id: The owner's user UUID.
            commit_sha: The full git commit SHA captured at sync time.
            commit_msg: The commit subject/message.
            changed_files: List of file paths that changed in this commit (from git diff).

        Returns:
            The updated row as a dictionary.
        """
        from datetime import datetime, timezone
        update_data: dict[str, Any] = {
            "last_synced_commit": commit_sha,
            "last_synced_at": datetime.now(timezone.utc).isoformat(),
        }
        if commit_msg:
            update_data["last_synced_commit_msg"] = commit_msg
        if changed_files is not None:
            update_data["last_commit_changed_files"] = changed_files

        response = (
            self._client.table("repos")
            .update(update_data)
            .eq("id", repo_id)
            .eq("user_id", user_id)
            .execute()
        )
        logger.info("Updated last_synced_commit=%s for repo %s", commit_sha[:7], repo_id)
        return response.data[0] if response.data else {}


    async def get_active_repo_count(self, user_id: str) -> int:
        """Get the total number of repositories for a user (all repos count toward the limit)."""
        response = (
            self._client.table("repos")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .execute()
        )
        return response.count if response.count is not None else 0

    # ══════════════════════════════════════════════════════════════════════
    #  Rate Limiting
    # ══════════════════════════════════════════════════════════════════════

    async def check_and_increment_rate_limit(self, user_id: str, repo_id: str, daily_limit: int, monthly_limit: int) -> bool:
        from datetime import datetime, date
        
        # 1. Query current limits
        response = (
            self._client.table("repo_rate_limits")
            .select("*")
            .eq("user_id", user_id)
            .eq("repo_id", repo_id)
            .maybe_single()
            .execute()
        )
        
        today_date = date.today().isoformat()
        first_of_month = date.today().replace(day=1).isoformat()
        
        if not response.data:
            # Insert first record
            self._client.table("repo_rate_limits").insert({
                "user_id": user_id,
                "repo_id": repo_id,
                "daily_count": 1,
                "monthly_count": 1,
                "last_message_date": today_date,
                "last_message_month": first_of_month
            }).execute()
            return True

        row = response.data
        daily_count = row["daily_count"]
        monthly_count = row["monthly_count"]
        last_date = row["last_message_date"]
        last_month = row["last_message_month"]

        # Reset counters if calendar day/month has changed
        if last_date < today_date:
            daily_count = 0
            
        if last_month < first_of_month:
            monthly_count = 0

        # Check limits
        if daily_count >= daily_limit or monthly_count >= monthly_limit:
            return False

        # Increment and update
        self._client.table("repo_rate_limits").update({
            "daily_count": daily_count + 1,
            "monthly_count": monthly_count + 1,
            "last_message_date": today_date,
            "last_message_month": first_of_month
        }).eq("user_id", user_id).eq("repo_id", repo_id).execute()
        
        return True

    async def get_rate_limit_status(self, user_id: str, repo_id: str, daily_limit: int, monthly_limit: int) -> dict[str, Any]:
        from datetime import datetime, date
        response = (
            self._client.table("repo_rate_limits")
            .select("*")
            .eq("user_id", user_id)
            .eq("repo_id", repo_id)
            .maybe_single()
            .execute()
        )
        
        if not response.data:
            return {
                "remaining_daily": daily_limit,
                "remaining_monthly": monthly_limit,
                "is_developer": False
            }
            
        row = response.data
        today_date = date.today().isoformat()
        first_of_month = date.today().replace(day=1).isoformat()
        
        daily_count = row["daily_count"]
        monthly_count = row["monthly_count"]
        
        if row["last_message_date"] < today_date:
            daily_count = 0
        if row["last_message_month"] < first_of_month:
            monthly_count = 0
            
        return {
            "remaining_daily": max(0, daily_limit - daily_count),
            "remaining_monthly": max(0, monthly_limit - monthly_count),
            "is_developer": False
        }

    # ══════════════════════════════════════════════════════════════════════
    #  Repo Files & Code Graph (Vectorless RAG)
    # ══════════════════════════════════════════════════════════════════════

    async def insert_repo_files(
        self,
        files: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Bulk-insert full repository files.

        Each file dict should contain:
            - repo_id: str
            - user_id: str
            - file_path: str
            - language: str
            - content: str
            - size_bytes: int
            - checksum: str
        """
        response = (
            self._client.table("repo_files")
            .insert(files)
            .execute()
        )
        logger.info("Inserted %d repository files", len(response.data))
        return response.data

    async def get_all_repo_file_paths(
        self,
        repo_id: str,
        user_id: str,
    ) -> list[dict[str, Any]]:
        """Fetch lightweight metadata for all files in a repository.

        Returns only ``file_path`` and ``language`` (not the full content)
        to avoid loading large payloads into memory. Used during incremental
        re-sync to build the complete file list for import path resolution.

        Args:
            repo_id: The repository UUID.
            user_id: The owner's user UUID.

        Returns:
            List of dicts with ``file_path`` and ``language`` keys.
        """
        response = (
            self._client.table("repo_files")
            .select("file_path, language")
            .eq("repo_id", repo_id)
            .eq("user_id", user_id)
            .execute()
        )
        return response.data or []

    async def get_repo_files(
        self,
        repo_id: str,
        user_id: str,
        file_paths: list[str],
    ) -> list[dict[str, Any]]:
        """Fetch content and metadata of specific repository files."""
        response = (
            self._client.table("repo_files")
            .select("file_path, language, content, size_bytes")
            .eq("repo_id", repo_id)
            .eq("user_id", user_id)
            .in_("file_path", file_paths)
            .execute()
        )
        return response.data

    async def get_all_repo_files(
        self,
        repo_id: str,
        user_id: str,
    ) -> list[dict[str, Any]]:
        """Fetch content and metadata of all repository files."""
        response = (
            self._client.table("repo_files")
            .select("file_path, language, content, size_bytes")
            .eq("repo_id", repo_id)
            .eq("user_id", user_id)
            .execute()
        )
        return response.data

    async def delete_repo_files(
        self,
        repo_id: str,
        user_id: str,
    ) -> None:
        """Delete all files for a repository."""
        self._client.table("repo_files").delete().eq("repo_id", repo_id).eq("user_id", user_id).execute()
        logger.info("Deleted repository files for repo %s, user %s", repo_id, user_id)

    async def delete_repo_file_by_path(
        self,
        repo_id: str,
        user_id: str,
        file_path: str,
    ) -> None:
        """Delete a single file record from the repository by its path.

        Used during incremental re-sync to remove files that were deleted
        in the latest commit without purging the entire repo_files table.

        Args:
            repo_id: The repository UUID.
            user_id: The owner's user UUID.
            file_path: The relative file path within the repository.
        """
        self._client.table("repo_files").delete(
        ).eq("repo_id", repo_id
        ).eq("user_id", user_id
        ).eq("file_path", file_path
        ).execute()
        logger.info("Deleted file %s from repo %s", file_path, repo_id)

    async def upsert_repo_files(
        self,
        files: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Upsert (insert or update) a list of repository files.

        Used during incremental re-sync to update only changed/added files
        without purging all other files in the repository.

        Requires a unique constraint on (repo_id, file_path) in the repo_files
        table. Run this migration if not present:
            ALTER TABLE repo_files ADD CONSTRAINT repo_files_repo_id_file_path_key
                UNIQUE (repo_id, file_path);

        Args:
            files: List of file dicts with repo_id, user_id, file_path, etc.

        Returns:
            The upserted rows.
        """
        response = (
            self._client.table("repo_files")
            .upsert(files, on_conflict="repo_id,file_path")
            .execute()
        )
        logger.info("Upserted %d repository files", len(files))
        return response.data

    async def save_repo_graph(
        self,
        repo_id: str,
        user_id: str,
        graph_data: dict[str, Any],
        stats: dict[str, Any],
    ) -> dict[str, Any]:
        """Upsert the JSON AST dependency graph for a repository."""
        response = (
            self._client.table("code_graph")
            .upsert({
                "repo_id": repo_id,
                "user_id": user_id,
                "graph_data": graph_data,
                "stats": stats,
                "updated_at": "now()",
            }, on_conflict="repo_id")
            .execute()
        )
        logger.info("Saved code graph for repo %s, user %s", repo_id, user_id)
        return response.data[0] if response.data else {}

    async def get_repo_graph(
        self,
        repo_id: str,
        user_id: str,
    ) -> dict[str, Any] | None:
        """Fetch the JSON AST dependency graph for a repository."""
        response = (
            self._client.table("code_graph")
            .select("*")
            .eq("repo_id", repo_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        return response.data

    async def delete_repo_graph(
        self,
        repo_id: str,
        user_id: str,
    ) -> None:
        """Delete the code graph for a repository."""
        self._client.table("code_graph").delete().eq("repo_id", repo_id).eq("user_id", user_id).execute()
        logger.info("Deleted code graph for repo %s, user %s", repo_id, user_id)

    # ══════════════════════════════════════════════════════════════════════
    #  Chat History
    # ══════════════════════════════════════════════════════════════════════

    async def insert_chat_message(
        self,
        user_id: str,
        repo_id: str,
        session_id: str,
        role: str,
        content: str,
        sources: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Insert a single chat message.

        Args:
            user_id: The user's UUID.
            repo_id: The repository this chat is about.
            session_id: The conversation session UUID.
            role: ``"user"`` or ``"assistant"``.
            content: The message text.
            sources: Optional list of code source references (for assistant replies).

        Returns:
            The inserted row as a dictionary.
        """
        response = (
            self._client.table("chat_messages")
            .insert(
                {
                    "user_id": user_id,
                    "repo_id": repo_id,
                    "session_id": session_id,
                    "role": role,
                    "content": content,
                    "sources": sources or [],
                }
            )
            .execute()
        )
        return response.data[0]

    async def delete_chat_message(self, message_id: str) -> None:
        """Delete a chat message."""
        self._client.table("chat_messages").delete().eq("id", message_id).execute()

    async def get_chat_history(
        self,
        session_id: str,
        user_id: str,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Retrieve chat messages for a session, ordered chronologically.

        Args:
            session_id: The conversation session UUID.
            user_id: The user's UUID (for RLS filtering).
            limit: Maximum number of messages to return.

        Returns:
            List of message dicts, ordered by ``created_at ASC``.
        """
        response = (
            self._client.table("chat_messages")
            .select("*")
            .eq("session_id", session_id)
            .eq("user_id", user_id)
            .order("created_at", desc=False)
            .limit(limit)
            .execute()
        )
        return response.data

    async def delete_chat_message(self, message_id: str) -> None:
        """Deletes a chat message by its ID."""
        self._client.table("chat_messages").delete().eq("id", message_id).execute()

    async def delete_chat_session(self, session_id: str, user_id: str) -> None:
        """Deletes all chat messages for a specific session."""
        self._client.table("chat_messages").delete().eq("session_id", session_id).eq("user_id", user_id).execute()
        logger.info("Deleted chat session %s for user %s", session_id, user_id)

    async def get_user_sessions(
        self,
        user_id: str,
        repo_id: str,
    ) -> list[dict[str, Any]]:
        """List distinct chat sessions for a user in a repository.

        Returns the ``session_id`` and the timestamp of the latest message
        in each session, ordered by most recent first.

        Args:
            user_id: The user's UUID.
            repo_id: The repository UUID.

        Returns:
            List of dicts with ``session_id`` and ``latest_at`` keys.
        """
        response = (
            self._client.table("chat_messages")
            .select("session_id, created_at")
            .eq("user_id", user_id)
            .eq("repo_id", repo_id)
            .order("created_at", desc=True)
            .execute()
        )

        # Deduplicate sessions client-side (PostgREST doesn't support DISTINCT ON)
        seen: set[str] = set()
        sessions: list[dict[str, Any]] = []
        for row in response.data:
            sid = row["session_id"]
            if sid not in seen:
                seen.add(sid)
                sessions.append(
                    {"session_id": sid, "latest_at": row["created_at"]}
                )

        return sessions

    async def insert_chat_feedback(
        self,
        user_id: str,
        message_id: str,
        feedback_type: str,
    ) -> dict[str, Any]:
        """Insert user feedback for a chat message.

        Args:
            user_id: The owner's user UUID.
            message_id: The chat message UUID.
            feedback_type: Feedback string (e.g. 'thumbs_up', 'thumbs_down', 'regenerate', 'copy').

        Returns:
            The inserted feedback row.
        """
        response = (
            self._client.table("chat_feedback")
            .insert(
                {
                    "user_id": user_id,
                    "message_id": message_id,
                    "feedback_type": feedback_type,
                }
            )
            .execute()
        )
        row = response.data[0]
        logger.info("Inserted %s feedback for message %s by user %s", feedback_type, message_id, user_id)
        return row

    async def update_repo_diagrams(
        self,
        repo_id: str,
        user_id: str,
        diagrams: dict[str, str],
    ) -> dict[str, Any]:
        """Save the generated Mermaid.js code blocks in the database.

        Args:
            repo_id: The repository UUID.
            user_id: The owner's user UUID.
            diagrams: A dictionary mapping diagram types to their Mermaid.js syntax.

        Returns:
            The updated repository row.
        """
        response = (
            self._client.table("repos")
            .update({"diagrams": diagrams})
            .eq("id", repo_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not response.data:
            logger.error("Failed to update repo diagrams: repository %s not found for user %s", repo_id, user_id)
            return {}
        row = response.data[0]
        logger.info("Updated repo %s diagrams", repo_id)
        return row

    # ══════════════════════════════════════════════════════════════════════
    #  User Preferences
    # ══════════════════════════════════════════════════════════════════════

    async def get_user_preferences(self, user_id: str) -> dict[str, Any] | None:
        """Get user's preferred LLM provider and model."""
        response = (
            self._client.table("user_preferences")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )
        return response.data[0] if response.data else None

    async def upsert_user_preferences(
        self, user_id: str, provider: str, model: str
    ) -> dict[str, Any]:
        """Upsert user's preferred provider/model choice."""
        response = (
            self._client.table("user_preferences")
            .upsert({
                "user_id": user_id,
                "preferred_provider": provider,
                "preferred_model": model,
                "updated_at": "now()",
            }, on_conflict="user_id")
            .execute()
        )
        return response.data[0] if response.data else {}

    # ══════════════════════════════════════════════════════════════════════
    #  Rate Limiting
    # ══════════════════════════════════════════════════════════════════════

    async def get_rate_limit_status(
        self, user_id: str, repo_id: str, daily_limit: int, monthly_limit: int
    ) -> dict[str, Any]:
        from datetime import date
        today = date.today()
        
        response = self._client.table("repo_rate_limits").select("*").eq("user_id", user_id).eq("repo_id", repo_id).execute()
        
        if not response.data:
            return {
                "remaining_daily": daily_limit,
                "remaining_monthly": monthly_limit,
                "is_developer": False
            }
            
        row = response.data[0]
        
        last_date = row.get("last_message_date")
        last_month = row.get("last_message_month")
        daily_count = row.get("daily_count", 0)
        monthly_count = row.get("monthly_count", 0)
        
        today_str = today.isoformat()
        month_str = today.strftime("%Y-%m-01")
        
        if last_date != today_str:
            daily_count = 0
        if last_month != month_str:
            monthly_count = 0
            
        return {
            "remaining_daily": max(0, daily_limit - daily_count),
            "remaining_monthly": max(0, monthly_limit - monthly_count),
            "is_developer": False
        }

    async def check_and_increment_rate_limit(
        self, user_id: str, repo_id: str, daily_limit: int, monthly_limit: int
    ) -> bool:
        from datetime import date
        today = date.today()
        today_str = today.isoformat()
        month_str = today.strftime("%Y-%m-01")
        
        response = self._client.table("repo_rate_limits").select("*").eq("user_id", user_id).eq("repo_id", repo_id).execute()
        
        if not response.data:
            self._client.table("repo_rate_limits").insert({
                "user_id": user_id,
                "repo_id": repo_id,
                "daily_count": 1,
                "monthly_count": 1,
                "last_message_date": today_str,
                "last_message_month": month_str
            }).execute()
            return True
            
        row = response.data[0]
        row_id = row["id"]
        
        daily_count = row.get("daily_count", 0)
        monthly_count = row.get("monthly_count", 0)
        
        if row.get("last_message_date") != today_str:
            daily_count = 0
        if row.get("last_message_month") != month_str:
            monthly_count = 0
            
        if daily_count >= daily_limit or monthly_count >= monthly_limit:
            return False
            
        self._client.table("repo_rate_limits").update({
            "daily_count": daily_count + 1,
            "monthly_count": monthly_count + 1,
            "last_message_date": today_str,
            "last_message_month": month_str
        }).eq("id", row_id).execute()
        
        return True

    # ══════════════════════════════════════════════════════════════════════
    #  Codebase Reports Storage & Rate Limiting
    # ══════════════════════════════════════════════════════════════════════

    async def save_report(
        self, repo_id: str, user_id: str, report_md: str, plan: dict | None = None
    ) -> dict[str, Any]:
        """Save or overwrite the latest report for a repository.

        Args:
            repo_id: The repository UUID.
            user_id: The owner user UUID.
            report_md: Full rendered Markdown string.
            plan: Optional plan dictionary structure.

        Returns:
            The saved database record.
        """
        from datetime import datetime, timezone
        try:
            existing = (
                self._client.table("codebase_reports")
                .select("id")
                .eq("repo_id", repo_id)
                .eq("user_id", user_id)
                .execute()
            )
            if existing.data:
                response = (
                    self._client.table("codebase_reports")
                    .update({
                        "report_markdown": report_md,
                        "plan": plan,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    })
                    .eq("id", existing.data[0]["id"])
                    .execute()
                )
                return response.data[0]
            else:
                response = (
                    self._client.table("codebase_reports")
                    .insert({
                        "repo_id": repo_id,
                        "user_id": user_id,
                        "report_markdown": report_md,
                        "plan": plan,
                    })
                    .execute()
                )
                return response.data[0]
        except Exception as e:
            logger.warning("Failed to save report to database (table missing?): %s", str(e))
            return {"id": "unsaved", "repo_id": repo_id, "user_id": user_id, "report_markdown": report_md, "plan": plan}

    async def get_report(self, repo_id: str, user_id: str) -> dict[str, Any] | None:
        """Fetch the latest saved report for a repository.

        Returns:
            The database record or None if no report exists.
        """
        try:
            response = (
                self._client.table("codebase_reports")
                .select("*")
                .eq("repo_id", repo_id)
                .eq("user_id", user_id)
                .execute()
            )
            return response.data[0] if response.data else None
        except Exception as e:
            logger.warning("Failed to fetch report from database (table missing?): %s", str(e))
            return None

    async def delete_report(self, repo_id: str, user_id: str) -> None:
        """Delete the saved report for a repository."""
        try:
            self._client.table("codebase_reports").delete().eq(
                "repo_id", repo_id
            ).eq("user_id", user_id).execute()
        except Exception as e:
            logger.warning("Failed to delete report from database: %s", str(e))

    async def check_report_rate_limit(self, user_id: str, repo_id: str) -> bool:
        """Check if user can generate a report for this repo (max 2 per month)."""
        from datetime import date
        month_str = date.today().strftime("%Y-%m-01")
        try:
            response = (
                self._client.table("report_rate_limits")
                .select("*")
                .eq("user_id", user_id)
                .eq("repo_id", repo_id)
                .execute()
            )
            if not response.data:
                return True
            row = response.data[0]
            if row.get("last_report_month") != month_str:
                return True
            return row.get("monthly_count", 0) < 2
        except Exception as e:
            logger.warning("Rate limit check failed (table missing?): %s", str(e))
            return True

    async def increment_report_rate_limit(self, user_id: str, repo_id: str) -> None:
        """Record a report generation event for rate limit tracking."""
        from datetime import date
        month_str = date.today().strftime("%Y-%m-01")
        try:
            response = (
                self._client.table("report_rate_limits")
                .select("*")
                .eq("user_id", user_id)
                .eq("repo_id", repo_id)
                .execute()
            )
            if not response.data:
                self._client.table("report_rate_limits").insert({
                    "user_id": user_id,
                    "repo_id": repo_id,
                    "monthly_count": 1,
                    "last_report_month": month_str,
                }).execute()
            else:
                row = response.data[0]
                count = 0 if row.get("last_report_month") != month_str else row.get("monthly_count", 0)
                self._client.table("report_rate_limits").update({
                    "monthly_count": count + 1,
                    "last_report_month": month_str,
                }).eq("id", row["id"]).execute()
        except Exception as e:
            logger.warning("Failed to increment report rate limit: %s", str(e))

    async def get_report_rate_limit_status(
        self, user_id: str, repo_id: str
    ) -> dict[str, Any]:
        """Check report generation rate limit status for UI notifications."""
        from datetime import date
        can_generate = await self.check_report_rate_limit(user_id, repo_id)
        next_month = date.today().replace(day=28)
        if next_month.month == 12:
            next_month = date(next_month.year + 1, 1, 1)
        else:
            next_month = date(next_month.year, next_month.month + 1, 1)
        return {
            "can_generate": can_generate,
            "next_available": None if can_generate else next_month.isoformat(),
        }

    # ══════════════════════════════════════════════════════════════════════
    #  Subscriptions
    # ══════════════════════════════════════════════════════════════════════

    async def get_user_subscription(self, user_id: str) -> dict | None:
        """Fetch the user's subscription record."""
        try:
            response = (
                self._client.table("user_subscriptions")
                .select("*")
                .eq("user_id", user_id)
                .maybe_single()
                .execute()
            )
            return response.data if response else None
        except Exception as e:
            logger.warning("Failed to fetch subscription from database (table missing?): %s", str(e))
            return None

    async def upsert_user_subscription(
        self, user_id: str, plan: str, expires_at: str | None = None
    ) -> dict:
        """Create or update a user's subscription."""
        from datetime import datetime, timezone
        try:
            response = (
                self._client.table("user_subscriptions")
                .upsert(
                    {
                        "user_id": user_id,
                        "plan": plan,
                        "started_at": datetime.now(timezone.utc).isoformat(),
                        "expires_at": expires_at,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    },
                    on_conflict="user_id",
                )
                .execute()
            )
            return response.data[0] if response and response.data else {}
        except Exception as e:
            logger.warning("Failed to upsert subscription in database: %s", str(e))
            return {}

    # ══════════════════════════════════════════════════════════════════════
    #  Pro Upgrade Requests
    # ══════════════════════════════════════════════════════════════════════

    async def insert_pro_request(self, data: dict) -> dict:
        """Insert a new Pro upgrade request."""
        try:
            response = (
                self._client.table("pro_requests")
                .insert(data)
                .execute()
            )
            return response.data[0] if response and response.data else {}
        except Exception as e:
            logger.error("Failed to insert pro request: %s", str(e))
            raise

    async def get_pro_request_by_user(self, user_id: str) -> dict | None:
        """Get the most recent Pro request for a user."""
        try:
            response = (
                self._client.table("pro_requests")
                .select("*")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if response and response.data and len(response.data) > 0:
                return response.data[0]
            return None
        except Exception as e:
            logger.warning("Failed to fetch pro request for user %s: %s", user_id, str(e))
            return None

    async def list_pro_requests(self, status_filter: str | None = None) -> list[dict]:
        """List all Pro requests, optionally filtered by status."""
        try:
            query = (
                self._client.table("pro_requests")
                .select("*")
                .order("created_at", desc=True)
            )
            if status_filter:
                query = query.eq("status", status_filter)
            response = query.execute()
            return response.data if response and response.data else []
        except Exception as e:
            logger.error("Failed to list pro requests: %s", str(e))
            return []

    async def update_pro_request_status(
        self, request_id: str, status: str, admin_notes: str | None = None
    ) -> dict:
        """Update a Pro request's status to 'approved' or 'rejected'."""
        from datetime import datetime, timezone
        update_data = {
            "status": status,
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
        }
        if admin_notes is not None:
            update_data["admin_notes"] = admin_notes
        try:
            response = (
                self._client.table("pro_requests")
                .update(update_data)
                .eq("id", request_id)
                .execute()
            )
            return response.data[0] if response and response.data else {}
        except Exception as e:
            logger.error("Failed to update pro request %s: %s", request_id, str(e))
            raise

    async def get_pro_request_stats(self) -> dict:
        """Get aggregate counts of Pro requests grouped by status."""
        try:
            response = (
                self._client.table("pro_requests")
                .select("status")
                .execute()
            )
            rows = response.data if response and response.data else []
            stats = {"total": len(rows), "pending": 0, "approved": 0, "rejected": 0}
            for row in rows:
                s = row.get("status", "")
                if s in stats:
                    stats[s] += 1
            return stats
        except Exception as e:
            logger.error("Failed to get pro request stats: %s", str(e))
            return {"total": 0, "pending": 0, "approved": 0, "rejected": 0}

    # ══════════════════════════════════════════════════════════════════════
    #  Website Analytics & Telemetry
    # ══════════════════════════════════════════════════════════════════════

    async def record_page_view(
        self, path: str, visitor_hash: str, referrer: str | None = None
    ) -> None:
        """Record a single anonymized page view."""
        try:
            self._client.table("page_views").insert({
                "path": path,
                "visitor_hash": visitor_hash,
                "referrer": referrer,
            }).execute()
        except Exception as e:
            logger.warning("Failed to record page view (page_views table missing?): %s", str(e))

    async def get_admin_analytics_data(self) -> dict[str, Any]:
        """Fetch comprehensive analytics, 14-day traffic timeline, page breakdown, and system KPIs."""
        from datetime import datetime, date, timedelta, timezone

        today = date.today()
        dates_14 = [(today - timedelta(days=i)) for i in range(13, -1, -1)]
        timeline_dict = {d.isoformat(): {"date": d.strftime("%b %d"), "iso_date": d.isoformat(), "pageviews": 0, "uniques_set": set()} for d in dates_14}

        pageviews_rows: list[dict] = []
        try:
            pv_res = self._client.table("page_views").select("path, visitor_hash, created_at").execute()
            if pv_res and pv_res.data:
                pageviews_rows = pv_res.data
        except Exception as e:
            logger.warning("page_views query failed (table missing?): %s", str(e))

        total_pageviews = len(pageviews_rows)
        all_uniques_set = set()
        today_pv = 0
        today_uniques = set()
        d7_pv = 0
        d7_uniques = set()
        d30_pv = 0
        d30_uniques = set()
        page_counts: dict[str, int] = {}

        now_utc = datetime.now(timezone.utc)
        d7_cutoff = (now_utc - timedelta(days=7)).isoformat()
        d30_cutoff = (now_utc - timedelta(days=30)).isoformat()
        today_iso = today.isoformat()

        for row in pageviews_rows:
            v_hash = row.get("visitor_hash", "anon")
            all_uniques_set.add(v_hash)
            p_path = row.get("path", "/")
            page_counts[p_path] = page_counts.get(p_path, 0) + 1

            c_at = row.get("created_at", "")
            if c_at.startswith(today_iso):
                today_pv += 1
                today_uniques.add(v_hash)
            if c_at >= d7_cutoff:
                d7_pv += 1
                d7_uniques.add(v_hash)
            if c_at >= d30_cutoff:
                d30_pv += 1
                d30_uniques.add(v_hash)

            row_date = c_at[:10]
            if row_date in timeline_dict:
                timeline_dict[row_date]["pageviews"] += 1
                timeline_dict[row_date]["uniques_set"].add(v_hash)

        timeline = []
        for d_key in sorted(timeline_dict.keys()):
            item = timeline_dict[d_key]
            timeline.append({
                "date": item["date"],
                "iso_date": item["iso_date"],
                "pageviews": item["pageviews"],
                "uniques": len(item["uniques_set"]),
            })

        # Top pages breakdown
        top_pages = []
        sorted_pages = sorted(page_counts.items(), key=lambda x: x[1], reverse=True)
        for path_name, count in sorted_pages:
            pct = round((count / total_pageviews * 100), 1) if total_pageviews > 0 else 0
            top_pages.append({"path": path_name, "count": count, "percentage": pct})

        # System Metrics
        repos_count = 0
        try:
            r_res = self._client.table("repos").select("id", count="exact").execute()
            repos_count = r_res.count if r_res and r_res.count is not None else len(r_res.data or [])
        except Exception:
            pass

        chats_count = 0
        try:
            c_res = self._client.table("chat_messages").select("id", count="exact").execute()
            chats_count = c_res.count if c_res and c_res.count is not None else len(c_res.data or [])
        except Exception:
            pass

        reports_count = 0
        try:
            rep_res = self._client.table("codebase_reports").select("id", count="exact").execute()
            reports_count = rep_res.count if rep_res and rep_res.count is not None else len(rep_res.data or [])
        except Exception:
            pass

        pro_stats = await self.get_pro_request_stats()
        pro_total = pro_stats.get("total", 0)
        pro_approved = pro_stats.get("approved", 0)
        conversion_rate = round((pro_approved / pro_total * 100), 1) if pro_total > 0 else 0.0

        return {
            "visitors": {
                "today_pv": today_pv,
                "today_uniques": len(today_uniques),
                "d7_pv": d7_pv,
                "d7_uniques": len(d7_uniques),
                "d30_pv": d30_pv,
                "d30_uniques": len(d30_uniques),
                "total_pv": total_pageviews,
                "total_uniques": len(all_uniques_set),
            },
            "timeline": timeline,
            "top_pages": top_pages,
            "system_kpis": {
                "total_repos": repos_count,
                "total_chats": chats_count,
                "total_reports": reports_count,
                "pro_total": pro_total,
                "pro_pending": pro_stats.get("pending", 0),
                "pro_approved": pro_approved,
                "pro_rejected": pro_stats.get("rejected", 0),
                "conversion_rate": conversion_rate,
            },
        }

    async def get_user_activity_timestamps(self, user_id: str) -> list[dict[str, Any]]:
        """Fetch all user message timestamps and repository sync timestamps with rich metadata."""
        activities: list[dict[str, Any]] = []
        
        # 1. Fetch repositories map to resolve repo names
        repos_map: dict[str, str] = {}
        default_repo_name = "Repository"
        try:
            repo_res = (
                self._client.table("repositories")
                .select("id, github_url, branch, status, created_at")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .execute()
            )
            if repo_res.data:
                for row in repo_res.data:
                    r_id = str(row.get("id", "")).lower()
                    g_url = row.get("github_url", "")
                    r_name = g_url.split("/")[-1] if "/" in g_url else g_url or "Repository"
                    if r_id:
                        repos_map[r_id] = r_name
                    default_repo_name = r_name

                    if row.get("created_at"):
                        activities.append({
                            "id": f"repo-{row.get('id', '')}",
                            "created_at": row["created_at"],
                            "type": "repo",
                            "title": f"Synced codebase {r_name}",
                            "subtitle": f"Branch: {row.get('branch', 'main')} • Status: {row.get('status', 'completed')}",
                            "repo_id": str(row.get('id', '')) if row.get('id') else None,
                            "repo_name": r_name,
                        })
        except Exception as e:
            logger.warning("Failed to fetch user repositories for activity: %s", str(e))

        # 2. Fetch user chat messages
        try:
            msg_res = (
                self._client.table("chat_messages")
                .select("id, created_at, content, role, session_id, repo_id")
                .eq("user_id", user_id)
                .eq("role", "user")
                .order("created_at", desc=True)
                .execute()
            )
            if msg_res.data:
                for row in msg_res.data:
                    if row.get("created_at"):
                        raw_content = row.get("content", "").strip()
                        preview = (raw_content[:80] + "...") if len(raw_content) > 80 else raw_content
                        raw_r_id = str(row.get("repo_id", "") or "")
                        clean_r_id = raw_r_id.lower()
                        
                        r_name = repos_map.get(clean_r_id) or (list(repos_map.values())[0] if len(repos_map) == 1 else default_repo_name)

                        activities.append({
                            "id": f"msg-{row.get('id', '')}",
                            "created_at": row["created_at"],
                            "type": "chat",
                            "title": preview or "Asked AI Code Assistant",
                            "subtitle": f"Codebase: {r_name}",
                            "repo_id": raw_r_id or None,
                            "repo_name": r_name,
                            "session_id": str(row.get("session_id", "")) if row.get("session_id") else None,
                        })
        except Exception as e:
            logger.warning("Failed to fetch user chat_messages for activity: %s", str(e))

        # Sort all activity items descending by created_at
        activities.sort(key=lambda x: x["created_at"], reverse=True)
        return activities





