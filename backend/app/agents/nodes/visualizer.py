import logging
from typing import Dict, Any
from langchain_core.messages import SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from ..state import AgentState
from ..prompts import VISUALIZER_PROMPT
from app.api.dependencies import get_pg

logger = logging.getLogger(__name__)
llm = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite")

async def visualizer_node(state: AgentState) -> Dict[str, Any]:
    """
    Agent that reads JSON graph from Supabase and outputs Mermaid.js syntax for graph visualization.
    """
    pg_client = get_pg()
    
    # 1. Fetch JSON dependency graph
    graph = await pg_client.get_repo_graph(state["repo_id"], state["user_id"])
    if not graph or not graph.get("graph_data"):
        return {"messages": [SystemMessage(content="graph TD\n  Start[Codebase not synced] --> End[Sync repository to visualize]")]}

    graph_data = graph["graph_data"]
    nodes = graph_data.get("nodes", [])
    edges = graph_data.get("edges", [])

    # Format the graph data to pass as context (specifically file nodes and IMPORTS edges)
    context = "Repository Dependency Graph:\nNodes:\n"
    for n in nodes:
        if n.get("type") == "file":
            context += f"- {n['id']}\n"
            
    context += "\nEdges (Imports):\n"
    for e in edges:
        if e.get("type") == "IMPORTS":
            context += f"- {e['source']} -> {e['target']}\n"
    
    messages = [
        SystemMessage(content=VISUALIZER_PROMPT),
        *state.get("messages", []),
        SystemMessage(content=f"Context:\n{context}")
    ]
    
    response = await llm.ainvoke(messages)
    
    # Strip markdown backticks if the LLM hallucinated them
    content = response.content
    if isinstance(content, str):
        content = content.replace("```mermaid", "").replace("```", "").strip()
        response.content = f"```mermaid\n{content}\n```"
    
    return {"messages": [response]}
