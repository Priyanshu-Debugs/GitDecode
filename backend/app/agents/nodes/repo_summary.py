import json
import logging
from typing import Dict, Any, List
from langchain_core.messages import AIMessage, SystemMessage
from ..state import AgentState
from ..prompts import REPO_SUMMARY_PROMPT
from app.api.dependencies import get_pg
from app.services.llm_factory import resolve_llm_from_state

logger = logging.getLogger(__name__)

# Key documentation and configuration manifest filenames to look for
DOC_AND_CONFIG_PATTERNS = [
    "readme.md", "readme", "readme.txt", "readme.rst",
    "package.json", "pyproject.toml", "cargo.toml", "go.mod",
    "docker-compose.yml", "docker-compose.yaml", "makefile", "pom.xml", "build.gradle"
]

ENTRY_POINT_KEYWORDS = ["main.", "app.", "index.", "server.", "router.", "routes.", "controller.", "service."]

async def repo_summary_node(state: AgentState) -> Dict[str, Any]:
    """
    Agent that summarizes codebase architecture and implementation.
    Gathers raw DB stats, README/docs content, directory trees, and entry point code/symbols.
    """
    pg_client = get_pg()
    llm = resolve_llm_from_state(state)
    repo_id = state.get("repo_id")
    user_id = state.get("user_id")
    
    # 1. Fetch repo name from Postgres
    repo_info = await pg_client.get_repo(repo_id=repo_id, user_id=user_id)
    repo_name = "Unknown Repository"
    if repo_info and "github_url" in repo_info:
        url = repo_info["github_url"].rstrip("/")
        repo_name = url.split("/")[-1]
    
    # 2. Fetch graph metadata
    graph = await pg_client.get_repo_graph(repo_id, user_id)
    if not graph:
        return {"messages": [AIMessage(content="Codebase graph structure not found. Please sync the repository first.")]}

    stats = graph.get("stats", {})
    graph_data = graph.get("graph_data", {})
    nodes = graph_data.get("nodes", [])

    all_file_nodes = [node for node in nodes if node.get("type") == "file" or node.get("id")]
    all_file_paths = [node["id"] for node in all_file_nodes if "id" in node]
    
    # Format stats
    languages_stats = []
    for lang, count in stats.get("languages", {}).items():
        sample_files = [node["id"] for node in all_file_nodes if node.get("language") == lang][:25]
        languages_stats.append({
            "language": lang,
            "count": count,
            "sample_files": sample_files
        })
        
    summary_data = {
        "repository_name": repo_name,
        "latest_commit_sha": repo_info.get("last_synced_commit") if repo_info else None,
        "latest_commit_message": repo_info.get("last_synced_commit_msg") if repo_info else None,
        "latest_commit_synced_at": repo_info.get("last_synced_at") if repo_info else None,
        "latest_commit_changed_files": repo_info.get("last_commit_changed_files") if repo_info else None,
        "languages": languages_stats,
        "total_classes": stats.get("classes_count", 0),
        "total_functions": stats.get("functions_count", 0),
        "total_files": len(all_file_paths),
    }

    # 3. Identify and fetch Documentation & Config Manifests
    doc_paths_to_fetch = []
    for fp in all_file_paths:
        fp_lower = fp.lower()
        fname = fp_lower.split("/")[-1]
        if any(pat == fname or fname.startswith("readme.") for pat in DOC_AND_CONFIG_PATTERNS):
            doc_paths_to_fetch.append(fp)

    doc_files_data = await pg_client.get_repo_files(repo_id, user_id, doc_paths_to_fetch) if doc_paths_to_fetch else []
    
    doc_context_parts = []
    for f_item in doc_files_data:
        fp = f_item.get("file_path", "")
        content = f_item.get("content", "")
        if content:
            if len(content) > 30000:
                content = content[:30000] + "\n...[TRUNCATED FOR SIZE]..."
            doc_context_parts.append(f"--- FILE: {fp} ---\n{content}\n")

    doc_context_str = "\n".join(doc_context_parts) if doc_context_parts else "(No README or manifest configuration files found in repository)"

    # 4. Build File Tree and Key Module Outlines
    tree_lines = [f"- {fp}" for fp in sorted(all_file_paths)[:150]]
    if len(all_file_paths) > 150:
        tree_lines.append(f"... and {len(all_file_paths) - 150} more files.")
    file_tree_str = "\n".join(tree_lines)

    # Entry point & module outline extraction
    entry_point_files = []
    for fp in all_file_paths:
        fp_lower = fp.lower()
        if any(kw in fp_lower for kw in ENTRY_POINT_KEYWORDS):
            entry_point_files.append(fp)

    # Fetch top 5 entry point contents if available
    entry_contents_data = await pg_client.get_repo_files(repo_id, user_id, entry_point_files[:5]) if entry_point_files else []
    entry_context_parts = []
    for f_item in entry_contents_data:
        fp = f_item.get("file_path", "")
        content = f_item.get("content", "")
        if content:
            if len(content) > 20000:
                content = content[:20000] + "\n...[TRUNCATED]..."
            entry_context_parts.append(f"--- ENTRY FILE: {fp} ---\n{content}\n")
    
    entry_context_str = "\n".join(entry_context_parts) if entry_context_parts else "(No explicit main/entry files detected)"

    # 5. Assemble rich LLM prompt
    context = (
        f"Repository Name: {repo_name}\n\n"
        f"=== RAW DATABASE METADATA ===\n"
        f"{json.dumps(summary_data, indent=2)}\n\n"
        f"=== REPOSITORY DOCUMENTATION & MANIFESTS ===\n"
        f"{doc_context_str}\n\n"
        f"=== REPOSITORY FILE TREE (Top 150 Files) ===\n"
        f"{file_tree_str}\n\n"
        f"=== KEY ENTRY POINTS & CORE FILES ===\n"
        f"{entry_context_str}\n\n"
        f"INSTRUCTION FOR REPO SUMMARY:\n"
        f"Synthesize the documentation, file tree structure, manifests, and entry files above to answer the user's question. "
        f"Explain what the repository does, how it is implemented, its core architecture, technology stack, and module structure."
    )
    
    # 6. Call LLM
    messages = [
        SystemMessage(content=REPO_SUMMARY_PROMPT),
        *state.get("messages", []),
        SystemMessage(content=f"{context}\n\nCRITICAL: You MUST start your response with a <think> block. Inside the <think> block, you MUST write out your analysis as a structured bulleted list of at least 3 sub-points before closing with </think> and providing your final answer. Do NOT output an empty think block or an unstructured paragraph!")
    ]
    
    response = await llm.ainvoke(messages, config={"tags": ["final_answer"]})
    return {"messages": [response]}
