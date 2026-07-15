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

import logging
from datetime import datetime, timezone
from uuid import UUID

import inngest
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.dependencies import require_auth, get_pg, AuthenticatedUser
from app.db.pg_client import SupabasePGClient
from app.schemas.requests import RepoSyncRequest
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
inngest_client = inngest.Inngest(app_id="gitmesh")


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

    # Downstream traversal BFS up to depth 3
    visited = {file_path}
    affected_files = set()
    affected_nodes = []
    
    # Start queue from target file node
    queue = [(file_path, 0)]
    while queue:
        curr, d = queue.pop(0)
        if d >= 3:
            continue
            
        for edge in edges:
            src = edge.get("source", "")
            tgt = edge.get("target", "")
            
            # If target node matches or is triggered by change in source
            if src == curr or src.split("#")[0] == curr:
                if tgt not in visited:
                    visited.add(tgt)
                    queue.append((tgt, d + 1))
                    
                    tgt_file = tgt.split("#")[0]
                    affected_files.add(tgt_file)
                    
                    # Resolve symbol type/name
                    node_name = tgt.split("#")[1] if "#" in tgt else tgt_file
                    node_type = "file"
                    if "#" in tgt:
                        # Scan flat_nodes for type
                        for fn in flat_nodes:
                            if fn["id"] == tgt:
                                node_type = fn["type"]
                                break
                                
                    affected_nodes.append(
                        BlastRadiusNode(
                            type=node_type,
                            name=node_name,
                            file_path=tgt_file
                        )
                    )

    return BlastRadiusResponse(
        target=file_path,
        affected_files=sorted(list(affected_files)),
        affected_nodes=affected_nodes,
        depth=3
    )


@router.delete(
    "/{repo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a repository",
    description="Deletes a repository and all associated graph data and files.",
    responses={
        404: {"model": ErrorResponse, "description": "Repository not found"},
    },
)
async def delete_repo(
    repo_id: UUID,
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
) -> None:
    """Delete a repository and all its associated data."""
    repo_row = await pg.get_repo(repo_id=str(repo_id), user_id=user.id)
    if repo_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository {repo_id} not found.",
        )

    # Delete files, graph data, then the repo record
    await pg.delete_repo_files(str(repo_id), user.id)
    await pg.delete_repo_graph(str(repo_id), user.id)
    await pg.delete_repo(str(repo_id), user.id)


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
