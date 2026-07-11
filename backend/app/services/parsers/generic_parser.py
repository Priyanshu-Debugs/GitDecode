"""
GitMesh — Generic File Parser & Chunking Utilities
====================================================
Provides:
  1. ``split_into_chunks`` — a reusable text splitter with configurable
     chunk size and overlap, shared across all parsers.
  2. ``parse_notebook_file`` — extracts cell sources from Jupyter ``.ipynb``
     notebooks and chunks them.
  3. ``parse_generic_file`` — chunks any plain-text file (Markdown, JSON,
     CSS, HTML, YAML, SQL, shell scripts, etc.) for vector storage.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
#  Shared Chunking Utility
# ═══════════════════════════════════════════════════════════════════════════


def split_into_chunks(
    content: str,
    chunk_size: int = 4000,
    overlap: int = 200,
) -> list[str]:
    """Split *content* into overlapping text slices.

    Args:
        content: The full text to split.
        chunk_size: Maximum number of characters per chunk.
        overlap: Number of characters of overlap between consecutive chunks.

    Returns:
        A list of text slices.  Empty or whitespace-only content yields ``[]``.
    """
    if not content or not content.strip():
        return []

    # If the whole file fits in one chunk, return it as-is.
    if len(content) <= chunk_size:
        return [content]

    chunks: list[str] = []
    step = chunk_size - overlap
    start = 0

    while start < len(content):
        end = start + chunk_size
        slice_text = content[start:end]

        # Only add non-empty slices
        if slice_text.strip():
            chunks.append(slice_text)

        start += step

    return chunks


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
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Parse a Jupyter ``.ipynb`` notebook into vector chunks and graph data.

    Extracts the ``source`` field from each cell (code and markdown),
    concatenates them with cell boundary markers, then splits into
    overlapping text chunks.

    Args:
        content: The raw JSON string of the notebook file.
        file_path: Relative path of the file in the repository.
        repo_id: Repository UUID.
        user_id: Owner user UUID.

    Returns:
        A tuple of (vector_chunks, graph_data).
    """
    try:
        notebook = json.loads(content)
    except (json.JSONDecodeError, ValueError):
        logger.warning(
            "Could not parse .ipynb JSON for %s — falling back to raw text chunking.",
            file_path,
        )
        return parse_generic_file(content, file_path, repo_id, user_id)

    cells = notebook.get("cells", [])
    if not cells:
        return parse_generic_file(content, file_path, repo_id, user_id)

    # Concatenate cell sources
    cell_texts: list[str] = []
    for cell in cells:
        cell_type = cell.get("cell_type", "code")
        source_lines = cell.get("source", [])
        if isinstance(source_lines, list):
            source_text = "".join(source_lines)
        else:
            source_text = str(source_lines)

        if source_text.strip():
            header = f"# [{cell_type.upper()} CELL]"
            cell_texts.append(f"{header}\n{source_text}")

    full_text = "\n\n# --- Cell Boundary ---\n\n".join(cell_texts)

    if not full_text.strip():
        return [], _build_file_graph_node(repo_id, file_path, content, "python")

    layer = _detect_layer_from_path(file_path)
    text_chunks = split_into_chunks(full_text, chunk_size=4000, overlap=200)
    vector_chunks: list[dict[str, Any]] = []

    for i, text_slice in enumerate(text_chunks):
        char_start = i * (4000 - 200)
        start_ln = full_text[:char_start].count("\n") + 1
        end_ln = full_text[: char_start + len(text_slice)].count("\n") + 1

        vector_chunks.append(
            {
                "repo_id": repo_id,
                "user_id": user_id,
                "file_path": file_path,
                "chunk_index": i,
                "content": text_slice,
                "node_type": "file_chunk",
                "node_name": os.path.basename(file_path),
                "start_line": start_ln,
                "end_line": end_ln,
                "metadata": {
                    "layer": layer,
                    "kind": "notebook",
                    "chunk_part": i + 1,
                    "total_parts": len(text_chunks),
                },
            }
        )

    graph_data = _build_file_graph_node(repo_id, file_path, content, "python")
    return vector_chunks, graph_data


# ═══════════════════════════════════════════════════════════════════════════
#  Generic File Parser (.md, .json, .css, .html, .yml, .sh, .sql, …)
# ═══════════════════════════════════════════════════════════════════════════


def parse_generic_file(
    content: str,
    file_path: str,
    repo_id: str,
    user_id: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Parse any plain-text file into overlapping vector chunks.

    Args:
        content: The raw text of the file.
        file_path: Relative path of the file in the repository.
        repo_id: Repository UUID.
        user_id: Owner user UUID.

    Returns:
        A tuple of (vector_chunks, graph_data).
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
    layer = _detect_layer_from_path(file_path)

    text_chunks = split_into_chunks(content, chunk_size=4000, overlap=200)
    vector_chunks: list[dict[str, Any]] = []

    for i, text_slice in enumerate(text_chunks):
        char_start = i * (4000 - 200)
        start_ln = content[:char_start].count("\n") + 1
        end_ln = content[: char_start + len(text_slice)].count("\n") + 1

        vector_chunks.append(
            {
                "repo_id": repo_id,
                "user_id": user_id,
                "file_path": file_path,
                "chunk_index": i,
                "content": text_slice,
                "node_type": "file_chunk",
                "node_name": os.path.basename(file_path),
                "start_line": start_ln,
                "end_line": end_ln,
                "metadata": {
                    "layer": layer,
                    "kind": ext.lstrip(".") or "text",
                    "chunk_part": i + 1,
                    "total_parts": len(text_chunks),
                },
            }
        )

    graph_data = _build_file_graph_node(repo_id, file_path, content, language)
    return vector_chunks, graph_data


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
