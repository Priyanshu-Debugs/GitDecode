from typing import Dict, Any
from langchain_core.messages import SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from ..state import AgentState
from ..prompts import VISUALIZER_PROMPT
from app.api.dependencies import get_neo4j

llm = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite")

async def visualizer_node(state: AgentState) -> Dict[str, Any]:
    """
    Agent that queries Neo4j and outputs Mermaid.js syntax for graph visualization.
    """
    neo4j = get_neo4j()
    
    # We get the actual dependency graph to provide relationships
    dependency_graph = await neo4j.get_dependency_graph(state["repo_id"])
    
    # Format the graph data to pass as context
    context = "Repository Dependency Graph:\nNodes:\n"
    for n in dependency_graph.get("nodes", []):
        context += f"- {n['id']}\n"
    context += "\nEdges (Imports):\n"
    for e in dependency_graph.get("edges", []):
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
        response.content = content
    
    return {"messages": [response]}
