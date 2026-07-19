"""
GitMesh — Supabase / PostgreSQL Client
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
            .maybe_single()
            .execute()
        )
        return response.data

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

    async def toggle_repo_active_status(
        self,
        repo_id: str,
        user_id: str,
        is_active: bool,
    ) -> dict[str, Any]:
        """Update the active status of a repository."""
        response = (
            self._client.table("repos")
            .update({"is_active": is_active})
            .eq("id", repo_id)
            .eq("user_id", user_id)
            .execute()
        )
        repo = await self.get_repo(repo_id, user_id)
        if not repo:
            logger.error("Failed to update repo active status: repository %s not found for user %s", repo_id, user_id)
            return {}
        logger.info("Updated repo %s active status to '%s'", repo_id, is_active)
        return repo

    async def get_active_repo_count(self, user_id: str) -> int:
        """Get the number of active repositories for a user."""
        response = (
            self._client.table("repos")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .eq("is_active", True)
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
