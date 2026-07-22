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
import json
import asyncio
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage

from app.api.dependencies import require_auth, get_pg, AuthenticatedUser
from app.db.pg_client import SupabasePGClient
from app.schemas.requests import ChatMessageSend, ChatFeedbackRequest
from app.schemas.responses import ChatMessageResponse, ChatHistoryResponse, ErrorResponse
from app.agents.graph import graph as agent_graph
from app.core.config import settings
from app.services.subscription import get_user_plan, get_plan_limits


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

    # Check rate limits for default model
    is_default = not request.llm_config or not request.llm_config.api_key
    if is_default:
        plan = await get_user_plan(pg, user.id)
        limits = get_plan_limits(plan)
        allowed = await pg.check_and_increment_rate_limit(
            user_id=user.id,
            repo_id=str(request.repo_id),
            daily_limit=limits["daily_msg_limit"],
            monthly_limit=limits["monthly_msg_limit"],
        )
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail="You have reached your daily message limit for this repository. Upgrade to Pro for unlimited messages."
            )

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
            "llm_config": request.llm_config.model_dump() if request.llm_config else None,
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


@router.post(
    "/stream",
    summary="Stream chat message with thoughts",
    description="Stream thought process and then the final answer.",
)
async def stream_message(
    request: ChatMessageSend,
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
):
    session_id = str(request.session_id or uuid4())

    # Check rate limits for default model
    is_default = not request.llm_config or not request.llm_config.api_key
    if is_default:
        plan = await get_user_plan(pg, user.id)
        limits = get_plan_limits(plan)
        allowed = await pg.check_and_increment_rate_limit(
            user_id=user.id,
            repo_id=str(request.repo_id),
            daily_limit=limits["daily_msg_limit"],
            monthly_limit=limits["monthly_msg_limit"],
        )
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail="You have reached your daily message limit for this repository. Upgrade to Pro for unlimited messages."
            )

    async def event_generator() -> AsyncGenerator[str, None]:
        user_msg = await pg.insert_chat_message(
            user_id=user.id,
            repo_id=str(request.repo_id),
            session_id=session_id,
            role="user",
            content=request.message,
        )

        yield f"data: {json.dumps({'type': 'user_message_id', 'content': user_msg['id']})}\n\n"

        yield f"data: {json.dumps({'type': 'thought', 'content': 'Analyzing query...'})}\n\n"

        history = await pg.get_chat_history(session_id=session_id, user_id=user.id, limit=20)
        from langchain_core.messages import HumanMessage as HM, AIMessage as AIM
        lc_messages = []
        for msg in history[:-1]:
            if msg["role"] == "user":
                lc_messages.append(HM(content=msg["content"]))
            else:
                lc_messages.append(AIM(content=msg["content"]))
        lc_messages.append(HumanMessage(content=request.message))


        final_response_text = ""
        final_sources = []
        streamed_tokens = False
        try:
            # We stream events to yield tokens and thoughts for each node
            async for event in agent_graph.astream_events({
                "messages": lc_messages,
                "user_query": request.message,
                "repo_id": str(request.repo_id),
                "user_id": user.id,
                "routing_decision": None,
                "llm_config": request.llm_config.model_dump() if request.llm_config else None,
            }, version="v2"):
                kind = event.get("event")
                name = event.get("name")

                if kind == "on_chat_model_stream":
                    if "final_answer" in event.get("tags", []):
                        streamed_tokens = True
                        chunk = event["data"].get("chunk")
                        if chunk and hasattr(chunk, "content"):
                            content = chunk.content
                            if content:
                                if isinstance(content, str):
                                    yield f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"
                                    final_response_text += content
                                elif isinstance(content, list):
                                    for block in content:
                                        if isinstance(block, dict) and "text" in block:
                                            yield f"data: {json.dumps({'type': 'token', 'content': block['text']})}\n\n"
                                            final_response_text += block["text"]
                                        elif isinstance(block, str):
                                            yield f"data: {json.dumps({'type': 'token', 'content': block})}\n\n"
                                            final_response_text += block
                
                elif kind == "on_chain_start":
                    if name == "supervisor":
                        yield f"data: {json.dumps({'type': 'thought', 'content': 'Loading context...'})}\n\n"
                
                elif kind == "on_chain_end":
                    if name == "supervisor":
                        output = event["data"].get("output", {})
                        decision = output.get("routing_decision", "Unknown") if isinstance(output, dict) else "Unknown"
                        yield f"data: {json.dumps({'type': 'thought', 'content': f'Classified intent. Routing to {decision} engine...'})}\n\n"
                    elif name in ["QA", "VISUALIZE", "IMPACT", "GUARDRAIL", "REPO_SUMMARY"]:
                        yield f"data: {json.dumps({'type': 'thought', 'content': f'Generated insights from {name} engine.'})}\n\n"
                        output = event["data"].get("output", {})
                        
                        if isinstance(output, dict) and "messages" in output and len(output["messages"]) > 0:
                            last_msg = output["messages"][-1]
                            
                            # Extract Sources
                            if hasattr(last_msg, "additional_kwargs") and "sources" in last_msg.additional_kwargs:
                                final_sources = last_msg.additional_kwargs["sources"]
                                yield f"data: {json.dumps({'type': 'sources', 'content': final_sources})}\n\n"
                                
                            # If we didn't stream tokens (e.g. SDK Context Caching fallback), extract final text
                            if not streamed_tokens:
                                ai_response = last_msg.content if hasattr(last_msg, "content") else last_msg
                                if isinstance(ai_response, list):
                                    extracted = ""
                                    for block in ai_response:
                                        if isinstance(block, dict) and "text" in block:
                                            extracted += block["text"]
                                        elif isinstance(block, str):
                                            extracted += block
                                    final_response_text = extracted
                                else:
                                    final_response_text = str(ai_response)
        except Exception as e:
            logger.exception("Agent pipeline failed: %s", str(e))
            final_response_text = "I encountered an error processing your request. Please try again."

        yield f"data: {json.dumps({'type': 'thought', 'content': 'Finalizing answer...'})}\n\n"

        # Persist assistant msg
        assistant_msg = await pg.insert_chat_message(
            user_id=user.id,
            repo_id=str(request.repo_id),
            session_id=session_id,
            role="assistant",
            content=final_response_text,
            sources=final_sources,
        )

        yield f"data: {json.dumps({'type': 'message_id', 'content': assistant_msg['id'], 'session_id': session_id})}\n\n"

        # Only send full_text if we didn't stream (the frontend simulates typing for full_text)
        if not streamed_tokens:
            yield f"data: {json.dumps({'type': 'full_text', 'content': final_response_text})}\n\n"
        
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


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

@router.delete(
    "/message/{message_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a chat message",
)
async def delete_message(
    message_id: UUID,
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
) -> None:
    await pg.delete_chat_message(str(message_id))


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

@router.post(
    "/feedback",
    status_code=status.HTTP_201_CREATED,
    summary="Submit feedback",
    description="Submit user feedback (thumbs up/down, etc) for a specific chat message.",
)
async def submit_feedback(
    request: ChatFeedbackRequest,
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
) -> dict:
    """Submit user feedback for an AI response."""
    await pg.insert_chat_feedback(
        user_id=user.id,
        message_id=str(request.message_id),
        feedback_type=request.feedback_type,
    )
    return {"status": "success"}

@router.get(
    "/rate-limit-status",
    summary="Get rate limit status",
    description="Get the remaining messages for the user on the default model.",
)
async def get_rate_limit_status(
    repo_id: UUID = Query(..., description="The repository UUID"),
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
) -> dict:
    plan = await get_user_plan(pg, user.id)
    limits = get_plan_limits(plan)
    
    status_dict = await pg.get_rate_limit_status(
        user_id=user.id,
        repo_id=str(repo_id),
        daily_limit=limits["daily_msg_limit"],
        monthly_limit=limits["monthly_msg_limit"],
    )
    status_dict["plan"] = plan
    status_dict["is_developer"] = plan == "pro"  # Keep 'is_developer' key for frontend compatibility or add 'is_pro'
    status_dict["is_pro"] = plan == "pro"
    return status_dict

@router.delete(
    "/session/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a chat session",
    description="Deletes all messages associated with a given chat session.",
)
async def delete_session(
    session_id: UUID,
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
) -> None:
    """Delete all messages for a specific session."""
    await pg.delete_chat_session(
        session_id=str(session_id),
        user_id=user.id,
    )

