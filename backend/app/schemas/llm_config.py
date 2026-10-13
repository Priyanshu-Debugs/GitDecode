"""Pydantic schema for user's LLM configuration."""
from typing import Optional
from pydantic import BaseModel, Field

class UserLLMConfig(BaseModel):
    """LLM configuration provided per-request.
    
    When api_key is None, the server's default GOOGLE_API_KEY is used.
    When provided, the key exists only in-memory during this request.
    """
    provider: str = Field(default="google", description="LLM provider ID")
    model: str = Field(default="gemini-3.5-flash-lite", description="Model identifier")
    api_key: Optional[str] = Field(default=None, description="User's API key (ephemeral, never stored)")
