from typing import Literal
from langgraph.graph import StateGraph, START, END
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage
import enum
from pydantic import BaseModel, Field

from .state import AgentState
from .nodes.visualizer import visualizer_node
from .nodes.code_qa import code_qa_node
from .nodes.blast_radius import blast_radius_node
from .nodes.guardrail import guardrail_node
from .prompts import SUPERVISOR_PROMPT

llm = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite")

class RouteEnum(str, enum.Enum):
    VISUALIZE = "VISUALIZE"
    QA = "QA"
    IMPACT = "IMPACT"
    GUARDRAIL = "GUARDRAIL"

class RouteDecision(BaseModel):
    decision: RouteEnum = Field(description="The routing decision for the user's query.")

async def supervisor_node(state: AgentState) -> dict:
    """
    Supervisor node that classifies intent using Gemini and routes the query.
    """
    user_query = state.get("user_query", "")
    if not user_query and state.get("messages"):
        user_query = state["messages"][-1].content
        if hasattr(user_query, "content"):
            user_query = user_query.content
            
    system_msg = SystemMessage(content=SUPERVISOR_PROMPT)
    classification_prompt = f"User Query: {user_query}"
    
    # Bind the structured output Pydantic model for reliable routing
    router_llm = llm.with_structured_output(RouteDecision)
    
    try:
        response = await router_llm.ainvoke([system_msg, classification_prompt])
        decision = response.decision.value
    except Exception:
        # Fallback logic in case LLM routing fails
        decision = "GUARDRAIL"
        
    return {"routing_decision": decision}

def route_decision(state: AgentState) -> Literal["VISUALIZE", "QA", "IMPACT", "GUARDRAIL"]:
    decision = state.get("routing_decision")
    if decision == "VISUALIZE":
        return "VISUALIZE"
    elif decision == "QA":
        return "QA"
    elif decision == "IMPACT":
        return "IMPACT"
    else:
        return "GUARDRAIL"

# Compile the LangGraph
workflow = StateGraph(AgentState)

# Add nodes
workflow.add_node("supervisor", supervisor_node)
workflow.add_node("VISUALIZE", visualizer_node)
workflow.add_node("QA", code_qa_node)
workflow.add_node("IMPACT", blast_radius_node)
workflow.add_node("GUARDRAIL", guardrail_node)

# Add edges
workflow.add_edge(START, "supervisor")

# Conditional edges from supervisor based on routing_decision
workflow.add_conditional_edges("supervisor", route_decision)

# All specialized nodes route to END
workflow.add_edge("VISUALIZE", END)
workflow.add_edge("QA", END)
workflow.add_edge("IMPACT", END)
workflow.add_edge("GUARDRAIL", END)

# Compile graph
graph = workflow.compile()
