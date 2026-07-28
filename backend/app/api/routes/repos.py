"""
GitDecode — Repos API Routes
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

import logging
from datetime import datetime, timezone
from uuid import UUID

import inngest
from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File, Form

from app.api.dependencies import require_auth, get_pg, AuthenticatedUser
from app.db.pg_client import SupabasePGClient
from app.core.config import settings
from app.services.subscription import get_user_plan, get_plan_limits
from app.schemas.requests import RepoSyncRequest, RepoAccessCheckRequest
from app.services.github_access import check_repo_access
from app.schemas.responses import (
    RepoSyncResponse,
    RepoListItem,
    GraphStatsResponse,
    DependencyGraphResponse,
    BlastRadiusResponse,
    BlastRadiusNode,
    ErrorResponse,
    CallGraphResponse,
    ClassGraphResponse,
    FullGraphResponse,
    GraphNode,
    GraphEdge,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/repos",
    tags=["repos"],
    responses={
        401: {"model": ErrorResponse, "description": "Not authenticated"},
    },
)

# Inngest client — shared instance for dispatching background events.
inngest_client = inngest.Inngest(app_id="gitdecode")


def flatten_nodes(nodes_list: list[dict]) -> list[dict]:
    """Helper to flatten files and their symbols (classes & functions) into a flat list of GraphNode items."""
    flat = []
    for node in nodes_list:
        # 1. Add file node
        flat.append({
            "id": node["id"],
            "label": node["label"],
            "type": "file",
            "language": node.get("language"),
            "size_bytes": node.get("size_bytes"),
            "file_path": node["id"],
        })
        # 2. Add classes & functions from file symbols
        for sym in node.get("symbols", []):
            sym_type = sym["type"]
            name = sym["name"]
            if sym_type == "class":
                flat.append({
                    "id": f"{node['id']}#{name}",
                    "label": name,
                    "type": "class",
                    "file_path": node["id"],
                })
            elif sym_type == "function":
                flat.append({
                    "id": f"{node['id']}#{name}",
                    "label": name,
                    "type": "function",
                    "file_path": node["id"],
                    "signature": sym.get("signature"),
                })
    return flat


@router.post(
    "/check-access",
    summary="Check access to a GitHub repository",
    description="Validates if a GitHub repository (public or private) is accessible.",
)
async def check_access(
    request: RepoAccessCheckRequest,
    user: AuthenticatedUser = Depends(require_auth),
):
    """Check if repository URL is accessible (public or private)."""
    return await check_repo_access(str(request.repo_url), request.github_token)


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
    try:
        # Check if repo already exists for the user
        existing_repo = await pg.get_repo_by_url(user.id, str(request.repo_url))
        if existing_repo:
            repo_status = existing_repo["status"]
            if repo_status in ("queued", "processing"):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Repository {request.repo_url} is already being synced (status: {repo_status})."
                )
            
            # Re-use the existing record by resetting its status to queued
            repo_row = await pg.update_repo_status(
                repo_id=existing_repo["id"],
                user_id=user.id,
                status="queued",
                detailed_status="queued",
                error_message=None
            )
        else:
            plan = await get_user_plan(pg, user.id)
            limits = get_plan_limits(plan)
            active_count = await pg.get_active_repo_count(user.id)
            if active_count >= limits["repo_limit"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Your plan ({plan}) is limited to {limits['repo_limit']} repositories. Upgrade to Pro for unlimited repos."
                )

            # Insert new repo record
            repo_row = await pg.insert_repo(
                user_id=user.id,
                github_url=str(request.repo_url),
                branch=request.branch,
            )

        # Dispatch Inngest event to trigger the ingestion pipeline
        event_data = {
            "repo_id": repo_row["id"],
            "user_id": user.id,
            "repo_url": str(request.repo_url),
            "branch": request.branch,
        }
        if request.github_token:
            event_data["github_token"] = request.github_token

        await inngest_client.send(
            inngest.Event(
                name="repo/sync.requested",
                data=event_data,
            )
        )

        return RepoSyncResponse(
            repo_id=repo_row["id"],
            status="queued",
            message=f"Repository {request.repo_url} has been queued for ingestion.",
            queued_at=repo_row.get("created_at", datetime.now(timezone.utc)),
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        with open("sync_error.log", "a") as f:
            f.write(traceback.format_exc() + "\n")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@router.post(
    "/upload-local",
    response_model=RepoSyncResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload and sync a local directory",
    description="Accepts a zip file containing a local code repository and queues it for ingestion.",
    responses={
        201: {"description": "Sync job queued successfully"},
        403: {"model": ErrorResponse, "description": "Plan limit reached"},
    },
)
async def upload_local_repo(
    file: UploadFile = File(...),
    folder_name: str = Form("local-folder"),
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
) -> RepoSyncResponse:
    """Initiate a repository sync from a local zip file.
    
    1. Checks the user's plan limit.
    2. Saves the uploaded zip file to a temporary location.
    3. Creates a repo record in PostgreSQL with status 'queued' and a special 'local://' URL.
    4. Dispatches an Inngest event to trigger the local ingestion pipeline.
    """
    try:
        # Rate Limit Check
        plan = await get_user_plan(pg, user.id)
        limits = get_plan_limits(plan)
        active_count = await pg.get_active_repo_count(user.id)
        if active_count >= limits["repo_limit"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Your plan ({plan}) is limited to {limits['repo_limit']} repositories. Upgrade to Pro for unlimited repos."
            )

        # Save file temporarily
        import tempfile
        import os
        import shutil
        from uuid import uuid4
        
        temp_dir = tempfile.gettempdir()
        file_uuid = uuid4().hex
        zip_path = os.path.join(temp_dir, f"local_upload_{file_uuid}.zip")
        
        with open(zip_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Create repo record
        local_url = f"local://{folder_name}-{file_uuid[:8]}"
        repo_row = await pg.insert_repo(
            user_id=user.id,
            github_url=local_url,
            branch="main",
        )
        
        # Dispatch event
        await inngest_client.send(
            inngest.Event(
                name="repo/sync_local.requested",
                data={
                    "repo_id": repo_row["id"],
                    "user_id": user.id,
                    "repo_url": local_url,
                    "zip_path": zip_path,
                },
            )
        )
        
        return RepoSyncResponse(
            repo_id=repo_row["id"],
            status="queued",
            message=f"Local folder {folder_name} has been queued for ingestion.",
            queued_at=repo_row.get("created_at", datetime.now(timezone.utc)),
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        with open("sync_error.log", "a") as f:
            f.write(traceback.format_exc() + "\n")
        raise HTTPException(status_code=500, detail="Internal Server Error")


@router.post(
    "/{repo_id}/cancel",
    response_model=RepoSyncResponse,
    summary="Cancel active repository sync",
    description="Cancels an in-flight repository ingestion pipeline.",
)
async def cancel_repo_sync(
    repo_id: UUID,
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
) -> RepoSyncResponse:
    """Cancel an ongoing repository ingestion job."""
    import os, shutil, tempfile
    str_id = str(repo_id)
    repo = await pg.get_repo_by_id(str_id, user.id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found.")

    current_status = repo.get("status")
    if current_status not in ("queued", "processing"):
        raise HTTPException(
            status_code=400,
            detail=f"Repository is not currently processing (status: {current_status})."
        )

    # Mark as failed/cancelled
    updated = await pg.update_repo_status(
        repo_id=str_id,
        user_id=user.id,
        status="failed",
        detailed_status="cancelled",
        error_message="Ingestion cancelled by user.",
    )

    # Clean up temp clone files
    temp_dir = os.path.join(tempfile.gettempdir(), f"gitdecode_{str_id}")
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir, ignore_errors=True)

    return RepoSyncResponse(
        repo_id=str_id,
        status="failed",
        detailed_status="cancelled",
        message="Ingestion cancelled by user.",
        queued_at=updated.get("created_at", datetime.now(timezone.utc)),
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
    "/by-name/{username}/{repo_name}",
    response_model=RepoSyncResponse,
    summary="Get repository by GitHub username and repo name",
    description=(
        "Looks up a repository owned by the authenticated user using its GitHub "
        "username and repository name (e.g. /by-name/torvalds/linux). "
        "Returns the repository metadata including its internal UUID, which can "
        "then be used for all subsequent graph/chat API calls."
    ),
    responses={
        404: {"model": ErrorResponse, "description": "Repository not found"},
    },
)
async def get_repo_by_name(
    username: str,
    repo_name: str,
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
) -> RepoSyncResponse:
    """Retrieve a repository by its GitHub username and repository name.

    Reconstructs the canonical GitHub URL from the path parameters and
    delegates to ``get_repo_by_url``. Only returns repos owned by the
    authenticated user (user-scoped).
    """
    # Normalise: strip trailing slashes and .git suffix to be safe
    clean_repo_name = repo_name.rstrip("/").removesuffix(".git")
    github_url = f"https://github.com/{username}/{clean_repo_name}"

    repo_row = await pg.get_repo_by_url(
        user_id=user.id,
        github_url=github_url,
    )

    if repo_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository '{username}/{clean_repo_name}' not found or you don't have access to it.",
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
) -> GraphStatsResponse:
    """Get knowledge graph statistics for a repository."""
    # Verify ownership
    repo_row = await pg.get_repo(repo_id=str(repo_id), user_id=user.id)
    if repo_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository {repo_id} not found.",
        )

    graph_row = await pg.get_repo_graph(str(repo_id), user.id)
    if not graph_row:
        return GraphStatsResponse()

    stats = graph_row.get("stats", {})
    edges_count = len(graph_row.get("graph_data", {}).get("edges", []))
    
    return GraphStatsResponse(
        files=stats.get("files_count", 0),
        classes=stats.get("classes_count", 0),
        functions=stats.get("functions_count", 0),
        routes=0,
        edges=edges_count
    )


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
) -> DependencyGraphResponse:
    """Get the dependency graph for visualization."""
    repo_row = await pg.get_repo(repo_id=str(repo_id), user_id=user.id)
    if repo_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository {repo_id} not found.",
        )

    graph_row = await pg.get_repo_graph(str(repo_id), user.id)
    if not graph_row:
        return DependencyGraphResponse(nodes=[], edges=[])

    graph_data = graph_row.get("graph_data", {})
    
    file_nodes = [
        GraphNode(**node)
        for node in graph_data.get("nodes", [])
        if node.get("type") == "file"
    ]
    import_edges = [
        GraphEdge(**edge)
        for edge in graph_data.get("edges", [])
        if edge.get("type") == "IMPORTS"
    ]
    
    return DependencyGraphResponse(nodes=file_nodes, edges=import_edges)


@router.get(
    "/{repo_id}/full-graph",
    response_model=FullGraphResponse,
    summary="Get full repository graph",
    description="Returns all entity nodes and relationships in the knowledge graph for visualization.",
    responses={
        404: {"model": ErrorResponse, "description": "Repository not found"},
    },
)
async def get_full_graph(
    repo_id: UUID,
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
) -> FullGraphResponse:
    """Get the full graph for visualization."""
    repo_row = await pg.get_repo(repo_id=str(repo_id), user_id=user.id)
    if repo_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository {repo_id} not found.",
        )

    graph_row = await pg.get_repo_graph(str(repo_id), user.id)
    if not graph_row:
        return FullGraphResponse(nodes=[], edges=[])

    graph_data = graph_row.get("graph_data", {})
    flat_nodes = flatten_nodes(graph_data.get("nodes", []))
    
    nodes = [GraphNode(**node) for node in flat_nodes]
    edges = [GraphEdge(**edge) for edge in graph_data.get("edges", [])]
    
    return FullGraphResponse(nodes=nodes, edges=edges)


@router.get(
    "/{repo_id}/file",
    summary="Get repository file content",
    description="Returns the content of a specific file in the repository.",
)
async def get_file_content(
    repo_id: UUID,
    file_path: str = Query(..., description="Path of the file"),
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
) -> dict:
    """Get the content of a specific file in the repository."""
    repo_row = await pg.get_repo(repo_id=str(repo_id), user_id=user.id)
    if repo_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository {repo_id} not found.",
        )
    files = await pg.get_repo_files(str(repo_id), user.id, [file_path])
    if not files:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File {file_path} not found in repository.",
        )
    return {"content": files[0]["content"]}


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
) -> BlastRadiusResponse:
    """Get the blast radius for a specific file using in-memory JSON graph BFS."""
    repo_row = await pg.get_repo(repo_id=str(repo_id), user_id=user.id)
    if repo_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository {repo_id} not found.",
        )

    graph_row = await pg.get_repo_graph(str(repo_id), user.id)
    if not graph_row:
        return BlastRadiusResponse(target=file_path, affected_files=[], affected_nodes=[])

    graph_data = graph_row.get("graph_data", {})
    nodes = graph_data.get("nodes", [])
    edges = graph_data.get("edges", [])

    flat_nodes = flatten_nodes(nodes)

    # Normalize input file_path against graph nodes
    clean_target = file_path.replace("\\", "/").rstrip("/")
    target_basename = clean_target.split("/")[-1] if clean_target else ""

    canonical_file_path = clean_target
    for n in nodes:
        n_id = n.get("id", "").replace("\\", "/")
        if (
            n_id == clean_target
            or n_id.endswith("/" + clean_target)
            or (target_basename and n_id.split("/")[-1] == target_basename)
        ):
            canonical_file_path = n_id
            break

    # Blast radius = "If I change file X, what else breaks?"
    # Answer: files/symbols that DEPEND ON X, i.e. incoming edges (reverse traversal).
    # We BFS on reversed edges: follow edges where X is the TARGET, collecting the SOURCES.
    visited: set[str] = {canonical_file_path, file_path, clean_target}
    affected_files: set[str] = set()
    affected_nodes: list[BlastRadiusNode] = []

    queue: list[tuple[str, int]] = [(canonical_file_path, 0)]
    while queue:
        curr, depth = queue.pop(0)
        if depth >= 3:
            continue

        for edge in edges:
            src = edge.get("source", "")
            tgt = edge.get("target", "")

            # Incoming edge: something (src) depends on curr (tgt)
            # Strip compound keys to compare at the file level
            tgt_file = tgt.split("#")[0]
            if tgt_file == curr or tgt == curr:
                if src not in visited:
                    visited.add(src)
                    src_file = src.split("#")[0]
                    queue.append((src_file, depth + 1))

                    affected_files.add(src_file)

                    # Resolve symbol type/name from flat graph nodes
                    node_name = src.split("#")[1] if "#" in src else src_file
                    node_type = "file"
                    if "#" in src:
                        for fn in flat_nodes:
                            if fn["id"] == src:
                                node_type = fn["type"]
                                break

                    affected_nodes.append(
                        BlastRadiusNode(
                            type=node_type,
                            name=node_name,
                            file_path=src_file,
                        )
                    )

    return BlastRadiusResponse(
        target=file_path,
        affected_files=sorted(list(affected_files)),
        affected_nodes=affected_nodes,
        depth=3,
    )




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
) -> CallGraphResponse:
    """Get call graph for visualizer."""
    repo_row = await pg.get_repo(repo_id=str(repo_id), user_id=user.id)
    if repo_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository {repo_id} not found.",
        )

    graph_row = await pg.get_repo_graph(str(repo_id), user.id)
    if not graph_row:
        return CallGraphResponse(nodes=[], edges=[])

    graph_data = graph_row.get("graph_data", {})
    flat_nodes = flatten_nodes(graph_data.get("nodes", []))
    
    # Filter nodes to function type and edges to CALLS type
    fn_nodes = [
        GraphNode(**node)
        for node in flat_nodes
        if node.get("type") == "function"
    ]
    call_edges = [
        GraphEdge(**edge)
        for edge in graph_data.get("edges", [])
        if edge.get("type") == "CALLS"
    ]
    
    return CallGraphResponse(nodes=fn_nodes, edges=call_edges)


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
) -> ClassGraphResponse:
    """Get class/methods graph for visualizer."""
    repo_row = await pg.get_repo(repo_id=str(repo_id), user_id=user.id)
    if repo_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository {repo_id} not found.",
        )

    graph_row = await pg.get_repo_graph(str(repo_id), user.id)
    if not graph_row:
        return ClassGraphResponse(nodes=[], edges=[])

    graph_data = graph_row.get("graph_data", {})
    flat_nodes = flatten_nodes(graph_data.get("nodes", []))
    
    # Class graph contains class and function nodes with HAS_METHOD edge
    class_method_nodes = [
        GraphNode(**node)
        for node in flat_nodes
        if node.get("type") in ("class", "function")
    ]
    has_method_edges = [
        GraphEdge(**edge)
        for edge in graph_data.get("edges", [])
        if edge.get("type") == "HAS_METHOD"
    ]
    
    return ClassGraphResponse(nodes=class_method_nodes, edges=has_method_edges)


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
) -> dict:
    """Get repository structural summary statistics."""
    repo_row = await pg.get_repo(repo_id=str(repo_id), user_id=user.id)
    if repo_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository {repo_id} not found.",
        )

    graph_row = await pg.get_repo_graph(str(repo_id), user.id)
    if not graph_row:
        return {"languages": [], "total_classes": 0, "total_functions": 0}

    stats = graph_row.get("stats", {})
    graph_data = graph_row.get("graph_data", {})
    
    languages_stats = []
    for lang, count in stats.get("languages", {}).items():
        sample_files = [node["id"] for node in graph_data.get("nodes", []) if node.get("language") == lang][:25]
        languages_stats.append({
            "language": lang,
            "count": count,
            "sample_files": sample_files
        })

    return {
        "languages": languages_stats,
        "total_classes": stats.get("classes_count", 0),
        "total_functions": stats.get("functions_count", 0)
    }


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
    diagram_type: str | None = Query(None, description="Specific diagram to regenerate (architecture, userFlow, dataFlow)"),
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
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
    generator = DiagramGenerator(pg_client=pg)
    
    if force_refresh and diagram_type:
        existing_diagrams = repo_row.get("diagrams") or {}
        new_diagram = await generator.generate_single_diagram(str(repo_id), repo_name, diagram_type)
        existing_diagrams[diagram_type] = new_diagram
        await pg.update_repo_diagrams(str(repo_id), user.id, existing_diagrams)
        return existing_diagrams
    else:
        generated = await generator.generate_all_diagrams(str(repo_id), repo_name)
        await pg.update_repo_diagrams(str(repo_id), user.id, generated)
        return generated
