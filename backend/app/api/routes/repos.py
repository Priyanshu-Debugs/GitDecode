"""
GitMesh — Repos API Routes
============================
Endpoints for repository sync/ingestion management.

Endpoints:
    POST /api/v1/repos/sync       — Initiate a repo ingestion pipeline
    GET  /api/v1/repos/{id}/status — Check ingestion status
"""

from datetime import datetime, timezone
from uuid import UUID

import inngest
from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import require_auth, get_pg, AuthenticatedUser
from app.db.pg_client import SupabasePGClient
from app.schemas.requests import RepoSyncRequest
from app.schemas.responses import RepoSyncResponse, ErrorResponse

router = APIRouter(
    prefix="/repos",
    tags=["repos"],
    responses={
        401: {"model": ErrorResponse, "description": "Not authenticated"},
    },
)

# Inngest client — shared instance for dispatching background events.
# The Inngest serve endpoint is registered in main.py.
inngest_client = inngest.Inngest(app_id="gitmesh")


@router.post(
    "/sync",
    response_model=RepoSyncResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Initiate repository sync",
    description="Accepts a GitHub repository URL and queues it for ingestion. "
    "The ingestion pipeline will clone the repo, parse its code into a "
    "knowledge graph, and generate vector embeddings.",
    responses={
        201: {"description": "Sync job queued successfully"},
        409: {"model": ErrorResponse, "description": "Repository is already being synced"},
        422: {"model": ErrorResponse, "description": "Validation error"},
    },
)
async def sync_repo(
    request: RepoSyncRequest,
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
) -> RepoSyncResponse:
    """Initiate a repository sync/ingestion pipeline.

    1. Creates a repo record in PostgreSQL with status ``"queued"``.
    2. Dispatches an Inngest event to trigger the background ingestion pipeline.
    3. Returns the repo ID and status to the caller.
    """
    # Insert repo record
    repo_row = await pg.insert_repo(
        user_id=user.id,
        github_url=str(request.repo_url),
        branch=request.branch,
    )

    # Dispatch Inngest event to trigger the ingestion pipeline
    await inngest_client.send(
        inngest.Event(
            name="repo/sync.requested",
            data={
                "repo_id": repo_row["id"],
                "user_id": user.id,
                "repo_url": str(request.repo_url),
                "branch": request.branch,
            },
        )
    )

    return RepoSyncResponse(
        repo_id=repo_row["id"],
        status="queued",
        message=f"Repository {request.repo_url} has been queued for ingestion.",
        queued_at=repo_row.get("created_at", datetime.now(timezone.utc)),
    )


@router.get(
    "/{repo_id}/status",
    response_model=RepoSyncResponse,
    summary="Get repository sync status",
    description="Check the current ingestion status of a previously synced repository.",
    responses={
        404: {"model": ErrorResponse, "description": "Repository not found"},
    },
)
async def get_repo_status(
    repo_id: UUID,
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
) -> RepoSyncResponse:
    """Retrieve the current sync status of a repository."""
    repo_row = await pg.get_repo(
        repo_id=str(repo_id),
        user_id=user.id,
    )

    if repo_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository {repo_id} not found or you don't have access to it.",
        )

    return RepoSyncResponse(
        repo_id=repo_row["id"],
        status=repo_row["status"],
        message=f"Repository sync status: {repo_row['status']}",
        queued_at=repo_row["created_at"],
    )
