import json
from typing import Dict, Any
from langchain_core.messages import AIMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from ..state import AgentState
from ..prompts import REPO_SUMMARY_PROMPT
from app.api.dependencies import get_neo4j, get_pg

llm = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite")

async def repo_summary_node(state: AgentState) -> Dict[str, Any]:
    """
    Agent that queries Neo4j for a high-level overview of the codebase and summarizes it.
    """
    neo4j_client = get_neo4j()
    pg_client = get_pg()
    repo_id = state.get("repo_id")
    user_id = state.get("user_id")
    
    # 1. Fetch repo name from Postgres
    repo_info = await pg_client.get_repo(repo_id=repo_id, user_id=user_id)
    repo_name = "Unknown Repository"
    if repo_info and "github_url" in repo_info:
        url = repo_info["github_url"].rstrip("/")
        repo_name = url.split("/")[-1]
    
    # 2. Fetch summary from Neo4j
    summary_data = await neo4j_client.get_repo_summary(repo_id=repo_id)
    
    # 3. Build context
    context = f"Repository Name: {repo_name}\n\nRaw Neo4j Database Summary:\n\n{json.dumps(summary_data, indent=2)}\n\n"
    
    # 4. Call LLM
    messages = [
        SystemMessage(content=REPO_SUMMARY_PROMPT),
        *state.get("messages", []),
        SystemMessage(content=context)
    ]
    
    response = await llm.ainvoke(messages)
    return {"messages": [response]}
