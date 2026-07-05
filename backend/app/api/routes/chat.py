"""
GitMesh — Chat API Routes
============================
Endpoints for the AI code assistant chat feature.

Endpoints:
    POST /api/v1/chat/send          — Send a message and get an AI response
    GET  /api/v1/chat/history       — Get chat history for a session
    GET  /api/v1/chat/sessions      — List chat sessions for a repo
"""

import logging
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from langchain_core.messages import HumanMessage

from app.api.dependencies import require_auth, get_pg, AuthenticatedUser
from app.db.pg_client import SupabasePGClient
from app.schemas.requests import ChatMessageSend
from app.schemas.responses import ChatMessageResponse, ChatHistoryResponse, ErrorResponse
from app.agents.graph import graph as agent_graph

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/chat",
    tags=["chat"],
    responses={
        401: {"model": ErrorResponse, "description": "Not authenticated"},
    },
)


@router.post(
    "/send",
    response_model=ChatMessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Send a chat message",
    description="Sends a user message to the AI code assistant and returns "
    "the assistant's response. The message is processed by the LangGraph "
    "multi-agent pipeline (supervisor → QA / visualizer / blast radius / guardrail).",
)
async def send_message(
    request: ChatMessageSend,
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
) -> ChatMessageResponse:
    """Send a chat message and receive an AI-generated response."""
    session_id = str(request.session_id or uuid4())

    # 1. Persist the user message
    user_msg = await pg.insert_chat_message(
        user_id=user.id,
        repo_id=str(request.repo_id),
        session_id=session_id,
        role="user",
        content=request.message,
    )

    # 2. Load chat history for context
    history = await pg.get_chat_history(
        session_id=session_id,
        user_id=user.id,
        limit=20,
    )

    # Build LangChain messages from history (exclude current message)
    from langchain_core.messages import HumanMessage as HM, AIMessage as AIM
    lc_messages = []
    for msg in history[:-1]:  # Exclude the message we just inserted
        if msg["role"] == "user":
            lc_messages.append(HM(content=msg["content"]))
        else:
            lc_messages.append(AIM(content=msg["content"]))

    # Add current message
    lc_messages.append(HumanMessage(content=request.message))

    # 3. Invoke the LangGraph agent pipeline
    try:
        result = await agent_graph.ainvoke({
            "messages": lc_messages,
            "user_query": request.message,
            "repo_id": str(request.repo_id),
            "user_id": user.id,
            "routing_decision": None,
        })

        # Extract the assistant's response (last message)
        ai_response = result["messages"][-1].content
        if hasattr(ai_response, "content"):
            ai_response = ai_response.content
            
        # Parse list into string if Gemini returned structured blocks
        if isinstance(ai_response, list):
            extracted_text = ""
            for block in ai_response:
                if isinstance(block, dict) and "text" in block:
                    extracted_text += block["text"]
                elif isinstance(block, str):
                    extracted_text += block
            ai_response = extracted_text
    except Exception as e:
        logger.exception("Agent pipeline failed: %s", str(e))
        ai_response = (
            "I encountered an error processing your request. "
            "Please try again or rephrase your question."
        )

    # 4. Persist the assistant response
    assistant_msg = await pg.insert_chat_message(
        user_id=user.id,
        repo_id=str(request.repo_id),
        session_id=session_id,
        role="assistant",
        content=str(ai_response),
    )

    return ChatMessageResponse(
        message_id=assistant_msg["id"],
        session_id=assistant_msg["session_id"],
        role="assistant",
        content=str(ai_response),
        created_at=assistant_msg["created_at"],
    )


@router.get(
    "/history",
    response_model=ChatHistoryResponse,
    summary="Get chat history",
    description="Retrieve the full message history for a chat session.",
)
async def get_history(
    session_id: UUID = Query(..., description="The chat session UUID"),
    repo_id: UUID = Query(..., description="The repository UUID"),
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
) -> ChatHistoryResponse:
    """Get full chat history for a session."""
    messages = await pg.get_chat_history(
        session_id=str(session_id),
        user_id=user.id,
    )

    return ChatHistoryResponse(
        session_id=session_id,
        repo_id=repo_id,
        messages=[
            ChatMessageResponse(
                message_id=msg["id"],
                session_id=msg["session_id"],
                role=msg["role"],
                content=msg["content"],
                created_at=msg["created_at"],
                sources=msg.get("sources", []),
            )
            for msg in messages
        ],
    )


@router.get(
    "/sessions",
    summary="List chat sessions",
    description="List all chat sessions for a specific repository.",
)
async def list_sessions(
    repo_id: UUID = Query(..., description="The repository UUID"),
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
) -> list[dict]:
    """List all chat sessions for a repository."""
    sessions = await pg.get_user_sessions(
        user_id=user.id,
        repo_id=str(repo_id),
    )
    return sessions
