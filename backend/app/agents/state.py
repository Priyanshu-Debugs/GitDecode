from typing import TypedDict, Annotated, Literal, Optional
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage

class AgentState(TypedDict):
    """
    The state of the multi-agent system.
    """
    messages: Annotated[list[BaseMessage], add_messages]
    user_query: str
    repo_id: str
    user_id: str
    routing_decision: Optional[Literal["VISUALIZE", "QA", "IMPACT", "GUARDRAIL"]]
