import json
import logging
from typing import Dict, Any
from pydantic import BaseModel, Field
from langchain_core.messages import AIMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from ..state import AgentState
from ..prompts import IMPACT_PROMPT
from app.api.dependencies import get_pg

logger = logging.getLogger(__name__)

class TargetExtraction(BaseModel):
    function_name: str = Field(description="Name of the target function to analyze.")
    file_path: str = Field(description="File path of the target function to analyze.")

llm = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite")

async def blast_radius_node(state: AgentState) -> Dict[str, Any]:
    """
    Agent that analyzes downstream impacts using in-memory JSON graph traversal.
    """
    pg_client = get_pg()
    
    user_query = state.get("user_query", "")
    if not user_query and state.get("messages"):
        user_query = state["messages"][-1].content
        if hasattr(user_query, "content"):
            user_query = user_query.content
    
    # 1. Extract target function using structured output
    extraction_llm = llm.with_structured_output(TargetExtraction)
    extraction = None
    try:
        extraction = await extraction_llm.ainvoke(f"Extract the target function and file from this query: {user_query}")
    except Exception as e:
        logger.error("Failed function extraction for blast radius: %s", str(e))
        
    if not extraction:
        return {"messages": [AIMessage(content="Could not determine the target function and file path from the query.")]}

    # 2. Fetch JSON dependency graph
    graph = await pg_client.get_repo_graph(state["repo_id"], state["user_id"])
    if not graph or not graph.get("graph_data"):
        return {"messages": [AIMessage(content="Codebase graph not found. Please sync the repository first.")]}

    graph_data = graph["graph_data"]
    edges = graph_data.get("edges", [])
    nodes = graph_data.get("nodes", [])

    # Target key
    target_key = f"{extraction.file_path}#{extraction.function_name}"
    logger.info("Analyzing blast radius for target key: %s", target_key)

    # Find matching callees (outgoing CALLS edges)
    # Also find callers (incoming CALLS edges) to show full impact path!
    # Usually blast radius is downstream: if we change this function, what breaks (what calls this function)?
    # Wait, in the original code, `neo4j.get_function_callees` returns functions called BY the function,
    # but blast radius usually goes the other way (who calls this function? i.e. caller dependency).
    # Let's support both or match the caller direction which shows who is affected.
    # In Neo4j `get_function_callees`, the Cypher query was:
    #   MATCH (caller:Function) -[:CALLS]-> (callee:Function) WHERE caller.name = $function_name AND caller.file_path = $file_path
    # So it actually traverses caller -> callee (callees). Let's do the exact same direction to stay compatible.
    callees = []
    
    for edge in edges:
        if edge.get("type") == "CALLS":
            source = edge.get("source", "")
            target = edge.get("target", "")
            # Match caller (source)
            if source.split("@")[0] == target_key or source == target_key:
                # We found a callee!
                parts = target.split("#")
                if len(parts) == 2:
                    callee_file, callee_name = parts
                    # Look up signature from nodes
                    sig = ""
                    for n in nodes:
                        if n.get("id") == callee_file:
                            for sym in n.get("symbols", []):
                                if sym.get("type") == "function" and sym.get("name") == callee_name:
                                    sig = sym.get("signature", "")
                                    break
                    callees.append({
                        "name": callee_name,
                        "file_path": callee_file,
                        "signature": sig
                    })

    impact_data = {
        "target": {"function": extraction.function_name, "file": extraction.file_path},
        "downstream_impacts": callees
    }
    
    context = f"Impact Graph JSON:\n{json.dumps(impact_data, indent=2)}"
    
    messages = [
        SystemMessage(content=IMPACT_PROMPT),
        *state.get("messages", []),
        SystemMessage(content=context)
    ]
    
    response = await llm.ainvoke(messages)
    return {"messages": [response]}
