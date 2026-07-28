"""
GitDecode — Analytics & Visitor Telemetry API Router
=====================================================
Public non-blocking pageview beaconing and password-protected admin analytics data.
"""

import hashlib
import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel

from app.api.dependencies import get_pg
from app.api.routes.admin import require_admin
from app.db.pg_client import SupabasePGClient

logger = logging.getLogger(__name__)

router = APIRouter(tags=["analytics"])


class PageViewRequest(BaseModel):
    """Schema for pageview ping."""
    path: str
    referrer: Optional[str] = None


@router.post(
    "/analytics/pageview",
    status_code=status.HTTP_200_OK,
    summary="Record pageview ping",
    description="Lightweight non-blocking endpoint to record an anonymous page visit.",
)
async def record_page_view(
    body: PageViewRequest,
    request: Request,
    pg: SupabasePGClient = Depends(get_pg),
) -> dict[str, str]:
    """Extract client IP, compute daily anonymized visitor hash, and log pageview."""
    client_ip = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()

    # Anonymous SHA-256 hash using daily rotating salt (no raw IP stored)
    raw_str = f"{client_ip}-{date.today().isoformat()}"
    visitor_hash = hashlib.sha256(raw_str.encode("utf-8")).hexdigest()[:16]

    clean_path = body.path.split("?")[0].split("#")[0] or "/"

    await pg.record_page_view(
        path=clean_path,
        visitor_hash=visitor_hash,
        referrer=body.referrer,
    )

    return {"status": "ok"}


@router.get(
    "/admin/analytics",
    summary="Get Admin Telemetry & Graph Analytics",
    description="Returns 14-day traffic timeline, page popularity, and system KPIs for the admin dashboard.",
)
async def get_admin_analytics(
    _admin: dict = Depends(require_admin),
    pg: SupabasePGClient = Depends(get_pg),
) -> dict:
    """Fetch complete telemetry dictionary."""
    data = await pg.get_admin_analytics_data()
    return data
