"""
GitDecode — Generic File Parser & Graph Node Utilities
====================================================
Provides:
  1. ``parse_notebook_file`` — extracts cell sources from Jupyter ``.ipynb`` notebooks.
  2. ``parse_generic_file`` — builds basic graph data, import edges, and symbols for all programming languages.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

logger = logging.getLogger(__name__)

# Language extension mapping
LANGUAGE_MAP: dict[str, str] = {
    ".md": "markdown",
    ".json": "json",
    ".html": "html",
    ".css": "css",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".sh": "shell",
    ".bash": "shell",
    ".sql": "sql",
    ".env": "dotenv",
    ".toml": "toml",
    ".cfg": "config",
    ".go": "go",
    ".java": "java",
    ".kt": "kotlin",
    ".c": "c",
    ".cpp": "cpp",
    ".h": "c",
    ".hpp": "cpp",
    ".rs": "rust",
    ".cs": "csharp",
    ".php": "php",
    ".rb": "ruby",
    ".swift": "swift",
    ".scala": "scala",
    ".dart": "dart",
}

# Regex patterns for import statement extraction across generic languages
GENERIC_IMPORT_PATTERNS = [
    # Go: import "foo/bar" or import (...)
    r'import\s+\(?\s*["\']([^"\']+)["\']',
    # Java / Kotlin / C#: import com.example.Foo; or using System.Foo;
    r'(?:import|using)\s+([\w\.]+);?',
    # C / C++: #include "foo.h" or #include <foo.h>
    r'#include\s+["<]([^">]+)[">]',
    # Rust: use crate::foo::bar; or mod foo;
    r'(?:use|mod)\s+([\w:]+);?',
    # PHP: use App\Services\Foo; or require_once 'foo.php';
    r'(?:use|require|require_once|include|include_once)\s+[\'"]?([\w\\/\.-]+)[\'"]?;?',
    # Ruby: require 'foo' or require_relative 'foo'
    r'require(?:_relative)?\s+[\'"]([^\'"]+)[\'"]',
]

# Regex patterns for function signature extraction in generic languages
GENERIC_FUNC_PATTERNS = [
    r'func\s+([\w]+)\s*\(',                           # Go
    r'(?:public|private|protected|static|\s)*[\w<>\s]+\s+([\w]+)\s*\([^)]*\)\s*\{', # Java/C#/C++
    r'fn\s+([\w]+)\s*\(',                             # Rust
    r'function\s+([\w]+)\s*\(',                       # PHP/JS
    r'def\s+([\w]+)',                                 # Ruby/Python
]


def _detect_layer_from_path(file_path: str) -> str:
    """Infer a frontend / backend / shared layer from the file path."""
    path_lower = file_path.lower()
    if any(kw in path_lower for kw in ("frontend", "client", "components", "pages", "public", "styles")):
        return "frontend"
    if any(kw in path_lower for kw in ("backend", "server", "api", "routes", "workers", "db")):
        return "backend"
    return "shared"


def parse_notebook_file(
    content: str,
    file_path: str,
    repo_id: str,
    user_id: str,
) -> dict[str, Any]:
    """Parse a Jupyter ``.ipynb`` notebook into graph data."""
    try:
        notebook_data = json.loads(content)
        code_lines = []
        for cell in notebook_data.get("cells", []):
            if cell.get("cell_type") == "code":
                source = cell.get("source", [])
                if isinstance(source, list):
                    code_lines.extend(source)
                else:
                    code_lines.append(source)
                code_lines.append("\n\n")
        
        combined_code = "".join(code_lines)
        if combined_code.strip():
            from app.services.parsers.python_parser import parse_python_file
            return parse_python_file(combined_code, file_path, repo_id, user_id)
            
    except Exception as e:
        logger.error("Failed to extract code from notebook %s: %s", file_path, e)
        
    return parse_generic_file(content, file_path, repo_id, user_id)


def parse_generic_file(
    content: str,
    file_path: str,
    repo_id: str,
    user_id: str,
) -> dict[str, Any]:
    """Parse any plain-text file into graph data, extracting imports and function nodes."""
    ext = os.path.splitext(file_path)[1].lower()
    language = LANGUAGE_MAP.get(ext, "text")

    raw_imports: list[str] = []
    symbol_nodes: list[tuple[str, dict[str, Any]]] = []

    lines = content.splitlines()

    # Extract generic import statements and functions line-by-line
    for line_idx, line in enumerate(lines, start=1):
        line_str = line.strip()
        if not line_str or line_str.startswith("//") or line_str.startswith("#") or line_str.startswith("/*"):
            continue

        # Check import patterns
        for pattern in GENERIC_IMPORT_PATTERNS:
            match = re.search(pattern, line_str)
            if match:
                imp = match.group(1).strip()
                if imp and imp not in raw_imports:
                    raw_imports.append(imp)
                break

        # Check function patterns
        for func_pat in GENERIC_FUNC_PATTERNS:
            match = re.search(func_pat, line_str)
            if match:
                func_name = match.group(1).strip()
                if func_name and func_name not in ("if", "for", "while", "switch", "catch", "return"):
                    symbol_nodes.append((
                        "Function",
                        {
                            "name": func_name,
                            "file_path": file_path,
                            "start_line": line_idx,
                            "end_line": line_idx,
                            "signature": line_str[:100],
                            "docstring": None,
                        }
                    ))
                break

    file_node = {
        "repo_id": repo_id,
        "path": file_path,
        "language": language,
        "size_bytes": len(content.encode("utf-8")),
        "checksum": str(hash(content)),
    }

    nodes = [("File", file_node)] + symbol_nodes

    return {
        "nodes": nodes,
        "edges": [],
        "raw_imports": raw_imports,
        "layer": _detect_layer_from_path(file_path),
        "frameworks": [],
    }
