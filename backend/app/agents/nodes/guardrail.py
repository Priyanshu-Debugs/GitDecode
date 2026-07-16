from typing import Dict, Any
from langchain_core.messages import SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from ..state import AgentState
from ..prompts import GUARDRAIL_PROMPT
import logging

logger = logging.getLogger(__name__)

async def guardrail_node(state: AgentState) -> Dict[str, Any]:
    """
    Fast-response agent for greetings or out-of-scope queries.
    Bypasses RAG entirely and uses an LLM for a polite refusal.
    """
    llm = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite")
    
    messages = [
        SystemMessage(content=GUARDRAIL_PROMPT),
        *state.get("messages", [])
    ]
    
    logger.info("Invoking Guardrail Agent for out-of-scope query.")
    try:
        response = await llm.ainvoke(messages)
    except Exception as e:
        import traceback
        error_msg = f"ERROR IN GUARDRAIL API: {str(e)}\n\nTraceback:\n{traceback.format_exc()}"
        from langchain_core.messages import AIMessage
        response = AIMessage(content=error_msg)
    
    return {"messages": [response]}
