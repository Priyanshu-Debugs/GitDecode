"""
GitDecode — Request Schemas
==========================
Strict Pydantic models for API request validation.
All models use ``extra="forbid"`` to reject unknown fields.
"""

import re
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, HttpUrl


class RepoAccessCheckRequest(BaseModel):
    """Request body for checking access to a GitHub repository."""
    model_config = ConfigDict(extra="ignore")

    repo_url: HttpUrl
    github_token: str | None = None


class RepoSyncRequest(BaseModel):
    """Request body for initiating a repository sync/ingestion.

    Attributes:
        repo_url: A valid GitHub HTTPS URL pointing to a repository.
        branch: The branch to sync. Defaults to ``"main"``.
        github_token: Optional GitHub access token for cloning private repositories.
    """

    model_config = ConfigDict(extra="ignore")

    repo_url: HttpUrl
    branch: str = Field(default="main", min_length=1, max_length=255)
    github_token: str | None = None

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



from app.schemas.llm_config import UserLLMConfig

class ChatMessageSend(BaseModel):
    """Request body for sending a chat message to the AI code assistant.

    Attributes:
        repo_id: UUID of the repository this chat is about.
        message: The user's message text (1–4000 characters).
        session_id: Optional chat session UUID. Auto-generated if not provided,
            which starts a new conversation thread.
        llm_config: User LLM configuration for BYOK / model choice.
    """

    model_config = ConfigDict(extra="ignore")

    repo_id: UUID
    message: str = Field(min_length=1, max_length=4000)
    session_id: UUID | None = Field(default_factory=uuid4)
    llm_config: UserLLMConfig | None = None

    @field_validator("message", mode="before")
    @classmethod
    def strip_message(cls, v: str) -> str:
        """Strip leading/trailing whitespace before length validation."""
        if isinstance(v, str):
            return v.strip()
        return v


class ChatFeedbackRequest(BaseModel):
    """Request body for submitting feedback on an AI response."""

    model_config = ConfigDict(extra="forbid")

    message_id: UUID
    feedback_type: str = Field(pattern="^(thumbs_up|thumbs_down|regenerate|copy)$")

