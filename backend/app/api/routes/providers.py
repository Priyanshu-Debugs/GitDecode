"""
GitDecode — Provider Registry & Dynamic Models API
===================================================
GET  /api/v1/providers           → Returns static fallback provider registry
POST /api/v1/providers/models    → Dynamically fetches live available models from provider API using user's API key
POST /api/v1/providers/validate  → Validates an API key against its provider
GET  /api/v1/providers/preferences → Gets user's model preferences
PUT  /api/v1/providers/preferences → Saves user's model preferences
"""

import logging
from typing import Optional, Dict, Any
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.dependencies import require_auth, get_pg, AuthenticatedUser
from app.db.pg_client import SupabasePGClient
from app.services.llm_factory import PROVIDER_REGISTRY

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/providers", tags=["providers"])


@router.get("/", summary="List supported LLM providers and static fallback models")
async def list_providers():
    """Returns the static provider registry for the frontend Settings UI."""
    result = {}
    for key, info in PROVIDER_REGISTRY.items():
        result[key] = {
            "display_name": info["display_name"],
            "key_prefix": info["key_prefix"],
            "models": info["models"],
            "has_server_key": info.get("env_key") is not None,
        }
    return result


class FetchModelsRequest(BaseModel):
    provider: str
    api_key: Optional[str] = None


@router.post("/models", summary="Fetch live models available for provider using API key")
async def fetch_provider_models(req: FetchModelsRequest):
    """
    Queries the provider's official REST API with the user's API key
    to fetch all live available chat models dynamically.
    Falls back to the static registry if key is omitted or request fails.
    """
    provider = req.provider.lower()
    api_key = req.api_key

    # Fallback to static models if no key provided
    if not api_key:
        if provider in PROVIDER_REGISTRY:
            return {"models": PROVIDER_REGISTRY[provider]["models"], "live": False}
        return {"models": [], "live": False}

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            if provider == "openai":
                res = await client.get("https://api.openai.com/v1/models", headers={"Authorization": f"Bearer {api_key}"})
                if res.status_code == 200:
                    data = res.json()
                    # Filter to only chat-capable models
                    OPENAI_EXCLUDE = ("audio", "realtime", "search", "embedding", "tts", "dall-e", "whisper", "moderation")
                    chat_models = [
                        {"id": m["id"], "name": m["id"], "context_window": 128_000}
                        for m in data.get("data", [])
                        if any(prefix in m["id"] for prefix in ["gpt", "o1", "o3", "o4"])
                        and not any(ex in m["id"] for ex in OPENAI_EXCLUDE)
                    ]
                    if chat_models:
                        return {"models": chat_models, "live": True}

            elif provider == "anthropic":
                res = await client.get(
                    "https://api.anthropic.com/v1/models",
                    headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"}
                )
                if res.status_code == 200:
                    data = res.json()
                    models = [
                        {"id": m["id"], "name": m.get("display_name", m["id"]), "context_window": 200_000}
                        for m in data.get("data", [])
                    ]
                    if models:
                        return {"models": models, "live": True}

            elif provider == "groq":
                res = await client.get("https://api.groq.com/openai/v1/models", headers={"Authorization": f"Bearer {api_key}"})
                if res.status_code == 200:
                    data = res.json()
                    # Filter to only chat-capable models
                    GROQ_EXCLUDE = ("whisper", "distil", "tool-use", "guard", "playai", "tts", "compound")
                    models = [
                        {
                            "id": m["id"],
                            "name": m["id"],
                            "context_window": m.get("context_window", 32_768),
                        }
                        for m in data.get("data", [])
                        if m.get("active", True)
                        and not any(ex in m["id"] for ex in GROQ_EXCLUDE)
                    ]
                    if models:
                        return {"models": models, "live": True}

            elif provider == "google":
                res = await client.get(f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}")
                if res.status_code == 200:
                    data = res.json()
                    models = [
                        {
                            "id": m["name"].replace("models/", ""),
                            "name": m.get("displayName", m["name"]),
                            "context_window": m.get("inputTokenLimit", 1_000_000),
                        }
                        for m in data.get("models", [])
                        if "generateContent" in m.get("supportedGenerationMethods", [])
                    ]
                    if models:
                        return {"models": models, "live": True}

        except Exception as e:
            logger.warning("Dynamic model query failed for provider %s: %s", provider, str(e))

    fallback = PROVIDER_REGISTRY.get(provider, {}).get("models", [])
    return {"models": fallback, "live": False}


class ValidateKeyRequest(BaseModel):
    provider: str
    api_key: str


@router.post("/validate", summary="Validate an API key")
async def validate_key(req: ValidateKeyRequest):
    """Quick validation: creates a throwaway LLM and sends a tiny test prompt."""
    from app.services.llm_factory import create_llm
    try:
        provider = req.provider.lower()
        if provider not in PROVIDER_REGISTRY:
            return {"valid": False, "message": f"Unknown provider '{provider}'"}
        
        default_model = PROVIDER_REGISTRY[provider]["models"][0]["id"]
        llm = create_llm(provider, default_model, req.api_key, max_tokens=50)
        response = await llm.ainvoke("Hi")
        return {"valid": True, "message": "API key is valid"}
    except Exception as e:
        return {"valid": False, "message": str(e)}


@router.get("/preferences", summary="Get user's model preferences")
async def get_preferences(
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
):
    try:
        prefs = await pg.get_user_preferences(user.id)
        return prefs or {"preferred_provider": "google", "preferred_model": "gemini-3.1-flash-lite"}
    except Exception:
        return {"preferred_provider": "google", "preferred_model": "gemini-3.1-flash-lite"}


class PreferencesRequest(BaseModel):
    provider: str
    model: str


@router.put("/preferences", summary="Save user's model preferences")
async def save_preferences(
    request: PreferencesRequest,
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
):
    try:
        return await pg.upsert_user_preferences(
            user.id, request.provider, request.model
        )
    except Exception as e:
        logger.warning("Failed to save user preferences to DB: %s", str(e))
        return {"status": "ok", "provider": request.provider, "model": request.model}
