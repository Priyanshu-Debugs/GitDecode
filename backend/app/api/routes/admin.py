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
    return await pg.list_pro_requests(status_filter)


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
        "1) Update the request status to 'approved', "
        "2) Grant the user Pro subscription for 1 year, "
        "3) Send an approval notification email to the user."
    ),
)
async def approve_pro_request(
    request_id: str,
    body: AdminActionRequest = AdminActionRequest(),
    admin: dict = Depends(require_admin),
    pg: SupabasePGClient = Depends(get_pg),
) -> dict:
    # 1. Update request status
    updated = await pg.update_pro_request_status(
        request_id=request_id,
        status="approved",
        admin_notes=body.admin_notes,
    )
    
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pro request not found.",
        )
    
    # 2. Grant Pro subscription for 1 year
    user_id = updated.get("user_id")
    expires_at = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
    await pg.upsert_user_subscription(
        user_id=user_id,
        plan="pro",
        expires_at=expires_at,
    )
    
    # 3. Send approval email (non-blocking)
    try:
        await send_pro_approval_email(
            to_email=updated.get("email", ""),
            first_name=updated.get("first_name", ""),
            github_username=updated.get("github_username", ""),
        )
        logger.info("Approval email sent to %s", updated.get("email"))
    except Exception as e:
        logger.error("Failed to send approval email: %s", str(e))
    
    return {
        "status": "approved",
        "message": f"Pro request approved. User {updated.get('github_username', '')} now has Pro for 1 year.",
        "request": updated,
    }


@router.post(
    "/pro-requests/{request_id}/reject",
    summary="Reject a Pro request",
    description=(
        "Reject a Pro upgrade request. This will: "
        "1) Update the request status to 'rejected', "
        "2) Send a rejection notification email to the user."
    ),
)
async def reject_pro_request(
    request_id: str,
    body: AdminActionRequest = AdminActionRequest(),
    admin: dict = Depends(require_admin),
    pg: SupabasePGClient = Depends(get_pg),
) -> dict:
    updated = await pg.update_pro_request_status(
        request_id=request_id,
        status="rejected",
        admin_notes=body.admin_notes,
    )
    
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pro request not found.",
        )
    
    # Send rejection email (non-blocking)
    try:
        await send_pro_rejection_email(
            to_email=updated.get("email", ""),
            first_name=updated.get("first_name", ""),
            github_username=updated.get("github_username", ""),
        )
        logger.info("Rejection email sent to %s", updated.get("email"))
    except Exception as e:
        logger.error("Failed to send rejection email: %s", str(e))
    
    return {
        "status": "rejected",
        "message": f"Pro request rejected for user {updated.get('github_username', '')}.",
        "request": updated,
    }
