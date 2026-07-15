import logging
import datetime
import os
from typing import Any, Dict, List, Optional
from google import genai
from google.genai import types
from app.core.config import get_settings
from app.db.pg_client import SupabasePGClient

logger = logging.getLogger(__name__)

class ContextCacheManager:
    """
    Manages Gemini Context Caching for repositories.
    Caches the entire repository context (system instructions, file tree, all files)
    if the codebase exceeds the Gemini caching threshold of 32,768 tokens.
    """

    def __init__(self, pg_client: SupabasePGClient) -> None:
        self.pg_client = pg_client
        self.settings = get_settings()
        # Initialize Google GenAI Client
        api_key = os.environ.get("GOOGLE_API_KEY")
        if api_key:
            self.client = genai.Client(api_key=api_key)
        else:
            self.client = None
            logger.warning("GOOGLE_API_KEY is not set in the environment.")

    def _estimate_tokens(self, text: str) -> int:
        """Simple heuristic for token estimation (roughly 4 characters per token)."""
        return len(text) // 4

    def format_codebase_for_cache(
        self,
        github_url: str,
        files: List[Dict[str, Any]]
    ) -> str:
        """
        Formats all repository files and structures into a single payload for caching.
        """
        repo_name = github_url.split("/")[-1]
        
        parts = [
            f"You are GitMesh, an expert AI software engineer analyzing the '{repo_name}' codebase.",
            "Always cite file paths and line numbers when answering questions.",
            "\n=== REPOSITORY STRUCTURE / FILE TREE ==="
        ]
        
        # Add file tree
        for f in sorted(files, key=lambda x: x["file_path"]):
            parts.append(f"- {f['file_path']} ({f.get('size_bytes', 0)} bytes)")
            
        parts.append("\n=== FULL CODEBASE FILE CONTENTS ===")
        
        # Add all file contents
        for f in sorted(files, key=lambda x: x["file_path"]):
            parts.append(
                f"--- FILE: {f['file_path']} ---\n"
                f"{f['content']}\n"
            )
            
        return "\n".join(parts)

    async def get_or_create_cache(
        self,
        repo_id: str,
        user_id: str,
        model_name: str = "gemini-3.1-flash-lite"
    ) -> Optional[str]:
        """
        Checks if a valid cache exists for the repository. If not, creates one if the
        codebase is large enough (>= 32,768 tokens).
        Returns the cache name (e.g. 'cachedContents/xxxx') or None if caching is not applicable.
        """
        if not self.client:
            logger.error("GenAI client not initialized.")
            return None

        # 1. Fetch graph metadata to check for existing cache
        graph_record = await self.pg_client.get_repo_graph(repo_id, user_id)
        if not graph_record:
            logger.warning("No code graph record found for repo %s. Cannot check cache.", repo_id)
            return None

        stats = graph_record.get("stats", {})
        cache_name = stats.get("cache_name")
        cache_expires_at_str = stats.get("cache_expires_at")
        
        # 2. Check if existing cache is still valid
        if cache_name and cache_expires_at_str:
            try:
                # Expiration from google-genai can be string like "2026-07-15T18:00:40Z" or datetime
                clean_time = cache_expires_at_str.replace("Z", "+00:00")
                expires_at = datetime.datetime.fromisoformat(clean_time)
                # If cache is valid for at least another 2 minutes, reuse it
                if expires_at > datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=2):
                    logger.info("Found valid cached context: %s, expires at: %s", cache_name, cache_expires_at_str)
                    return cache_name
            except Exception as e:
                logger.error("Failed to parse cache expiration timestamp: %s", str(e))

        # 3. Cache does not exist or is expired. Load codebase files to rebuild cache.
        logger.info("No active cache found for repo %s. Attempting to create one...", repo_id)
        repo_info = await self.pg_client.get_repo(repo_id, user_id)
        if not repo_info:
            logger.error("Repository record not found for repo_id: %s", repo_id)
            return None

        all_files = await self.pg_client.get_all_repo_files(repo_id, user_id)
        if not all_files:
            logger.info("Repository has no files. Skipping cache.")
            return None

        # 4. Format codebase and count tokens
        formatted_content = self.format_codebase_for_cache(repo_info["github_url"], all_files)
        estimated_tokens = self._estimate_tokens(formatted_content)
        
        # Gemini caching requires a minimum of 32,768 tokens
        MIN_TOKENS_FOR_CACHING = 32768
        if estimated_tokens < MIN_TOKENS_FOR_CACHING:
            logger.info("Codebase is too small for context caching (estimated %d tokens, minimum is %d). Skipping.", 
                        estimated_tokens, MIN_TOKENS_FOR_CACHING)
            return None

        # 5. Create Gemini Cached Content
        try:
            logger.info("Creating Gemini Cached Content for model: %s (estimated tokens: %d)", model_name, estimated_tokens)
            
            # Map model name
            model_endpoint = model_name
            if model_endpoint.startswith("models/"):
                model_endpoint = model_endpoint.replace("models/", "")

            # Create cache with 1 hour TTL using new client.caches.create
            cache = self.client.caches.create(
                model=model_endpoint,
                config=types.CreateCachedContentConfig(
                    contents=[formatted_content],
                    ttl="3600s",
                    display_name=f"gitmesh_cache_{repo_id}"
                )
            )
            
            expires_at_str = str(cache.expire_time)
            
            # 6. Save cache metadata back to PostgreSQL stats
            stats["cache_name"] = cache.name
            stats["cache_expires_at"] = expires_at_str
            await self.pg_client.save_repo_graph(
                repo_id=repo_id,
                user_id=user_id,
                graph_data=graph_record.get("graph_data", {}),
                stats=stats
            )
            
            logger.info("Successfully created and saved context cache: %s (expires: %s)", cache.name, expires_at_str)
            return cache.name
            
        except Exception as e:
            logger.exception("Failed to create context cache in Gemini API: %s", str(e))
            return None
