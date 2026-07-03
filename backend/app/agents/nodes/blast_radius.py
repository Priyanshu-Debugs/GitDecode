import json
from typing import Dict, Any
from pydantic import BaseModel, Field
from langchain_core.messages import AIMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from ..state import AgentState
from ..prompts import IMPACT_PROMPT
from app.api.dependencies import get_neo4j

class TargetExtraction(BaseModel):
    function_name: str = Field(description="Name of the target function to analyze.")
    file_path: str = Field(description="File path of the target function to analyze.")

llm = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite")

async def blast_radius_node(state: AgentState) -> Dict[str, Any]:
    """
    Agent that analyzes downstream impacts using Neo4j graph traversal.
    """
    neo4j = get_neo4j()
    
    user_query = state.get("user_query", "")
    if not user_query and state.get("messages"):
        user_query = state["messages"][-1].content
        if hasattr(user_query, "content"):
            user_query = user_query.content
    
    # 1. Extract target function using structured output
    extraction_llm = llm.with_structured_output(TargetExtraction)
    extraction = await extraction_llm.ainvoke(f"Extract the target function and file from this query: {user_query}")
    
    if not extraction:
        return {"messages": [AIMessage(content="Could not determine the target function and file path from the query.")]}

    # 2. Graph Traversal (BFS / Callees)
    callees = await neo4j.get_function_callees(
        repo_id=state["repo_id"], 
        function_name=extraction.function_name, 
        file_path=extraction.file_path
    )
    
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
