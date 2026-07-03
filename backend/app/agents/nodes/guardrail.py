from typing import Dict, Any
from langchain_core.messages import AIMessage
from ..state import AgentState

async def guardrail_node(state: AgentState) -> Dict[str, Any]:
    """
    Fast-response agent for greetings or out-of-scope queries.
    Bypasses RAG entirely.
    """
    # Fast response logic for greetings or out-of-scope queries
    response = AIMessage(
        content="Hello! I am your Codebase Visualization and QA assistant. "
                "I can help you visualize codebase structures, answer questions via vector search, "
                "or analyze the blast radius of a code change. How can I help you today?"
    )
    return {"messages": [response]}
