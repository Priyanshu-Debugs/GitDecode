"""
GitDecode — Response Schemas
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
        detailed_status: Detailed status step.
        error_message: Error log if failed.
        queued_at: Timestamp when the sync was queued.
    """

    model_config = ConfigDict(from_attributes=True)

    repo_id: UUID
    status: Literal["queued", "processing", "completed", "failed"]
    message: str
    detailed_status: str | None = None
    error_message: str | None = None
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


# ══════════════════════════════════════════════════════════════════════
#  Dashboard Response Schemas
# ══════════════════════════════════════════════════════════════════════


class RepoListItem(BaseModel):
    """A single repository in a list response.

    Attributes:
        id: The repository UUID.
        github_url: The GitHub repository URL.
        branch: The synced branch.
        status: Current pipeline status.
        detailed_status: Detailed status step.
        error_message: Error log if failed.
        created_at: When the repo was first synced.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    github_url: str
    branch: str
    status: Literal["queued", "processing", "completed", "failed"]
    detailed_status: str | None = None
    error_message: str | None = None
    created_at: datetime


class GraphStatsResponse(BaseModel):
    """Aggregate node and edge counts for a repository's knowledge graph.

    Attributes:
        files: Number of File nodes.
        classes: Number of Class nodes.
        functions: Number of Function nodes.
        routes: Number of Route nodes.
        edges: Total number of relationships.
    """

    files: int = 0
    classes: int = 0
    functions: int = 0
    routes: int = 0
    edges: int = 0


class GraphNode(BaseModel):
    """A node in the dependency graph visualization."""

    id: str
    label: str
    language: str | None = None
    size_bytes: int | None = None
    type: str | None = None
    file_path: str | None = None
    signature: str | None = None


class GraphEdge(BaseModel):
    """An edge in the dependency graph visualization."""

    source: str
    target: str
    type: str | None = None


class FullGraphResponse(BaseModel):
    """Full graph representing all nodes and relationships.

    Attributes:
        nodes: List of all entity nodes.
        edges: List of all relationships.
    """

    nodes: list[GraphNode]
    edges: list[GraphEdge]


class DependencyGraphResponse(BaseModel):
    """Full dependency graph for visualization.

    Attributes:
        nodes: List of file nodes.
        edges: List of import edges.
    """

    nodes: list[GraphNode]
    edges: list[GraphEdge]


class BlastRadiusNode(BaseModel):
    """A node affected by a code change."""

    type: str
    name: str | None = None
    file_path: str | None = None


class BlastRadiusResponse(BaseModel):
    """Blast radius analysis result.

    Attributes:
        target: The file being changed.
        affected_files: List of downstream file paths.
        affected_nodes: Detailed list of affected nodes.
        depth: Traversal depth used.
    """

    target: str
    affected_files: list[str]
    affected_nodes: list[BlastRadiusNode]
    depth: int = 3


class CallGraphResponse(BaseModel):
    """Function call graph response.

    Attributes:
        nodes: List of function nodes.
        edges: List of call edges.
    """

    nodes: list[GraphNode]
    edges: list[GraphEdge]


class ClassGraphResponse(BaseModel):
    """Class hierarchy/structure graph response.

    Attributes:
        nodes: List of class/method nodes.
        edges: List of containment/has-method edges.
    """

    nodes: list[GraphNode]
    edges: list[GraphEdge]


class CodebaseReportResponse(BaseModel):
    """Response model for a saved codebase analysis report.

    Attributes:
        repo_id: The repository UUID.
        report_markdown: The rendered Markdown report string.
        plan: The structured report plan JSON object.
        created_at: Timestamp when the report was generated.
    """

    model_config = ConfigDict(from_attributes=True)

    repo_id: UUID
    report_markdown: str
    plan: dict | None = None
    created_at: datetime

