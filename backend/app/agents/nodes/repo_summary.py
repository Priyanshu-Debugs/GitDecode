import json
import logging
from typing import Dict, Any
from langchain_core.messages import AIMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from ..state import AgentState
from ..prompts import REPO_SUMMARY_PROMPT
from app.api.dependencies import get_pg

logger = logging.getLogger(__name__)
llm = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite")

async def repo_summary_node(state: AgentState) -> Dict[str, Any]:
    """
    Agent that reads JSON graph stats from Supabase and summarizes the codebase structure.
    """
    pg_client = get_pg()
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
        "languages": languages_stats,
        "total_classes": stats.get("classes_count", 0),
        "total_functions": stats.get("functions_count", 0)
    }
    
    # 3. Build context
    context = f"Repository Name: {repo_name}\n\nRaw Database Summary:\n\n{json.dumps(summary_data, indent=2)}\n\n"
    
    # 4. Call LLM
    messages = [
        SystemMessage(content=REPO_SUMMARY_PROMPT),
        *state.get("messages", []),
        SystemMessage(content=context)
    ]
    
    response = await llm.ainvoke(messages)
    return {"messages": [response]}
