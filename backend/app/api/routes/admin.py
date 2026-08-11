"""
GitDecode — Admin Panel API Router
==================================
Password-protected admin endpoints for managing Pro upgrade requests.

Authentication flow:
1. Admin posts password to /admin/login
2. Backend validates against ADMIN_PASSWORD env var
3. Returns a short-lived JWT (24h) signed with ADMIN_JWT_SECRET
4. All /admin/* endpoints require this JWT via the require_admin dependency
"""

import logging
from datetime import datetime, timezone, timedelta

import jwt
from fastapi import APIRouter, Depends, HTTPException, status, Header
from pydantic import BaseModel
from typing import Optional

from app.core.config import get_settings
from app.api.dependencies import get_pg
from app.db.pg_client import SupabasePGClient
from app.services.email_service import send_pro_approval_email, send_pro_rejection_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


# ── Admin Auth ───────────────────────────────────────────────────────

class AdminLoginRequest(BaseModel):
    password: str

class AdminActionRequest(BaseModel):
    admin_notes: Optional[str] = None

class ApproveProRequest(BaseModel):
    admin_notes: Optional[str] = None
    duration_days: Optional[int] = 365

class UpdateSubscriptionRequest(BaseModel):
    plan: str = "pro"
    duration_days: Optional[int] = None
    expires_at: Optional[str] = None


def create_admin_token() -> str:
    """Generate a short-lived admin JWT (24 hours)."""
    settings = get_settings()
    payload = {
        "role": "admin",
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
    }
    return jwt.encode(payload, settings.ADMIN_JWT_SECRET, algorithm="HS256")


def require_admin(authorization: str = Header(..., alias="Authorization")) -> dict:
    """FastAPI dependency that validates the admin JWT from Authorization header."""
    settings = get_settings()
    
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )
    
    token = authorization[7:]  # Strip "Bearer " prefix
    
    try:
        payload = jwt.decode(token, settings.ADMIN_JWT_SECRET, algorithms=["HS256"])
        if payload.get("role") != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not an admin token",
            )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin session has expired. Please log in again.",
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin token",
        )


# ── Endpoints ────────────────────────────────────────────────────────

@router.post(
    "/login",
    summary="Admin login",
    description="Validate admin password and return a short-lived admin JWT (24h).",
)
async def admin_login(body: AdminLoginRequest) -> dict:
    settings = get_settings()
    
    if body.password != settings.ADMIN_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin password.",
        )
    
    token = create_admin_token()
    return {"token": token, "expires_in": 86400}  # 24 hours in seconds


@router.get(
    "/pro-requests",
    summary="List all Pro requests",
    description="List all Pro upgrade requests. Optionally filter by status (pending/approved/rejected).",
)
async def list_pro_requests(
    status_filter: Optional[str] = None,
    admin: dict = Depends(require_admin),
    pg: SupabasePGClient = Depends(get_pg),
) -> list[dict]:
    if status_filter and status_filter not in ("pending", "approved", "rejected"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid status filter. Use: pending, approved, or rejected.",
        )
    reqs = await pg.list_pro_requests(status_filter)
    auth_users = await pg.list_auth_users()
    user_avatar_map = {str(u.get("id")).lower(): u.get("user_metadata", {}).get("avatar_url") for u in auth_users}
    
    extended_reqs = []
    for r in reqs:
        uid = str(r.get("user_id")).lower()
        extended_reqs.append({
            **r,
            "avatar_url": user_avatar_map.get(uid),
        })
    return extended_reqs


@router.get(
    "/pro-requests/stats",
    summary="Pro request statistics",
    description="Get aggregate counts of Pro requests (total, pending, approved, rejected).",
)
async def get_pro_request_stats(
    admin: dict = Depends(require_admin),
    pg: SupabasePGClient = Depends(get_pg),
) -> dict:
    return await pg.get_pro_request_stats()


@router.post(
    "/pro-requests/{request_id}/approve",
    summary="Approve a Pro request",
    description=(
        "Approve a Pro upgrade request. This will: "
        "1) Verify the request isn't already approved, "
        "2) Update the request status to 'approved', "
        "3) Grant the user Pro subscription for custom duration, "
        "4) Send an approval notification email (non-blocking)."
    ),
)
async def approve_pro_request(
    request_id: str,
    body: ApproveProRequest = ApproveProRequest(),
    admin: dict = Depends(require_admin),
    pg: SupabasePGClient = Depends(get_pg),
) -> dict:
    # 1. Fetch current request directly
    target_req = await pg.get_pro_request_by_id(request_id)
    if not target_req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pro request not found.",
        )
        
    if target_req.get("status") == "approved":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This request is already approved.",
        )
        
    # 2. Update request status in DB first
    updated = await pg.update_pro_request_status(
        request_id=request_id,
        status="approved",
        admin_notes=body.admin_notes,
    )
    
    # 3. Grant Pro subscription
    user_id = updated.get("user_id")
    duration = body.duration_days if body.duration_days is not None else 365
    expires_at = (datetime.now(timezone.utc) + timedelta(days=duration)).isoformat()
    await pg.upsert_user_subscription(
        user_id=user_id,
        plan="pro",
        expires_at=expires_at,
    )
    
    # 4. Trigger email asynchronously (non-blocking)
    email_warning = None
    try:
        success = await send_pro_approval_email(
            to_email=target_req.get("email", ""),
            first_name=target_req.get("first_name", ""),
            github_username=target_req.get("github_username", ""),
        )
        if not success:
            email_warning = "Email notification could not be sent (SMTP error or credentials not configured)."
    except Exception as e:
        logger.error("Failed to send approval email: %s", str(e))
        email_warning = f"Failed to send email: {str(e)}"
        
    return {
        "status": "approved",
        "message": f"Pro request approved. User {updated.get('github_username', '')} now has Pro for {duration} days.",
        "request": updated,
        "warning": email_warning,
    }


@router.post(
    "/pro-requests/{request_id}/reject",
    summary="Reject a Pro request",
    description=(
        "Reject a Pro upgrade request. This will: "
        "1) Verify the request isn't already rejected, "
        "2) Update the request status to 'rejected', "
        "3) Send a rejection notification email (non-blocking)."
    ),
)
async def reject_pro_request(
    request_id: str,
    body: AdminActionRequest = AdminActionRequest(),
    admin: dict = Depends(require_admin),
    pg: SupabasePGClient = Depends(get_pg),
) -> dict:
    # 1. Fetch current request directly
    target_req = await pg.get_pro_request_by_id(request_id)
    if not target_req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pro request not found.",
        )
        
    if target_req.get("status") == "rejected":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This request is already rejected.",
        )
        
    # 2. Update request status in DB
    updated = await pg.update_pro_request_status(
        request_id=request_id,
        status="rejected",
        admin_notes=body.admin_notes,
    )
    
    # 3. Trigger email asynchronously (non-blocking)
    email_warning = None
    try:
        success = await send_pro_rejection_email(
            to_email=target_req.get("email", ""),
            first_name=target_req.get("first_name", ""),
            github_username=target_req.get("github_username", ""),
        )
        if not success:
            email_warning = "Email notification could not be sent (SMTP error or credentials not configured)."
    except Exception as e:
        logger.error("Failed to send rejection email: %s", str(e))
        email_warning = f"Failed to send email: {str(e)}"
        
    return {
        "status": "rejected",
        "message": f"Pro request rejected for user {updated.get('github_username', '')}.",
        "request": updated,
        "warning": email_warning,
    }


@router.delete(
    "/pro-requests/{request_id}",
    summary="Delete a Pro request",
    description="Hard-delete a Pro request from the database.",
)
async def delete_pro_request(
    request_id: str,
    admin: dict = Depends(require_admin),
    pg: SupabasePGClient = Depends(get_pg),
) -> dict:
    success = await pg.delete_pro_request(request_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete pro request from the database.",
        )
    return {"status": "success", "message": "Pro request successfully deleted."}


@router.get(
    "/users",
    summary="List all users",
    description="List all Supabase Auth users with active subscription details, repo, and chat counts.",
)
async def list_users(
    admin: dict = Depends(require_admin),
    pg: SupabasePGClient = Depends(get_pg),
) -> list[dict]:
    auth_users = await pg.list_auth_users()
    
    extended_users = []
    for u in auth_users:
        user_id = u.get("id")
        plan = "free"
        subscription = await pg.get_user_subscription(user_id)
        if subscription:
            expires_at = subscription.get("expires_at")
            plan = subscription.get("plan", "free")
            if expires_at:
                try:
                    expires = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                    if expires < datetime.now(timezone.utc):
                        plan = "free"
                except Exception:
                    pass
        
        repos_count = await pg.get_user_repos_count(user_id)
        chats_count = await pg.get_user_chats_count(user_id)
        
        extended_users.append({
            "id": user_id,
            "email": u.get("email"),
            "created_at": u.get("created_at"),
            "last_sign_in_at": u.get("last_sign_in_at"),
            "user_metadata": u.get("user_metadata") or {},
            "app_metadata": u.get("app_metadata") or {},
            "plan": plan,
            "subscription": subscription,
            "repos_count": repos_count,
            "chats_count": chats_count,
        })
    return extended_users


@router.get(
    "/users/{user_id}",
    summary="Get user details",
    description="Get single user details including repository names, chat counts, and activity logs.",
)
async def get_user_detail(
    user_id: str,
    admin: dict = Depends(require_admin),
    pg: SupabasePGClient = Depends(get_pg),
) -> dict:
    u = await pg.get_auth_user(user_id)
    if not u:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found."
        )
    subscription = await pg.get_user_subscription(user_id)
    repos_count = await pg.get_user_repos_count(user_id)
    chats_count = await pg.get_user_chats_count(user_id)
    activity = await pg.get_user_activity_timestamps(user_id)
    
    return {
        "id": user_id,
        "email": u.get("email"),
        "created_at": u.get("created_at"),
        "last_sign_in_at": u.get("last_sign_in_at"),
        "user_metadata": u.get("user_metadata") or {},
        "app_metadata": u.get("app_metadata") or {},
        "subscription": subscription,
        "repos_count": repos_count,
        "chats_count": chats_count,
        "activity": activity
    }


@router.get(
    "/subscriptions",
    summary="List all user subscriptions",
    description="List all active user subscriptions joined with user emails.",
)
async def list_subscriptions(
    admin: dict = Depends(require_admin),
    pg: SupabasePGClient = Depends(get_pg),
) -> list[dict]:
    subs = await pg.list_all_subscriptions()
    auth_users = await pg.list_auth_users()
    
    user_map = {}
    for u in auth_users:
        uid = u.get("id")
        if uid:
            metadata = u.get("user_metadata") or {}
            user_map[str(uid).lower()] = {
                "email": u.get("email") or "unknown_email",
                "name": metadata.get("full_name") or metadata.get("name") or "No Name",
                "avatar_url": metadata.get("avatar_url"),
            }
            
    extended_subs = []
    for s in subs:
        uid = str(s.get("user_id")).lower()
        user_info = user_map.get(uid, {"email": "unknown_email", "name": "unknown_user", "avatar_url": None})
        extended_subs.append({
            **s,
            "email": user_info["email"],
            "name": user_info["name"],
            "avatar_url": user_info["avatar_url"],
        })
    return extended_subs


@router.put(
    "/subscriptions/{user_id}",
    summary="Update or create user subscription",
    description="Update plan tier and/or set a custom expiry for a user's subscription.",
)
async def update_user_subscription(
    user_id: str,
    body: UpdateSubscriptionRequest,
    admin: dict = Depends(require_admin),
    pg: SupabasePGClient = Depends(get_pg),
) -> dict:
    expires_at = body.expires_at
    if body.duration_days is not None:
        expires_at = (datetime.now(timezone.utc) + timedelta(days=body.duration_days)).isoformat()
        
    updated = await pg.upsert_user_subscription(
        user_id=user_id,
        plan=body.plan,
        expires_at=expires_at,
    )
    return {
        "status": "success",
        "message": f"Subscription updated to plan '{body.plan}' successfully.",
        "subscription": updated
    }


@router.delete(
    "/subscriptions/{user_id}",
    summary="Revoke user subscription (set back to Free)",
    description="Remove the user's subscription record, causing them to fall back to the Free tier.",
)
async def revoke_user_subscription(
    user_id: str,
    admin: dict = Depends(require_admin),
    pg: SupabasePGClient = Depends(get_pg),
) -> dict:
    success = await pg.delete_user_subscription(user_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to revoke user subscription.",
        )
    return {"status": "success", "message": "Subscription successfully deleted/revoked."}
