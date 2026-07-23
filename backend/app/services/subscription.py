"""
GitDecode — Subscription Service
===============================
Resolves user subscription plan and returns plan limits.
"""

from app.db.pg_client import SupabasePGClient
from app.core.config import get_settings


async def get_user_plan(pg: SupabasePGClient, user_id: str) -> str:
    """Resolve user plan tier: 'free' or 'pro'."""
    row = await pg.get_user_subscription(user_id)
    if not row:
        return "free"
        
    # Check expiry if applicable
    expires_at = row.get("expires_at")
    if expires_at:
        from datetime import datetime, timezone
        try:
            expires = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if expires < datetime.now(timezone.utc):
                return "free"
        except Exception:
            pass
            
    return row.get("plan", "free")


def get_plan_limits(plan: str) -> dict:
    """Get limit parameters for the plan tier."""
    settings = get_settings()
    if plan == "pro":
        return {
            "daily_msg_limit": settings.PRO_DAILY_MSG_LIMIT,
            "monthly_msg_limit": settings.PRO_MONTHLY_MSG_LIMIT,
            "repo_limit": settings.PRO_REPO_LIMIT,
            "monthly_report_limit": settings.PRO_MONTHLY_REPORT_LIMIT,
        }
    return {
        "daily_msg_limit": settings.FREE_DAILY_MSG_LIMIT,
        "monthly_msg_limit": settings.FREE_MONTHLY_MSG_LIMIT,
        "repo_limit": settings.FREE_REPO_LIMIT,
        "monthly_report_limit": settings.FREE_MONTHLY_REPORT_LIMIT,
    }
