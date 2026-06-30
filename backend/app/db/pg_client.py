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
    ) -> dict[str, Any]:
        """Update the sync status of a repository.

        Args:
            repo_id: The repository UUID.
            user_id: The owner's user UUID (for RLS filtering).
            status: New status (``"queued"``, ``"processing"``, ``"completed"``, ``"failed"``).

        Returns:
            The updated row as a dictionary.
        """
        response = (
            self._client.table("repos")
            .update({"status": status})
            .eq("id", repo_id)
            .eq("user_id", user_id)
            .execute()
        )
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

    # ══════════════════════════════════════════════════════════════════════
    #  Vector Chunks (pgvector)
    # ══════════════════════════════════════════════════════════════════════

    async def insert_vector_chunks(
        self,
        chunks: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Bulk-insert vector embedding chunks.

        Each chunk dict should contain::

            {
                "repo_id": str,
                "user_id": str,
                "file_path": str,
                "chunk_index": int,
                "content": str,
                "node_type": str | None,    # "file" | "class" | "function" | "route"
                "node_name": str | None,
                "start_line": int | None,
                "end_line": int | None,
                "embedding": list[float],   # 768-dimensional (nomic-embed-code)
                "metadata": dict | None,
            }

        Args:
            chunks: List of chunk dictionaries to insert.

        Returns:
            The inserted rows.
        """
        response = (
            self._client.table("vector_chunks")
            .insert(chunks)
            .execute()
        )
        logger.info("Inserted %d vector chunks", len(response.data))
        return response.data

    async def search_vectors(
        self,
        repo_id: str,
        user_id: str,
        embedding: list[float],
        match_count: int = 5,
        threshold: float = 0.78,
    ) -> list[dict[str, Any]]:
        """Perform pgvector similarity search via the ``match_vectors`` SQL function.

        This calls the server-side ``match_vectors`` Postgres function which:
        1. Accepts the embedding as ``float8[]`` and casts to ``vector`` internally.
        2. Uses cosine distance (``<=>``) for similarity.
        3. Filters by ``repo_id`` and ``user_id`` for data isolation.

        Args:
            repo_id: Scope search to this repository.
            user_id: Scope search to this user (RLS defense-in-depth).
            embedding: The query embedding (768-dimensional float list).
            match_count: Maximum number of results to return.
            threshold: Minimum similarity score (0.0–1.0).

        Returns:
            List of matching chunks, ordered by descending similarity.
        """
        response = self._client.rpc(
            "match_vectors",
            {
                "p_repo_id": repo_id,
                "p_user_id": user_id,
                "p_embedding": embedding,
                "p_match_count": match_count,
                "p_match_threshold": threshold,
            },
        ).execute()
        return response.data

    async def delete_repo_chunks(
        self,
        repo_id: str,
        user_id: str,
    ) -> None:
        """Delete all vector chunks for a repository.

        Used before re-ingestion to avoid stale embeddings.

        Args:
            repo_id: The repository UUID.
            user_id: The owner's user UUID (for RLS filtering).
        """
        (
            self._client.table("vector_chunks")
            .delete()
            .eq("repo_id", repo_id)
            .eq("user_id", user_id)
            .execute()
        )
        logger.info(
            "Deleted vector chunks for repo %s, user %s", repo_id, user_id
        )

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
