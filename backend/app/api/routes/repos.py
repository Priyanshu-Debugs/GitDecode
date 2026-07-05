"""
GitMesh — Repos API Routes
============================
Endpoints for repository sync/ingestion management.

Endpoints:
    POST /api/v1/repos/sync       — Initiate a repo ingestion pipeline
    GET  /api/v1/repos             — List all repos for the authenticated user
    GET  /api/v1/repos/{id}/status — Check ingestion status
    GET  /api/v1/repos/{id}/graph-stats — Get graph statistics
    GET  /api/v1/repos/{id}/dependency-graph — Get dependency graph data
    GET  /api/v1/repos/{id}/blast-radius — Get blast radius analysis
    DELETE /api/v1/repos/{id}      — Delete a repo and its data
"""

from datetime import datetime, timezone
from uuid import UUID

import inngest
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.dependencies import require_auth, get_pg, get_neo4j, AuthenticatedUser
from app.db.pg_client import SupabasePGClient
from app.db.neo4j_client import Neo4jClient
from app.schemas.requests import RepoSyncRequest
from app.schemas.responses import (
    RepoSyncResponse,
    RepoListItem,
    GraphStatsResponse,
    DependencyGraphResponse,
    BlastRadiusResponse,
    ErrorResponse,
    CallGraphResponse,
    ClassGraphResponse,
)

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
    "",
    response_model=list[RepoListItem],
    summary="List all repositories",
    description="Returns all repositories for the authenticated user, ordered by most recent first.",
)
async def list_repos(
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
) -> list[RepoListItem]:
    """List all repositories for the authenticated user."""
    repos = await pg.get_user_repos(user_id=user.id)
    return [RepoListItem(**row) for row in repos]


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
        message=repo_row.get("error_message") or f"Repository sync status: {repo_row['status']}",
        detailed_status=repo_row.get("detailed_status") or repo_row["status"],
        error_message=repo_row.get("error_message"),
        queued_at=repo_row["created_at"],
    )


@router.get(
    "/{repo_id}/graph-stats",
    response_model=GraphStatsResponse,
    summary="Get graph statistics",
    description="Returns aggregate node/edge counts from the knowledge graph.",
    responses={
        404: {"model": ErrorResponse, "description": "Repository not found"},
    },
)
async def get_graph_stats(
    repo_id: UUID,
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
    neo4j: Neo4jClient = Depends(get_neo4j),
) -> GraphStatsResponse:
    """Get knowledge graph statistics for a repository."""
    # Verify ownership
    repo_row = await pg.get_repo(repo_id=str(repo_id), user_id=user.id)
    if repo_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository {repo_id} not found.",
        )

    stats = await neo4j.get_graph_stats(repo_id=str(repo_id))
    return GraphStatsResponse(**stats)


@router.get(
    "/{repo_id}/dependency-graph",
    response_model=DependencyGraphResponse,
    summary="Get dependency graph",
    description="Returns file nodes and import edges for visualization.",
    responses={
        404: {"model": ErrorResponse, "description": "Repository not found"},
    },
)
async def get_dependency_graph(
    repo_id: UUID,
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
    neo4j: Neo4jClient = Depends(get_neo4j),
) -> DependencyGraphResponse:
    """Get the dependency graph for visualization."""
    repo_row = await pg.get_repo(repo_id=str(repo_id), user_id=user.id)
    if repo_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository {repo_id} not found.",
        )

    graph_data = await neo4j.get_dependency_graph(repo_id=str(repo_id))
    return DependencyGraphResponse(**graph_data)


@router.get(
    "/{repo_id}/blast-radius",
    response_model=BlastRadiusResponse,
    summary="Get blast radius analysis",
    description="Analyzes the downstream impact of changing a specific file.",
    responses={
        404: {"model": ErrorResponse, "description": "Repository not found"},
    },
)
async def get_blast_radius(
    repo_id: UUID,
    file_path: str = Query(..., description="Path of the file to analyze"),
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
    neo4j: Neo4jClient = Depends(get_neo4j),
) -> BlastRadiusResponse:
    """Get the blast radius for a specific file."""
    repo_row = await pg.get_repo(repo_id=str(repo_id), user_id=user.id)
    if repo_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository {repo_id} not found.",
        )

    result = await neo4j.get_blast_radius(
        repo_id=str(repo_id),
        file_path=file_path,
    )
    return BlastRadiusResponse(**result)


@router.delete(
    "/{repo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a repository",
    description="Deletes a repository and all associated graph data and vector chunks.",
    responses={
        404: {"model": ErrorResponse, "description": "Repository not found"},
    },
)
async def delete_repo(
    repo_id: UUID,
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
    neo4j: Neo4jClient = Depends(get_neo4j),
) -> None:
    """Delete a repository and all its associated data."""
    repo_row = await pg.get_repo(repo_id=str(repo_id), user_id=user.id)
    if repo_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository {repo_id} not found.",
        )

    # Delete vector chunks, graph data, then the repo record
    await pg.delete_repo_chunks(repo_id=str(repo_id), user_id=user.id)
    await neo4j.delete_repo_graph(repo_id=str(repo_id))
    await pg.delete_repo(repo_id=str(repo_id), user_id=user.id)


@router.get(
    "/{repo_id}/call-graph",
    response_model=CallGraphResponse,
    summary="Get function call graph",
    description="Returns functions and CALLS relationships for visualization.",
    responses={
        404: {"model": ErrorResponse, "description": "Repository not found"},
    },
)
async def get_call_graph(
    repo_id: UUID,
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
    neo4j: Neo4jClient = Depends(get_neo4j),
) -> CallGraphResponse:
    """Get call graph for visualizer."""
    repo_row = await pg.get_repo(repo_id=str(repo_id), user_id=user.id)
    if repo_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository {repo_id} not found.",
        )
    data = await neo4j.get_call_graph(repo_id=str(repo_id))
    return CallGraphResponse(**data)


@router.get(
    "/{repo_id}/class-graph",
    response_model=ClassGraphResponse,
    summary="Get class methods graph",
    description="Returns classes and their methods for visualization.",
    responses={
        404: {"model": ErrorResponse, "description": "Repository not found"},
    },
)
async def get_class_graph(
    repo_id: UUID,
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
    neo4j: Neo4jClient = Depends(get_neo4j),
) -> ClassGraphResponse:
    """Get class/methods graph for visualizer."""
    repo_row = await pg.get_repo(repo_id=str(repo_id), user_id=user.id)
    if repo_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository {repo_id} not found.",
        )
    data = await neo4j.get_class_graph(repo_id=str(repo_id))
    return ClassGraphResponse(**data)


@router.get(
    "/{repo_id}/summary",
    summary="Get repository structural summary",
    description="Returns high-level statistics like language breakdown and counts.",
    responses={
        404: {"model": ErrorResponse, "description": "Repository not found"},
    },
)
async def get_repo_summary(
    repo_id: UUID,
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
    neo4j: Neo4jClient = Depends(get_neo4j),
) -> dict:
    """Get repository structural summary statistics."""
    repo_row = await pg.get_repo(repo_id=str(repo_id), user_id=user.id)
    if repo_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository {repo_id} not found.",
        )
    return await neo4j.get_repo_summary(repo_id=str(repo_id))


@router.get(
    "/{repo_id}/diagrams",
    summary="Get repository diagrams",
    description="Returns pre-generated or on-the-fly generated architecture, user flow, and data flow diagrams.",
    responses={
        404: {"model": ErrorResponse, "description": "Repository not found"},
    },
)
async def get_diagrams(
    repo_id: UUID,
    force_refresh: bool = Query(False, description="Force regeneration of diagrams"),
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
    neo4j: Neo4jClient = Depends(get_neo4j),
) -> dict:
    """Get Mermaid diagrams (Architecture, User Flow, Data Flow) for a repository."""
    repo_row = await pg.get_repo(repo_id=str(repo_id), user_id=user.id)
    if repo_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository {repo_id} not found.",
        )

    # Check if diagrams already generated/cached in Postgres row
    if not force_refresh:
        diagrams = repo_row.get("diagrams")
        if diagrams:
            return diagrams

    # Generate on-the-fly if not present or forced refresh
    repo_name = repo_row.get("github_url", "repo").split("/")[-1]
    from app.services.diagram_generator import DiagramGenerator
    generator = DiagramGenerator(neo4j)
    generated = await generator.generate_all_diagrams(str(repo_id), repo_name)
    await pg.update_repo_diagrams(str(repo_id), user.id, generated)
    return generated

