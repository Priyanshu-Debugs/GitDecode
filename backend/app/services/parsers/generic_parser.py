"""
GitMesh — Generic File Parser & Graph Node Utilities
====================================================
Provides:
  1. ``parse_notebook_file`` — extracts cell sources from Jupyter ``.ipynb`` notebooks.
  2. ``parse_generic_file`` — builds basic graph data for plain-text files.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
#  Layer Detection Helper (path-based)
# ═══════════════════════════════════════════════════════════════════════════


def _detect_layer_from_path(file_path: str) -> str:
    """Infer a frontend / backend / shared layer from the file path."""
    path_lower = file_path.lower()
    if any(kw in path_lower for kw in ("frontend", "client", "components", "pages", "public", "styles")):
        return "frontend"
    if any(kw in path_lower for kw in ("backend", "server", "api", "routes", "workers", "db")):
        return "backend"
    return "shared"


# ═══════════════════════════════════════════════════════════════════════════
#  Notebook Parser (.ipynb)
# ═══════════════════════════════════════════════════════════════════════════


def parse_notebook_file(
    content: str,
    file_path: str,
    repo_id: str,
    user_id: str,
) -> dict[str, Any]:
    """Parse a Jupyter ``.ipynb`` notebook into graph data.

    Extracts basic file node metadata.

    Args:
        content: The raw JSON string of the notebook file.
        file_path: Relative path of the file in the repository.
        repo_id: Repository UUID.
        user_id: Owner user UUID.

    Returns:
        Graph data dict.
    """
    return _build_file_graph_node(repo_id, file_path, content, "python")


# ═══════════════════════════════════════════════════════════════════════════
#  Generic File Parser (.md, .json, .css, .html, .yml, .sh, .sql, …)
# ═══════════════════════════════════════════════════════════════════════════


def parse_generic_file(
    content: str,
    file_path: str,
    repo_id: str,
    user_id: str,
) -> dict[str, Any]:
    """Parse any plain-text file into graph data.

    Args:
        content: The raw text of the file.
        file_path: Relative path of the file in the repository.
        repo_id: Repository UUID.
        user_id: Owner user UUID.

    Returns:
        Graph data dict.
    """
    ext = os.path.splitext(file_path)[1].lower()

    # Map extensions to a language hint for the graph node
    language_map: dict[str, str] = {
        ".md": "markdown",
        ".json": "json",
        ".html": "html",
        ".css": "css",
        ".yml": "yaml",
        ".yaml": "yaml",
        ".sh": "shell",
        ".sql": "sql",
        ".env": "dotenv",
        ".toml": "toml",
        ".cfg": "config",
    }
    language = language_map.get(ext, "text")
    return _build_file_graph_node(repo_id, file_path, content, language)


# ═══════════════════════════════════════════════════════════════════════════
#  Internal Helpers
# ═══════════════════════════════════════════════════════════════════════════


def _build_file_graph_node(
    repo_id: str,
    file_path: str,
    content: str,
    language: str,
) -> dict[str, Any]:
    """Build a minimal graph data dict containing a single File node."""
    file_node = {
        "repo_id": repo_id,
        "path": file_path,
        "language": language,
        "size_bytes": len(content.encode("utf-8")),
        "checksum": str(hash(content)),
    }
    return {
        "nodes": [("File", file_node)],
        "edges": [],
        "raw_imports": [],
        "layer": _detect_layer_from_path(file_path),
        "frameworks": [],
    }
