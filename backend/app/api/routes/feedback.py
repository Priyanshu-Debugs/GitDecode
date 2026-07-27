"""
GitDecode — Feedback API Router
===============================
Public endpoint for submitting user feedback from the homepage.
Validates fields and emails submissions directly to gitdecode.support@gmail.com.
"""

import re
import logging
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, field_validator

from app.services.email_service import send_feedback_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/feedback", tags=["feedback"])


class FeedbackCreate(BaseModel):
    """Schema for submitting user feedback."""
    name: str
    email: EmailStr
    message: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("User name cannot be empty.")
        if len(trimmed) < 2:
            raise ValueError("User name must be at least 2 characters long.")
        if len(trimmed) > 100:
            raise ValueError("User name must not exceed 100 characters.")
        return trimmed

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        trimmed = v.strip().lower()
        if not trimmed:
            raise ValueError("Email ID is required.")
        # Basic regex check for standard email format
        pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        if not re.match(pattern, trimmed):
            raise ValueError("Please provide a valid email address.")
        return trimmed

    @field_validator("message")
    @classmethod
    def validate_message(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Message cannot be empty.")
        if len(trimmed) < 5:
            raise ValueError("Message must be at least 5 characters long.")
        if len(trimmed) > 2000:
            raise ValueError("Message must not exceed 2000 characters.")
        return trimmed


@router.post(
    "",
    status_code=status.HTTP_200_OK,
    summary="Submit user feedback",
    description="Submit feedback from the website. Form data is validated and emailed to gitdecode.support@gmail.com.",
)
async def submit_feedback(body: FeedbackCreate) -> dict[str, str]:
    """Process feedback submission and send email notification."""
    logger.info("Feedback received from %s <%s>", body.name, body.email)
    
    # Send email notification to gitdecode.support@gmail.com
    email_sent = await send_feedback_email(
        sender_name=body.name,
        sender_email=body.email,
        message=body.message,
    )
    
    if not email_sent:
        logger.warning("Feedback recorded but email notification failed or SMTP not configured.")
    
    return {
        "status": "success",
        "message": "Thank you for your feedback! Your message has been sent to our team.",
    }
