"""
GitMesh — Hugging Face Embeddings Client
==========================================
Manages embedding requests to the Hugging Face Serverless Inference API
using key rotation for rate-limit fallback and retry logic for cold starts.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class HuggingFaceEmbeddingsClient:
    """Client for generating text embeddings using Hugging Face Serverless Inference.

    Configured to load and rotate API keys from the application settings to
    mitigate 429 Rate Limits, and handles 503 Cold Starts gracefully.
    """

    def __init__(self) -> None:
        settings = get_settings()
        # Extract comma-separated keys from environment config
        self.keys = [
            k.strip()
            for k in settings.HUGGINGFACE_API_KEYS.split(",")
            if k.strip()
        ]
        self.current_key_idx = 0
        if not self.keys:
            logger.warning(
                "No Hugging Face API keys found in HUGGINGFACE_API_KEYS config. "
                "API calls will run unauthenticated and face severe rate limits."
            )
        else:
            logger.info(
                "Hugging Face Embeddings Client initialized with %d keys.",
                len(self.keys),
            )

    def _get_headers(self) -> dict[str, str]:
        """Get authentication headers using the active key in the rotation."""
        if not self.keys:
            return {}
        return {"Authorization": f"Bearer {self.keys[self.current_key_idx]}"}

    def _rotate_key(self) -> None:
        """Move the active API key index to the next available key."""
        if not self.keys:
            return
        old_idx = self.current_key_idx
        self.current_key_idx = (self.current_key_idx + 1) % len(self.keys)
        logger.info(
            "Rotated Hugging Face key: active index changed from %d to %d.",
            old_idx,
            self.current_key_idx,
        )

    async def get_embeddings(self, texts: list[str]) -> list[list[float]]:
        """Fetch 768-dimensional embeddings for a batch of text.

        Args:
            texts: List of strings to encode.

        Returns:
            List of 768-dimensional float embeddings.
        """
        if not texts:
            return []

        url = "https://api-inference.huggingface.co/pipeline/feature-extraction/nomic-ai/nomic-embed-text-v1.5"
        
        # Limit attempts to avoid infinite loops, but ensure all keys are tried
        max_attempts = max(5, len(self.keys) * 2)
        attempt = 0

        while attempt < max_attempts:
            headers = self._get_headers()
            payload = {
                "inputs": texts,
                "options": {"wait_for_model": True},
            }

            try:
                attempt += 1
                async with httpx.AsyncClient(timeout=60.0) as client:
                    response = await client.post(
                        url, headers=headers, json=payload
                    )

                if response.status_code == 200:
                    data = response.json()
                    return self._process_response(data)

                elif response.status_code == 429:
                    logger.warning(
                        "Hugging Face rate limit hit on key index %d (HTTP 429). Rotating key...",
                        self.current_key_idx,
                    )
                    self._rotate_key()
                    # Backoff slightly before retry to let rotation settle
                    await asyncio.sleep(1.0)
                    continue

                elif response.status_code == 503:
                    # Model is loading (cold start)
                    try:
                        err_data = response.json()
                        estimated_time = float(err_data.get("estimated_time", 15.0))
                    except Exception:
                        estimated_time = 15.0

                    logger.info(
                        "Hugging Face model is loading (HTTP 503). Waiting %s seconds...",
                        estimated_time,
                    )
                    # Cap waiting time to 20 seconds maximum per step
                    await asyncio.sleep(min(estimated_time, 20.0))
                    continue

                else:
                    logger.error(
                        "Hugging Face Inference API error %d: %s. Rotating key...",
                        response.status_code,
                        response.text,
                    )
                    self._rotate_key()
                    await asyncio.sleep(1.0)
                    continue

            except httpx.HTTPError as e:
                logger.error(
                    "Network error calling Hugging Face: %s. Rotating key...",
                    str(e),
                )
                self._rotate_key()
                await asyncio.sleep(2.0)
                continue

        raise RuntimeError(
            "Failed to retrieve embeddings from Hugging Face after exhausting all keys/retries."
        )

    def _process_response(self, data: Any) -> list[list[float]]:
        """Processes and pools the returned feature representation from HF.

        Hugging Face feature extraction can return:
          1. 3D array: [batch_size, sequence_length, embedding_dim] - Needs mean-pooling.
          2. 2D array: [batch_size, embedding_dim] - Already pooled.
          3. 1D array: [embedding_dim] - Single result, batch dimension dropped.
        """
        if not isinstance(data, list):
            raise ValueError(
                f"Expected list response from Hugging Face, got {type(data)}"
            )

        if not data:
            return []

        # Case 1: 3D List [batch_size, seq_len, dim]
        if (
            isinstance(data[0], list)
            and len(data[0]) > 0
            and isinstance(data[0][0], list)
        ):
            pooled = []
            for item in data:
                # item is [seq_len, dim]
                seq_len = len(item)
                dim = len(item[0])
                mean_vector = [0.0] * dim
                for token_embedding in item:
                    for i in range(dim):
                        mean_vector[i] += token_embedding[i]
                mean_vector = [x / seq_len for x in mean_vector]
                pooled.append(mean_vector)
            return pooled

        # Case 2: 2D List [batch_size, dim]
        elif (
            isinstance(data[0], list)
            and len(data[0]) > 0
            and isinstance(data[0][0], (int, float))
        ):
            return [[float(val) for val in row] for row in data]

        # Case 3: 1D List [dim]
        elif isinstance(data[0], (int, float)):
            return [[float(val) for val in data]]

        else:
            raise ValueError(
                "Hugging Face response format is unrecognized and cannot be parsed."
            )
