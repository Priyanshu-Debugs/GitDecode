"""
GitMesh — Python Code AST Parser
=================================
Parses Python source files using Tree-Sitter to chunk code, identify logical
boundaries (classes, methods, functions), resolve import statements, and extract
knowledge graph nodes/relationships (CONTAINS, HAS_METHOD, CALLS).
"""

from __future__ import annotations

import os
from typing import Any

from app.services.parsers.generic_parser import split_into_chunks

from tree_sitter import Language, Parser
import tree_sitter_python

# Initialize Tree-Sitter Parser for Python
PY_LANGUAGE = Language(tree_sitter_python.language())
py_parser = Parser()
py_parser.language = PY_LANGUAGE


# Framework signatures for frontend vs backend detection
BACKEND_PACKAGES = {
    "fastapi", "flask", "django", "tornado", "sanic", "pyramid", "bottle",
    "celery", "sqlalchemy", "psycopg2", "aiopg", "databases", "pydantic",
    "gunicorn", "uvicorn", "connexion", "pymongo", "redis", "boto3"
}

FRONTEND_PACKAGES = {
    "streamlit", "dash", "panel", "nicegui", "gradio", "tkinter", "flet",
    "pygame", "kivy", "wxpython", "pyqt5", "pyside2"
}


def parse_python_file(
    content: str,
    file_path: str,
    repo_id: str,
    user_id: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Parse Python source code into chunks and graph data.

    Args:
        content: The code contents of the file.
        file_path: Relative path of the file in the repository.
        repo_id: Repository UUID.
        user_id: Owner user UUID.

    Returns:
        A tuple of:
          - A list of vector chunk dictionaries (for pgvector).
          - A dictionary of graph elements (nodes and relationships for Neo4j).
    """
    tree = py_parser.parse(bytes(content, "utf-8"))
    root_node = tree.root_node

    # 1. Extract raw imports and determine framework layer
    imports = []
    detected_frameworks = set()
    
    # We will traverse to extract imports first
    stack = [root_node]
    while stack:
        node = stack.pop()
        if node.type in ("import_statement", "import_from_statement"):
            stmt_text = content[node.start_byte : node.end_byte]
            imports.append(stmt_text)
            
            # Simple token classification to spot frameworks
            words = stmt_text.lower().replace(",", " ").replace(".", " ").split()
            for word in words:
                if word in BACKEND_PACKAGES:
                    detected_frameworks.add(word)
                elif word in FRONTEND_PACKAGES:
                    detected_frameworks.add(word)
        else:
            for child in reversed(node.children):
                stack.append(child)

    # Determine framework layer metadata
    backend_count = len(detected_frameworks & BACKEND_PACKAGES)
    frontend_count = len(detected_frameworks & FRONTEND_PACKAGES)
    
    # Python files are generally backend by default unless fronted packages are heavily used
    if frontend_count > backend_count:
        layer = "frontend"
    elif backend_count > 0:
        layer = "backend"
    else:
        # Default fallback: check file path context
        path_lower = file_path.lower()
        if "backend" in path_lower or "server" in path_lower or "api" in path_lower:
            layer = "backend"
        elif "frontend" in path_lower or "client" in path_lower or "ui" in path_lower:
            layer = "frontend"
        else:
            layer = "backend"  # default python layer

    # 2. Extract logical boundaries (Classes, Functions, Methods)
    classes = []
    functions = []
    calls = []  # tuple of (caller_name, callee_name, caller_file, line)
    
    # Helper to resolve call expressions
    def extract_callee_name(call_node: Any) -> str | None:
        func_node = call_node.child_by_field_name("function")
        if not func_node:
            return None
        if func_node.type == "identifier":
            return content[func_node.start_byte : func_node.end_byte]
        elif func_node.type == "attribute":
            # e.g. self.helper_method or pg_client.insert_repo
            attr_node = func_node.child_by_field_name("attribute")
            if attr_node:
                return content[attr_node.start_byte : attr_node.end_byte]
        return None

    # Stack-based traversal to extract Classes, Functions and find function calls
    node_stack: list[tuple[Any, str | None, str | None]] = [(root_node, None, None)]  # (node, parent_class_name, parent_fn_name)
    
    while node_stack:
        node, parent_class, parent_fn = node_stack.pop()
        
        # 1-indexed line numbers
        start_line = node.start_point[0] + 1
        end_line = node.end_point[0] + 1
        node_code = content[node.start_byte : node.end_byte]
        
        current_class = parent_class
        current_fn = parent_fn

        if node.type == "class_definition":
            name_node = node.child_by_field_name("name")
            class_name = content[name_node.start_byte : name_node.end_byte] if name_node else "UnknownClass"
            current_class = class_name
            
            # Extract docstring if present
            docstring = None
            body_node = node.child_by_field_name("body")
            if body_node and body_node.children:
                first_stmt = body_node.children[0]
                if first_stmt.type == "expression_statement" and first_stmt.children:
                    expr = first_stmt.children[0]
                    if expr.type == "string":
                        docstring = content[expr.start_byte : expr.end_byte].strip("\"'")

            classes.append({
                "name": class_name,
                "start_line": start_line,
                "end_line": end_line,
                "content": node_code,
                "docstring": docstring,
            })
            
        elif node.type == "function_definition":
            name_node = node.child_by_field_name("name")
            fn_name = content[name_node.start_byte : name_node.end_byte] if name_node else "unknown_fn"
            current_fn = fn_name

            # Check if async
            is_async = False
            # If the node's parent or siblings indicate async (e.g. async_def)
            # In tree-sitter, async functions are often represented under 'function_definition'
            # with 'async' keyword node. Let's look for 'async' child.
            for child in node.children:
                if child.type == "async":
                    is_async = True
                    break
            
            # Extract signature parameters
            params_node = node.child_by_field_name("parameters")
            signature = content[node.start_byte : params_node.end_byte] if params_node else fn_name

            # Extract docstring if present
            docstring = None
            body_node = node.child_by_field_name("body")
            if body_node and body_node.children:
                first_stmt = body_node.children[0]
                if first_stmt.type == "expression_statement" and first_stmt.children:
                    expr = first_stmt.children[0]
                    if expr.type == "string":
                        docstring = content[expr.start_byte : expr.end_byte].strip("\"'")

            functions.append({
                "name": fn_name,
                "class_name": parent_class,
                "start_line": start_line,
                "end_line": end_line,
                "content": node_code,
                "signature": signature,
                "is_async": is_async,
                "docstring": docstring,
            })

        elif node.type == "call" and parent_fn:
            callee = extract_callee_name(node)
            if callee:
                calls.append({
                    "caller": parent_fn,
                    "callee": callee,
                    "caller_class": parent_class,
                    "line": start_line
                })

        # Traverse children
        for child in reversed(node.children):
            node_stack.append((child, current_class, current_fn))

    # 3. Build pgvector chunks
    vector_chunks = []
    chunk_index = 0

    # Class Chunks
    for cls in classes:
        vector_chunks.append({
            "repo_id": repo_id,
            "user_id": user_id,
            "file_path": file_path,
            "chunk_index": chunk_index,
            "content": cls["content"],
            "node_type": "class",
            "node_name": cls["name"],
            "start_line": cls["start_line"],
            "end_line": cls["end_line"],
            "metadata": {
                "layer": layer,
                "frameworks": list(detected_frameworks),
                "docstring": cls["docstring"]
            }
        })
        chunk_index += 1

    # Function Chunks (excluding methods already represented inside classes, or index them independently)
    for fn in functions:
        vector_chunks.append({
            "repo_id": repo_id,
            "user_id": user_id,
            "file_path": file_path,
            "chunk_index": chunk_index,
            "content": fn["content"],
            "node_type": "function",
            "node_name": fn["name"],
            "start_line": fn["start_line"],
            "end_line": fn["end_line"],
            "metadata": {
                "layer": layer,
                "frameworks": list(detected_frameworks),
                "class_name": fn["class_name"],
                "signature": fn["signature"],
                "is_async": fn["is_async"],
                "docstring": fn["docstring"]
            }
        })
        chunk_index += 1

    # ALWAYS add file-level chunks to ensure 100% content coverage.
    # Semantic chunks (classes/functions above) provide rich metadata;
    # these file-level chunks guarantee no code is lost.
    file_text_chunks = split_into_chunks(content, chunk_size=4000, overlap=200)
    for i, text_slice in enumerate(file_text_chunks):
        char_start = i * (4000 - 200)
        start_ln = content[:char_start].count("\n") + 1
        end_ln = content[:char_start + len(text_slice)].count("\n") + 1

        vector_chunks.append({
            "repo_id": repo_id,
            "user_id": user_id,
            "file_path": file_path,
            "chunk_index": chunk_index,
            "content": text_slice,
            "node_type": "file_chunk",
            "node_name": os.path.basename(file_path),
            "start_line": start_ln,
            "end_line": end_ln,
            "metadata": {
                "layer": layer,
                "frameworks": list(detected_frameworks),
                "chunk_part": i + 1,
                "total_parts": len(file_text_chunks),
            }
        })
        chunk_index += 1

    # 4. Build Neo4j AST nodes & edges
    graph_nodes = []
    graph_edges = []

    # File node
    file_node = {
        "repo_id": repo_id,
        "path": file_path,
        "language": "python",
        "size_bytes": len(content.encode("utf-8")),
        "checksum": str(hash(content)),
    }
    graph_nodes.append(("File", file_node))

    # Class nodes and CONTAINS relationships
    for cls in classes:
        cls_node = {
            "repo_id": repo_id,
            "file_path": file_path,
            "name": cls["name"],
            "start_line": cls["start_line"],
            "end_line": cls["end_line"],
            "docstring": cls["docstring"],
        }
        graph_nodes.append(("Class", cls_node))
        
        # Edge from File -> Class
        graph_edges.append((
            "CONTAINS",
            {"repo_id": repo_id, "file_path": file_path, "child_type": "Class"},
            {"repo_id": repo_id, "file_path": file_path, "name": cls["name"]}
        ))

    # Function nodes, CONTAINS and HAS_METHOD relationships
    for fn in functions:
        fn_node = {
            "repo_id": repo_id,
            "file_path": file_path,
            "name": fn["name"],
            "start_line": fn["start_line"],
            "end_line": fn["end_line"],
            "signature": fn["signature"],
            "is_async": fn["is_async"],
            "docstring": fn["docstring"],
        }
        graph_nodes.append(("Function", fn_node))

        if fn["class_name"]:
            # Edge from Class -> Function (HAS_METHOD)
            graph_edges.append((
                "HAS_METHOD",
                {"repo_id": repo_id, "class_name": fn["class_name"], "file_path": file_path},
                {"repo_id": repo_id, "file_path": file_path, "name": fn["name"], "start_line": fn["start_line"]}
            ))
        else:
            # Edge from File -> Function (CONTAINS)
            graph_edges.append((
                "CONTAINS",
                {"repo_id": repo_id, "file_path": file_path, "child_type": "Function"},
                {"repo_id": repo_id, "file_path": file_path, "name": fn["name"], "start_line": fn["start_line"]}
            ))

    # Call relationships
    for c in calls:
        graph_edges.append((
            "CALLS",
            {
                "repo_id": repo_id,
                "caller_name": c["caller"],
                "caller_file": file_path,
                "callee_name": c["callee"],
                "callee_file": file_path,  # Local file calls, external calls resolved during post-processing
                "line": c["line"]
            },
            {}
        ))

    graph_data = {
        "nodes": graph_nodes,
        "edges": graph_edges,
        "raw_imports": imports,
        "layer": layer,
        "frameworks": list(detected_frameworks)
    }

    return vector_chunks, graph_data
