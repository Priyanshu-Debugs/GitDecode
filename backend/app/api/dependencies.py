"""
GitMesh — API Dependencies
============================
Aggregation point for all injectable dependencies used by route handlers.

Route files import from here rather than directly from ``core/`` or ``db/`` —
this makes it trivial to swap implementations for testing (inject mocks via
dependency overrides).
"""

from app.core.security import get_current_user, AuthenticatedUser  # noqa: F401
from app.db.pg_client import SupabasePGClient

# ── Auth dependency alias (for readability in route signatures) ──────
require_auth = get_current_user
"""Alias for ``get_current_user``. Use as ``user = Depends(require_auth)``."""


# ── Database client getters ──────────────────────────────────────────
# These are module-level singletons initialised at startup in main.py
# and set via set_*() functions during the lifespan context.

_pg_client: SupabasePGClient | None = None


def set_pg_client(client: SupabasePGClient) -> None:
    """Set the module-level Supabase PG client (called from main.py lifespan)."""
    global _pg_client
    _pg_client = client


def get_pg() -> SupabasePGClient:
    """Return the Supabase PostgreSQL client singleton.

    Raises:
        RuntimeError: If called before the client is initialized at startup.
    """
    if _pg_client is None:
        raise RuntimeError(
            "Supabase PG client is not initialized. "
            "Ensure the application lifespan has started."
        )
    return _pg_client
