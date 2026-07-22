"""
GitMesh — Subscription API Router
===================================
Endpoints to check current subscription details and upgrade plans.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional

from app.api.dependencies import require_auth, get_pg, AuthenticatedUser
from app.db.pg_client import SupabasePGClient
from app.services.subscription import get_user_plan, get_plan_limits

router = APIRouter(prefix="/subscription", tags=["subscription"])


class UpgradeRequest(BaseModel):
    plan: str = "pro"


@router.get(
    "",
    summary="Get user subscription info",
    description="Retrieve the current user's subscription tier, started/expiration times, and plan rate limits.",
)
async def get_subscription(
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
) -> dict:
    plan = await get_user_plan(pg, user.id)
    limits = get_plan_limits(plan)
    
    sub_row = await pg.get_user_subscription(user.id)
    
    return {
        "plan": plan,
        "is_pro": plan == "pro",
        "limits": limits,
        "started_at": sub_row.get("started_at") if sub_row else None,
        "expires_at": sub_row.get("expires_at") if sub_row else None,
    }


@router.post(
    "/upgrade",
    summary="Upgrade user subscription",
    description="Upgrade the current user's subscription (Temporary automatic bypass for development testing).",
)
async def upgrade_subscription(
    request: UpgradeRequest,
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
) -> dict:
    if request.plan not in ("free", "pro"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid plan name. Supported plans: 'free', 'pro'.",
        )
        
    await pg.upsert_user_subscription(user_id=user.id, plan=request.plan)
    
    plan = request.plan
    limits = get_plan_limits(plan)
    
    return {
        "status": "success",
        "message": f"Successfully updated subscription to {plan}.",
        "plan": plan,
        "is_pro": plan == "pro",
        "limits": limits,
    }
