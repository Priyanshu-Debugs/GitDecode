"""
GitMesh — TypeScript/JavaScript AST Parser
===========================================
Parses TypeScript and JavaScript source files using Tree-Sitter. Supports TSX
and JSX formats, chunking code into logical boundaries (classes, interfaces,
functions, methods), resolving import paths, and building a knowledge graph.
"""

from __future__ import annotations

import os
from typing import Any

from tree_sitter import Language, Parser
import tree_sitter_typescript

# Initialize Tree-Sitter Languages for TypeScript and TSX
TS_LANGUAGE = Language(tree_sitter_typescript.language_typescript())
TSX_LANGUAGE = Language(tree_sitter_typescript.language_tsx())

ts_parser = Parser()
ts_parser.language = TS_LANGUAGE

tsx_parser = Parser()
tsx_parser.language = TSX_LANGUAGE


# JS/TS Framework signatures for frontend vs backend detection
BACKEND_PACKAGES = {
    "express", "koa", "nestjs", "fastify", "hapi", "mongodb", "mongoose",
    "pg", "redis", "prisma", "sequelize", "knex", "apollo-server", "graphql",
    "dotenv", "morgan", "helmet", "cors", "body-parser", "jsonwebtoken"
}

FRONTEND_PACKAGES = {
    "react", "react-dom", "vue", "angular", "@angular/core", "next", "svelte",
    "solid-js", "tailwind", "bootstrap", "sass", "less", "@mui/material",
    "antd", "chakra-ui", "jquery", "recharts", "redux", "mobx", "zustand",
    "framer-motion", "next-auth"
}


def parse_ts_file(
    content: str,
    file_path: str,
    repo_id: str,
    user_id: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Parse TypeScript/JavaScript source code into vector chunks and graph data.

    Supports both .ts/.js and .tsx/.jsx files by selecting the appropriate grammar.

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
    # Select parser based on file extension
    ext = os.path.splitext(file_path)[1].lower()
    is_tsx = ext in (".tsx", ".jsx")
    
    current_parser = tsx_parser if is_tsx else ts_parser
    current_lang = TSX_LANGUAGE if is_tsx else TS_LANGUAGE
    
    # Run the parser
    tree = current_parser.parse(bytes(content, "utf-8"))
    root_node = tree.root_node

    # 1. Extract raw imports and classify layer (frontend/backend)
    imports = []
    detected_frameworks = set()

    stack = [root_node]
    while stack:
        node = stack.pop()
        if node.type == "import_statement":
            stmt_text = content[node.start_byte : node.end_byte]
            imports.append(stmt_text)
            
            # Extract framework from import statement
            # Typically: import { x } from 'framework' or import x from "framework"
            # Simple check: extract contents of single or double quotes
            import_source = ""
            for child in node.children:
                if child.type == "string":
                    import_source = content[child.start_byte : child.end_byte].strip("\"'")
                    break
            
            if import_source:
                # Clean up scopes (e.g. @angular/core -> angular)
                pkg_name = import_source.lower()
                if pkg_name in BACKEND_PACKAGES or pkg_name.split("/")[0] in BACKEND_PACKAGES:
                    detected_frameworks.add(pkg_name)
                if pkg_name in FRONTEND_PACKAGES or pkg_name.split("/")[0] in FRONTEND_PACKAGES:
                    detected_frameworks.add(pkg_name)
        else:
            for child in reversed(node.children):
                stack.append(child)

    # Classification logic
    backend_count = len(detected_frameworks & BACKEND_PACKAGES)
    frontend_count = len(detected_frameworks & FRONTEND_PACKAGES)

    if is_tsx:
        layer = "frontend"
    elif frontend_count > backend_count:
        layer = "frontend"
    elif backend_count > 0:
        layer = "backend"
    else:
        # Fallback on path analysis
        path_lower = file_path.lower()
        if "frontend" in path_lower or "client" in path_lower or "components" in path_lower or "pages" in path_lower:
            layer = "frontend"
        elif "backend" in path_lower or "server" in path_lower or "api" in path_lower or "routes" in path_lower:
            layer = "backend"
        else:
            layer = "shared"

    # 2. Extract logical boundaries (Classes, Interfaces, Functions, Methods)
    classes = []
    interfaces = []
    functions = []
    calls = []

    def extract_fn_name_from_variable(var_declarator: Any) -> str | None:
        """Extract function name if lexical variable equals arrow function."""
        id_node = var_declarator.child_by_field_name("name")
        value_node = var_declarator.child_by_field_name("value")
        if id_node and value_node and value_node.type in ("arrow_function", "function_expression"):
            return content[id_node.start_byte : id_node.end_byte]
        return None

    # Stack-based traversal (node, parent_class_name, parent_fn_name)
    node_stack: list[tuple[Any, str | None, str | None]] = [(root_node, None, None)]
    
    while node_stack:
        node, parent_class, parent_fn = node_stack.pop()
        
        start_line = node.start_point[0] + 1
        end_line = node.end_point[0] + 1
        node_code = content[node.start_byte : node.end_byte]
        
        current_class = parent_class
        current_fn = parent_fn

        if node.type == "class_declaration":
            name_node = node.child_by_field_name("name")
            class_name = content[name_node.start_byte : name_node.end_byte] if name_node else "UnknownClass"
            current_class = class_name
            
            # Simple docstring search (preceding comment in TS is outside, but we look for internal description)
            classes.append({
                "name": class_name,
                "start_line": start_line,
                "end_line": end_line,
                "content": node_code,
                "docstring": None
            })

        elif node.type == "interface_declaration":
            name_node = node.child_by_field_name("name")
            if name_node:
                if_name = content[name_node.start_byte : name_node.end_byte]
                interfaces.append({
                    "name": if_name,
                    "start_line": start_line,
                    "end_line": end_line,
                    "content": node_code
                })

        elif node.type == "function_declaration":
            name_node = node.child_by_field_name("name")
            fn_name = content[name_node.start_byte : name_node.end_byte] if name_node else "anonymous_fn"
            current_fn = fn_name
            
            # Check async signature
            is_async = False
            for child in node.children:
                if child.type == "async":
                    is_async = True
                    break

            functions.append({
                "name": fn_name,
                "class_name": parent_class,
                "start_line": start_line,
                "end_line": end_line,
                "content": node_code,
                "signature": f"function {fn_name}",
                "is_async": is_async,
                "docstring": None
            })

        elif node.type == "method_definition":
            name_node = node.child_by_field_name("name")
            method_name = content[name_node.start_byte : name_node.end_byte] if name_node else "anonymous_method"
            current_fn = method_name
            
            # Check async
            is_async = False
            for child in node.children:
                if child.type == "async":
                    is_async = True
                    break

            functions.append({
                "name": method_name,
                "class_name": parent_class,
                "start_line": start_line,
                "end_line": end_line,
                "content": node_code,
                "signature": f"method {method_name}",
                "is_async": is_async,
                "docstring": None
            })

        elif node.type == "lexical_declaration" or node.type == "variable_declaration":
            # Check if any child declarator matches an arrow function assignment
            # variable_declaration -> variable_declarator -> name (id) & value (arrow_function)
            for child in node.children:
                if child.type == "variable_declarator":
                    fn_name = extract_fn_name_from_variable(child)
                    if fn_name:
                        current_fn = fn_name
                        functions.append({
                            "name": fn_name,
                            "class_name": parent_class,
                            "start_line": start_line,
                            "end_line": end_line,
                            "content": node_code,
                            "signature": f"const {fn_name}",
                            "is_async": "async" in node_code[:50],  # simple async test
                            "docstring": None
                        })

        elif node.type == "call_expression" and parent_fn:
            # function calls: foo() or obj.method()
            # The function node is the first child
            func_node = node.child_by_field_name("function")
            if func_node:
                callee_name = ""
                if func_node.type == "identifier":
                    callee_name = content[func_node.start_byte : func_node.end_byte]
                elif func_node.type == "member_expression":
                    # e.g. console.log or database.execute
                    property_node = func_node.child_by_field_name("property")
                    if property_node:
                        callee_name = content[property_node.start_byte : property_node.end_byte]
                
                if callee_name:
                    calls.append({
                        "caller": parent_fn,
                        "callee": callee_name,
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
                "is_tsx": is_tsx
            }
        })
        chunk_index += 1

    # Interface Chunks
    for iface in interfaces:
        vector_chunks.append({
            "repo_id": repo_id,
            "user_id": user_id,
            "file_path": file_path,
            "chunk_index": chunk_index,
            "content": iface["content"],
            "node_type": "class",  # map interface as class-type boundary in pgvector for simplicity
            "node_name": iface["name"],
            "start_line": iface["start_line"],
            "end_line": iface["end_line"],
            "metadata": {
                "layer": layer,
                "frameworks": list(detected_frameworks),
                "is_tsx": is_tsx,
                "kind": "interface"
            }
        })
        chunk_index += 1

    # Function/Method Chunks
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
                "is_tsx": is_tsx
            }
        })
        chunk_index += 1

    # File fallback chunk
    if not vector_chunks:
        vector_chunks.append({
            "repo_id": repo_id,
            "user_id": user_id,
            "file_path": file_path,
            "chunk_index": chunk_index,
            "content": content[:4000],
            "node_type": "file",
            "node_name": os.path.basename(file_path),
            "start_line": 1,
            "end_line": len(content.splitlines()),
            "metadata": {
                "layer": layer,
                "frameworks": list(detected_frameworks),
                "is_tsx": is_tsx
            }
        })

    # 4. Build Neo4j AST nodes & edges
    graph_nodes = []
    graph_edges = []

    # File node
    file_node = {
        "repo_id": repo_id,
        "path": file_path,
        "language": "typescript" if ext in (".ts", ".tsx") else "javascript",
        "size_bytes": len(content.encode("utf-8")),
        "checksum": str(hash(content)),
    }
    graph_nodes.append(("File", file_node))

    # Class nodes
    for cls in classes:
        cls_node = {
            "repo_id": repo_id,
            "file_path": file_path,
            "name": cls["name"],
            "start_line": cls["start_line"],
            "end_line": cls["end_line"],
            "docstring": None,
        }
        graph_nodes.append(("Class", cls_node))
        
        # File -> Class (CONTAINS)
        graph_edges.append((
            "CONTAINS",
            {"repo_id": repo_id, "file_path": file_path, "child_type": "Class"},
            {"repo_id": repo_id, "file_path": file_path, "name": cls["name"]}
        ))

    # Function/Method nodes
    for fn in functions:
        fn_node = {
            "repo_id": repo_id,
            "file_path": file_path,
            "name": fn["name"],
            "start_line": fn["start_line"],
            "end_line": fn["end_line"],
            "signature": fn["signature"],
            "is_async": fn["is_async"],
            "docstring": None,
        }
        graph_nodes.append(("Function", fn_node))

        if fn["class_name"]:
            # Class -> Function (HAS_METHOD)
            graph_edges.append((
                "HAS_METHOD",
                {"repo_id": repo_id, "class_name": fn["class_name"], "file_path": file_path},
                {"repo_id": repo_id, "file_path": file_path, "name": fn["name"], "start_line": fn["start_line"]}
            ))
        else:
            # File -> Function (CONTAINS)
            graph_edges.append((
                "CONTAINS",
                {"repo_id": repo_id, "file_path": file_path, "child_type": "Function"},
                {"repo_id": repo_id, "file_path": file_path, "name": fn["name"], "start_line": fn["start_line"]}
            ))

    # Call edges
    for c in calls:
        graph_edges.append((
            "CALLS",
            {
                "repo_id": repo_id,
                "caller_name": c["caller"],
                "caller_file": file_path,
                "callee_name": c["callee"],
                "callee_file": file_path,
                "line": c["line"]
            }
        ))

    graph_data = {
        "nodes": graph_nodes,
        "edges": graph_edges,
        "raw_imports": imports,
        "layer": layer,
        "frameworks": list(detected_frameworks)
    }

    return vector_chunks, graph_data
