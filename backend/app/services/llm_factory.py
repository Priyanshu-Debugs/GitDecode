"""
GitDecode — Multi-Provider LLM Factory
======================================
Creates ephemeral LLM client instances from user-provided API keys.
Keys are NEVER stored; they exist only in-memory during a single request lifecycle.
"""

import logging
import os
from typing import Any, Dict, Optional
from langchain_core.language_models.chat_models import BaseChatModel

logger = logging.getLogger(__name__)

# ── Provider Registry ──────────────────────────────────────────────────────

PROVIDER_REGISTRY: Dict[str, Dict[str, Any]] = {
    "google": {
        "display_name": "Google Gemini",
        "key_prefix": "AIza",               # Partial prefix hint for validation
        "env_key": "GOOGLE_API_KEY",         # Server fallback env var
        "free_model": "gemini-3.1-flash-lite",  # Only this model works with the server key
        "models": [
            {"id": "gemini-3.5-flash",      "name": "Gemini 3.5 Flash",      "context_window": 1_000_000},
            {"id": "gemini-3.1-pro",        "name": "Gemini 3.1 Pro",        "context_window": 2_000_000},
            {"id": "gemini-3.1-flash-lite", "name": "Gemini 3.1 Flash Lite", "context_window": 1_000_000},
        ],
    },
    "openai": {
        "display_name": "OpenAI",
        "key_prefix": "sk-",
        "env_key": None,
        "models": [
            {"id": "gpt-5.6",      "name": "GPT-5.6",       "context_window": 1_000_000},
            {"id": "gpt-5.5",      "name": "GPT-5.5",       "context_window": 1_000_000},
            {"id": "gpt-4.1",      "name": "GPT-4.1",      "context_window": 1_000_000},
            {"id": "gpt-4o",       "name": "GPT-4o",       "context_window": 128_000},
            {"id": "gpt-4o-mini",  "name": "GPT-4o Mini",  "context_window": 128_000},
        ],
    },
    "anthropic": {
        "display_name": "Anthropic",
        "key_prefix": "sk-ant-",
        "env_key": None,
        "models": [
            {"id": "claude-fable-5",           "name": "Claude Fable 5",  "context_window": 500_000},
            {"id": "claude-opus-4.8",          "name": "Claude Opus 4.8", "context_window": 200_000},
            {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4", "context_window": 200_000},
            {"id": "claude-haiku-4-20250514",  "name": "Claude Haiku 4",  "context_window": 200_000},
        ],
    },
    "groq": {
        "display_name": "Groq",
        "key_prefix": "gsk_",
        "env_key": None,
        "models": [
            {"id": "llama-3.3-70b-versatile", "name": "Llama 3.3 70B", "context_window": 128_000},
            {"id": "llama-3.1-8b-instant",    "name": "Llama 3.1 8B",  "context_window": 128_000},
            {"id": "mixtral-8x7b-32768",      "name": "Mixtral 8x7B",  "context_window": 32_768},
        ],
    },
}

# Default fallback when no user key is provided
DEFAULT_PROVIDER = "google"
DEFAULT_MODEL = "gemini-3.1-flash-lite"


def create_llm(
    provider: str = DEFAULT_PROVIDER,
    model: str = DEFAULT_MODEL,
    api_key: Optional[str] = None,
    max_tokens: Optional[int] = None,
) -> BaseChatModel:
    """Create an ephemeral LLM client. Key lives only in this object's memory.

    If api_key is None, attempts to use the server's env var for that provider.
    If no env var exists, raises ValueError.
    """
    provider = provider.lower()
    if provider not in PROVIDER_REGISTRY:
        logger.warning("Unknown provider '%s', falling back to google", provider)
        provider = DEFAULT_PROVIDER

    registry = PROVIDER_REGISTRY[provider]

    # Resolve API key: user-provided > server env var
    resolved_key = api_key
    if not resolved_key and registry.get("env_key"):
        resolved_key = os.environ.get(registry["env_key"])

    if not resolved_key:
        # Fallback to server's Google key if configured
        fallback_key = os.environ.get("GOOGLE_API_KEY")
        if fallback_key:
            logger.info("No API key for %s, falling back to server default (Google Gemini)", provider)
            from langchain_google_genai import ChatGoogleGenerativeAI
            kwargs = {"model": DEFAULT_MODEL, "google_api_key": fallback_key}
            if max_tokens: kwargs["max_output_tokens"] = max_tokens
            return ChatGoogleGenerativeAI(**kwargs)
        else:
            raise ValueError(
                f"No API key provided for {registry['display_name']} "
                f"and no server fallback is configured."
            )

    # Create the appropriate LangChain client
    if provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI
        kwargs = {"model": model, "google_api_key": resolved_key}
        if max_tokens: kwargs["max_output_tokens"] = max_tokens
        return ChatGoogleGenerativeAI(**kwargs)

    elif provider == "openai":
        from langchain_openai import ChatOpenAI
        kwargs = {"model": model, "api_key": resolved_key}
        if max_tokens: kwargs["max_tokens"] = max_tokens
        return ChatOpenAI(**kwargs)

    elif provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        kwargs = {"model": model, "api_key": resolved_key}
        if max_tokens: kwargs["max_tokens_to_sample"] = max_tokens
        return ChatAnthropic(**kwargs)

    elif provider == "groq":
        from langchain_groq import ChatGroq
        # Default to 4096 max_tokens for Groq to prevent accidental large allocations
        kwargs = {"model": model, "api_key": resolved_key, "max_tokens": max_tokens or 4096}
        return ChatGroq(**kwargs)

    raise ValueError(f"Provider {provider} not supported")


def get_default_llm() -> BaseChatModel:
    """Returns the server's default LLM (Google Gemini with server key)."""
    return create_llm(DEFAULT_PROVIDER, DEFAULT_MODEL)


def resolve_llm_from_state(state: dict) -> BaseChatModel:
    """Helper to extract llm_config from agent state and create LLM.
    Falls back to server default if no user config is present.
    
    IMPORTANT: When no user API key is provided, only the free model
    (gemini-3.1-flash-lite) is allowed. Other Google models require
    the user's own API key.
    """
    config = state.get("llm_config")
    if config and isinstance(config, dict) and config.get("api_key"):
        try:
            return create_llm(
                provider=config.get("provider", DEFAULT_PROVIDER),
                model=config.get("model", DEFAULT_MODEL),
                api_key=config["api_key"],
            )
        except Exception as e:
            logger.warning("Failed to create user custom LLM (%s), falling back to default: %s", config.get("provider"), str(e))
            return get_default_llm()

    # No user API key — enforce free model restriction
    # Even if the user selected a different Google model, force the free model
    # because the server key only supports gemini-3.1-flash-lite
    if config and isinstance(config, dict):
        provider = config.get("provider", DEFAULT_PROVIDER)
        model = config.get("model", DEFAULT_MODEL)
        if provider == "google":
            free_model = PROVIDER_REGISTRY.get("google", {}).get("free_model", DEFAULT_MODEL)
            if model != free_model:
                logger.info(
                    "User requested Google model '%s' without own API key, "
                    "forcing free model '%s'", model, free_model
                )
            return create_llm(provider="google", model=free_model)

    return get_default_llm()
