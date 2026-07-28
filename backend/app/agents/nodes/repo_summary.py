import json
import logging
from typing import Dict, Any
from langchain_core.messages import AIMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from ..state import AgentState
from ..prompts import REPO_SUMMARY_PROMPT
from app.api.dependencies import get_pg

from app.services.llm_factory import resolve_llm_from_state

logger = logging.getLogger(__name__)

async def repo_summary_node(state: AgentState) -> Dict[str, Any]:
    """
    Agent that reads JSON graph stats from Supabase and summarizes the codebase structure.
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
    
    # Format stats to match previous Neo4j structure for REPO_SUMMARY_PROMPT compatibility
    languages_stats = []
    for lang, count in stats.get("languages", {}).items():
        sample_files = [node["id"] for node in graph_data.get("nodes", []) if node.get("language") == lang][:25]
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
    }
    
    # 3. Build context
    context = f"Repository Name: {repo_name}\n\nRaw Database Summary:\n\n{json.dumps(summary_data, indent=2)}\n\n"
    
    # 4. Call LLM
    messages = [
        SystemMessage(content=REPO_SUMMARY_PROMPT),
        *state.get("messages", []),
        SystemMessage(content=f"{context}\n\nCRITICAL: You MUST start your response with a <think> block. Inside the <think> block, you MUST write out your analysis as a structured bulleted list of at least 3 sub-points before closing with </think> and providing your final answer. Do NOT output an empty think block or an unstructured paragraph!")
    ]
    
    response = await llm.ainvoke(messages, config={"tags": ["final_answer"]})
    return {"messages": [response]}
