"""
GitMesh — Request Schemas
==========================
Strict Pydantic models for API request validation.
All models use ``extra="forbid"`` to reject unknown fields.
"""

import re
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, HttpUrl


class RepoSyncRequest(BaseModel):
    """Request body for initiating a repository sync/ingestion.

    Attributes:
        repo_url: A valid GitHub HTTPS URL pointing to a repository.
        branch: The branch to sync. Defaults to ``"main"``.
    """

    model_config = ConfigDict(extra="forbid")

    repo_url: HttpUrl
    branch: str = Field(default="main", min_length=1, max_length=255)

    @field_validator("repo_url")
    @classmethod
    def validate_github_url(cls, v: HttpUrl) -> HttpUrl:
        """Ensure the URL is a GitHub repository URL."""
        url_str = str(v).rstrip("/")
        pattern = r"^https://github\.com/[\w.\-]+/[\w.\-]+$"
        if not re.match(pattern, url_str):
            raise ValueError(
                "URL must be a valid GitHub repository URL "
                "(e.g., https://github.com/owner/repo)"
            )
        return v

    @field_validator("branch")
    @classmethod
    def validate_branch_name(cls, v: str) -> str:
        """Prevent shell injection via branch names.

        Only allows alphanumeric characters, dots, hyphens, underscores,
        and forward slashes (for branches like ``feature/my-branch``).
        """
        if not re.match(r"^[\w.\-/]+$", v):
            raise ValueError(
                "Branch name contains invalid characters. "
                "Only alphanumeric, '.', '-', '_', '/' are allowed."
            )
        return v


class ChatMessageSend(BaseModel):
    """Request body for sending a chat message to the AI code assistant.

    Attributes:
        repo_id: UUID of the repository this chat is about.
        message: The user's message text (1–4000 characters).
        session_id: Optional chat session UUID. Auto-generated if not provided,
            which starts a new conversation thread.
    """

    model_config = ConfigDict(extra="forbid")

    repo_id: UUID
    message: str = Field(min_length=1, max_length=4000)
    session_id: UUID | None = Field(default_factory=uuid4)

    @field_validator("message", mode="before")
    @classmethod
    def strip_message(cls, v: str) -> str:
        """Strip leading/trailing whitespace before length validation."""
        if isinstance(v, str):
            return v.strip()
        return v
