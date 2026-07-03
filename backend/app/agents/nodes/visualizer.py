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
    
    # We get top level file tree as architecture context
    file_tree = await neo4j.get_file_tree(state["repo_id"])
    
    # Format the file tree to pass as context
    context = "Repository File Tree:\n"
    for f in file_tree:
        context += f"- {f['path']} ({f['language']}, {f.get('size_bytes', 0)} bytes)\n"
    
    messages = [
        SystemMessage(content=VISUALIZER_PROMPT),
        *state.get("messages", []),
        SystemMessage(content=f"Context:\n{context}")
    ]
    
    response = await llm.ainvoke(messages)
    
    return {"messages": [response]}
