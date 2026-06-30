"""
GitMesh — Response Schemas
============================
Pydantic models for API response serialization.
All models use ``from_attributes=True`` to support ORM-like objects.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CodeSource(BaseModel):
    """A reference to a specific code location, attached to AI-generated answers.

    Attributes:
        file_path: Relative path within the repository.
        start_line: Starting line number of the referenced code.
        end_line: Ending line number of the referenced code.
        snippet: A short code snippet for inline display.
        node_type: The type of code entity this source points to.
    """

    model_config = ConfigDict(from_attributes=True)

    file_path: str
    start_line: int | None = None
    end_line: int | None = None
    snippet: str | None = None
    node_type: Literal["file", "class", "function", "route"] | None = None


class RepoSyncResponse(BaseModel):
    """Response after initiating or querying a repository sync.

    Attributes:
        repo_id: The unique identifier for this repository sync job.
        status: Current pipeline status.
        message: Human-readable status message.
        queued_at: Timestamp when the sync was queued.
    """

    model_config = ConfigDict(from_attributes=True)

    repo_id: UUID
    status: Literal["queued", "processing", "completed", "failed"]
    message: str
    queued_at: datetime


class ChatMessageResponse(BaseModel):
    """A single chat message (sent or received).

    Attributes:
        message_id: Unique identifier for this message.
        session_id: The conversation session this message belongs to.
        role: Whether this message is from the ``user`` or the ``assistant``.
        content: The message text content.
        created_at: When the message was created.
        sources: Code references attached to assistant replies.
    """

    model_config = ConfigDict(from_attributes=True)

    message_id: UUID
    session_id: UUID
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime
    sources: list[CodeSource] = Field(default_factory=list)


class ChatHistoryResponse(BaseModel):
    """Full chat session history.

    Attributes:
        session_id: The conversation session identifier.
        repo_id: The repository this chat is associated with.
        messages: Ordered list of messages in the session.
    """

    model_config = ConfigDict(from_attributes=True)

    session_id: UUID
    repo_id: UUID
    messages: list[ChatMessageResponse]


class ErrorResponse(BaseModel):
    """Standardized error response envelope.

    Attributes:
        detail: Human-readable error description.
        error_code: Optional machine-readable error code for client handling.
    """

    detail: str
    error_code: str | None = None
