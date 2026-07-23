"""
GitDecode — Pro Upgrade Request API Router
==========================================
User-facing endpoints for submitting and checking Pro upgrade requests.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional

from app.api.dependencies import require_auth, get_pg, AuthenticatedUser
from app.db.pg_client import SupabasePGClient

router = APIRouter(prefix="/pro-requests", tags=["pro-requests"])


class ProRequestCreate(BaseModel):
    """Schema for submitting a new Pro upgrade request."""
    first_name: str
    last_name: str
    mobile: str
    email: str
    address: str
    coupon_code: str


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Submit a Pro upgrade request",
    description=(
        "Submit a request to upgrade to the Pro plan using a coupon code. "
        "The request will be reviewed by an admin. "
        "Currently only the coupon code 'GOPROFREE' is accepted."
    ),
)
async def create_pro_request(
    body: ProRequestCreate,
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
) -> dict:
    # 1. Validate coupon code (case-insensitive)
    if body.coupon_code.strip().upper() != "GOPROFREE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid coupon code. Please enter a valid coupon code.",
        )
    
    # 2. Check for existing pending or approved request
    existing = await pg.get_pro_request_by_user(user.id)
    if existing:
        if existing["status"] == "pending":
            return {
                "status": "already_pending",
                "message": "You already have a pending Pro request. Our team is reviewing it.",
                "request": existing,
            }
        if existing["status"] == "approved":
            return {
                "status": "already_approved",
                "message": "Your Pro subscription is already active!",
                "request": existing,
            }
        # If rejected, allow resubmission
    
    # 3. Validate all required fields are non-empty
    for field_name in ["first_name", "last_name", "mobile", "email", "address"]:
        value = getattr(body, field_name, "").strip()
        if not value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{field_name.replace('_', ' ').title()} is required.",
            )
    
    # 4. Insert the request
    data = {
        "user_id": user.id,
        "github_username": user.github_username,
        "github_email": user.email,
        "first_name": body.first_name.strip(),
        "last_name": body.last_name.strip(),
        "mobile": body.mobile.strip(),
        "email": body.email.strip(),
        "address": body.address.strip(),
        "coupon_code": body.coupon_code.strip().upper(),
        "status": "pending",
    }
    
    request_row = await pg.insert_pro_request(data)
    
    return {
        "status": "submitted",
        "message": "Your Pro request has been submitted! Our team will review it and notify you via email.",
        "request": request_row,
    }


@router.get(
    "/status",
    summary="Check Pro request status",
    description="Check if the current user has a pending, approved, or rejected Pro request.",
)
async def get_pro_request_status(
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
) -> dict:
    existing = await pg.get_pro_request_by_user(user.id)
    if not existing:
        return {"has_request": False, "status": None, "request": None}
    
    return {
        "has_request": True,
        "status": existing["status"],
        "request": existing,
    }
