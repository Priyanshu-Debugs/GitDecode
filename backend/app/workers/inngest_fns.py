"""
GitMesh — Inngest Background Workers
=====================================
Boilerplate and pipeline execution for the background repository ingestion.
Orchestrates: clone_repo -> parse_ast -> generate_embeddings -> save_to_dbs.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
import tempfile
import subprocess
from typing import Any

import inngest

from app.api.routes.repos import inngest_client
from app.db.neo4j_client import Neo4jClient
from app.db.pg_client import SupabasePGClient
from app.core.config import get_settings
from app.services.embeddings import HuggingFaceEmbeddingsClient
from app.services.parsers.python_parser import parse_python_file
from app.services.parsers.ts_parser import parse_ts_file

logger = logging.getLogger(__name__)


def resolve_import_path(
    import_stmt: str, source_file: str, all_files: list[str]
) -> str | None:
    """Scan and resolve import statements to map file dependencies.

    Supports Python and TypeScript/JavaScript relative/absolute imports.
    """
    import_stmt = import_stmt.strip()

    # 1. TypeScript relative/absolute import matching
    ts_match = re.search(r"from\s+['\"]([^'\"]+)['\"]", import_stmt)
    if ts_match:
        import_path = ts_match.group(1)
        if import_path.startswith("."):
            # Relative import
            source_dir = os.path.dirname(source_file)
            resolved = os.path.normpath(os.path.join(source_dir, import_path)).replace(
                os.sep, "/"
            )
            # Try standard extensions and index files
            candidates = [
                resolved + ext
                for ext in (
                    ".ts",
                    ".tsx",
                    ".js",
                    ".jsx",
                    "/index.ts",
                    "/index.tsx",
                    "/index.js",
                )
            ]
            for candidate in candidates:
                candidate = os.path.normpath(candidate).replace(os.sep, "/")
                if candidate in all_files:
                    return candidate
        else:
            # Check for path mapping/alias or package import that matches an internal file
            clean_path = re.sub(r"^@\/", "", import_path)
            for file in all_files:
                if file.endswith(clean_path) or clean_path in file:
                    return file

    # 2. Python imports
    py_from_match = re.search(r"from\s+([\w\.]+)\s+import", import_stmt)
    py_import_match = re.search(r"^import\s+([\w\.]+)", import_stmt)

    module_path = None
    if py_from_match:
        module_path = py_from_match.group(1)
    elif py_import_match:
        module_path = py_import_match.group(1)

    if module_path:
        if module_path.startswith("."):
            # Relative import: "from .utils import ..."
            dots_count = len(module_path) - len(module_path.lstrip("."))
            stripped_module = module_path.lstrip(".")
            parts = source_file.split("/")
            if len(parts) >= dots_count:
                source_dir_parts = parts[:-dots_count] if dots_count > 1 else parts[:-1]
                resolved_base = "/".join(source_dir_parts)
                resolved_module = (
                    f"{resolved_base}/{stripped_module.replace('.', '/')}"
                    if resolved_base
                    else stripped_module.replace(".", "/")
                )
                for ext in (".py", "/__init__.py"):
                    candidate = os.path.normpath(resolved_module + ext).replace(
                        os.sep, "/"
                    )
                    if candidate in all_files:
                        return candidate
        else:
            # Absolute module: "from app.core.config import ..."
            path_converted = module_path.replace(".", "/")
            for file in all_files:
                if file.endswith(f"{path_converted}.py") or file.endswith(
                    f"{path_converted}/__init__.py"
                ):
                    return file

    return None


@inngest_client.create_function(
    fn_id="sync_github_repository",
    trigger=inngest.TriggerEvent(event="repo/sync.requested"),
)
async def sync_github_repository(
    ctx: inngest.Context, step: inngest.Step
) -> dict[str, Any]:
    """Background pipeline triggered on repo/sync.requested.

    Clones the repository, walks it, chunks code using tree-sitter,
    generates 768-dimensional embeddings, and saves metadata/relations.
    """
    event_data = ctx.event.data
    repo_id = event_data["repo_id"]
    user_id = event_data["user_id"]
    repo_url = event_data["repo_url"]
    branch = event_data.get("branch", "main")

    settings = get_settings()

    # Instantiate database clients
    pg_client = SupabasePGClient(
        supabase_url=settings.SUPABASE_URL,
        service_role_key=settings.SUPABASE_SERVICE_ROLE_KEY,
    )
    neo4j_client = Neo4jClient(
        uri=settings.NEO4J_URI,
        username=settings.NEO4J_USERNAME,
        password=settings.NEO4J_PASSWORD,
    )

    # Step 1: Update repository sync status to 'processing'
    async def update_to_processing() -> dict[str, Any]:
        return await pg_client.update_repo_status(
            repo_id, user_id, "processing"
        )

    await step.run("update_status_processing", update_to_processing)

    try:
        # Step A: Clone the repository to the temp directory
        async def clone_repo_step() -> str:
            temp_dir = os.path.join(tempfile.gettempdir(), f"gitmesh_{repo_id}")
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir, ignore_errors=True)
            os.makedirs(temp_dir, exist_ok=True)

            logger.info(
                "Cloning repository %s (branch: %s) to %s",
                repo_url,
                branch,
                temp_dir,
            )
            cmd = [
                "git",
                "clone",
                "--depth",
                "1",
                "--branch",
                branch,
                repo_url,
                temp_dir,
            ]
            
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            stdout, stderr = await process.communicate()
            if process.returncode != 0:
                raise RuntimeError(
                    f"Git clone failed: {stderr.decode('utf-8')}"
                )
            return temp_dir

        temp_dir = await step.run("clone_repo", clone_repo_step)

        # Step B: Walk directory and parse file ASTs
        async def parse_ast_step() -> dict[str, Any]:
            all_files: list[str] = []
            for root, _, files_list in os.walk(temp_dir):
                for file in files_list:
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, temp_dir).replace(
                        os.sep, "/"
                    )
                    if (
                        ".git" in rel_path
                        or ".venv" in rel_path
                        or "node_modules" in rel_path
                    ):
                        continue
                    all_files.append(rel_path)

            all_chunks = []
            all_graph_nodes = []
            all_graph_edges = []
            file_imports_map: dict[str, list[str]] = {}

            for rel_path in all_files:
                full_path = os.path.join(temp_dir, rel_path)
                ext = os.path.splitext(rel_path)[1].lower()
                if ext not in (".py", ".ts", ".tsx", ".js", ".jsx"):
                    continue

                try:
                    with open(
                        full_path, "r", encoding="utf-8", errors="ignore"
                    ) as f:
                        file_content = f.read()
                except Exception as e:
                    logger.error(
                        "Could not read content of file %s: %s",
                        rel_path,
                        str(e),
                    )
                    continue

                if ext == ".py":
                    chunks, graph_data = parse_python_file(
                        file_content, rel_path, repo_id, user_id
                    )
                else:
                    chunks, graph_data = parse_ts_file(
                        file_content, rel_path, repo_id, user_id
                    )

                all_chunks.extend(chunks)
                all_graph_nodes.extend(graph_data["nodes"])
                all_graph_edges.extend(graph_data["edges"])
                file_imports_map[rel_path] = graph_data["raw_imports"]

            # Save state as temporary files to avoid Inngest payload limits
            with open(os.path.join(temp_dir, "chunks.json"), "w", encoding="utf-8") as f:
                json.dump(all_chunks, f)
            with open(os.path.join(temp_dir, "graph_nodes.json"), "w", encoding="utf-8") as f:
                json.dump(all_graph_nodes, f)
            with open(os.path.join(temp_dir, "graph_edges.json"), "w", encoding="utf-8") as f:
                json.dump(all_graph_edges, f)
            with open(os.path.join(temp_dir, "imports.json"), "w", encoding="utf-8") as f:
                json.dump({"imports": file_imports_map, "all_files": all_files}, f)

            return {
                "chunks_count": len(all_chunks),
                "files_count": len(all_files),
            }

        await step.run("parse_ast", parse_ast_step)

        # Step C: Batch generate embeddings
        async def generate_embeddings_step() -> int:
            chunks_path = os.path.join(temp_dir, "chunks.json")
            if not os.path.exists(chunks_path):
                return 0
            
            with open(chunks_path, "r", encoding="utf-8") as f:
                all_chunks = json.load(f)

            if not all_chunks:
                return 0

            emb_client = HuggingFaceEmbeddingsClient()
            batch_size = 16
            chunk_contents = [c["content"] for c in all_chunks]
            embeddings: list[list[float]] = []

            logger.info(
                "Generating embeddings for %d chunks in batches of %d...",
                len(all_chunks),
                batch_size,
            )
            for i in range(0, len(chunk_contents), batch_size):
                batch_texts = chunk_contents[i : i + batch_size]
                batch_embs = await emb_client.get_embeddings(batch_texts)
                embeddings.extend(batch_embs)
                await asyncio.sleep(0.3)

            for chunk, embedding in zip(all_chunks, embeddings):
                chunk["embedding"] = embedding

            with open(chunks_path, "w", encoding="utf-8") as f:
                json.dump(all_chunks, f)

            return len(all_chunks)

        await step.run("generate_embeddings", generate_embeddings_step)

        # Step D: Save chunks and graph structure to DBs
        async def save_to_dbs_step() -> dict[str, Any]:
            # Load states
            chunks_path = os.path.join(temp_dir, "chunks.json")
            nodes_path = os.path.join(temp_dir, "graph_nodes.json")
            edges_path = os.path.join(temp_dir, "graph_edges.json")
            imports_path = os.path.join(temp_dir, "imports.json")

            all_chunks = []
            if os.path.exists(chunks_path):
                with open(chunks_path, "r", encoding="utf-8") as f:
                    all_chunks = json.load(f)

            all_graph_nodes = []
            if os.path.exists(nodes_path):
                with open(nodes_path, "r", encoding="utf-8") as f:
                    all_graph_nodes = json.load(f)

            all_graph_edges = []
            if os.path.exists(edges_path):
                with open(edges_path, "r", encoding="utf-8") as f:
                    all_graph_edges = json.load(f)

            imports_data = {"imports": {}, "all_files": []}
            if os.path.exists(imports_path):
                with open(imports_path, "r", encoding="utf-8") as f:
                    imports_data = json.load(f)

            # Purge stale db items only in final step to keep previous data active if pipeline fails mid-run
            logger.info("Purging old records for repo_id: %s", repo_id)
            await pg_client.delete_repo_chunks(repo_id, user_id)
            await neo4j_client.delete_repo_graph(repo_id)

            # Insert chunks to Supabase
            if all_chunks:
                logger.info(
                    "Inserting %d vector chunks to Supabase...",
                    len(all_chunks),
                )
                db_batch_size = 100
                for j in range(0, len(all_chunks), db_batch_size):
                    await pg_client.insert_vector_chunks(
                        all_chunks[j : j + db_batch_size]
                    )

            # Insert nodes to Neo4j
            logger.info("Inserting nodes to Neo4j...")
            for label, props in all_graph_nodes:
                if label == "File":
                    await neo4j_client.upsert_file_node(
                        repo_id=repo_id,
                        path=props["path"],
                        language=props["language"],
                        size_bytes=props["size_bytes"],
                        checksum=props["checksum"],
                    )
                elif label == "Class":
                    await neo4j_client.upsert_class_node(
                        repo_id=repo_id,
                        name=props["name"],
                        file_path=props["file_path"],
                        start_line=props["start_line"],
                        end_line=props["end_line"],
                        docstring=props.get("docstring"),
                    )
                elif label == "Function":
                    await neo4j_client.upsert_function_node(
                        repo_id=repo_id,
                        name=props["name"],
                        file_path=props["file_path"],
                        start_line=props["start_line"],
                        end_line=props["end_line"],
                        signature=props["signature"],
                        is_async=props["is_async"],
                        docstring=props.get("docstring"),
                    )

            # Insert edges to Neo4j
            logger.info("Inserting relationships to Neo4j...")
            for rel_type, start_props, end_props in all_graph_edges:
                if rel_type == "CONTAINS":
                    await neo4j_client.create_contains_edge(
                        repo_id=repo_id,
                        file_path=start_props["file_path"],
                        child_type=start_props["child_type"],
                        child_identifier={
                            k: v
                            for k, v in end_props.items()
                            if k != "repo_id"
                        },
                    )
                elif rel_type == "HAS_METHOD":
                    await neo4j_client.create_has_method_edge(
                        repo_id=repo_id,
                        class_name=start_props["class_name"],
                        method_name=end_props["name"],
                        file_path=start_props["file_path"],
                    )
                elif rel_type == "CALLS":
                    await neo4j_client.create_calls_edge(
                        repo_id=repo_id,
                        caller_name=start_props["caller_name"],
                        callee_name=start_props["callee_name"],
                        caller_file=start_props["caller_file"],
                        callee_file=start_props["callee_file"],
                        line=start_props.get("line"),
                    )

            # Resolve external file imports
            logger.info("Stitching import links...")
            file_imports_map = imports_data.get("imports", {})
            all_files = imports_data.get("all_files", [])
            for source_file, import_stmts in file_imports_map.items():
                for import_stmt in import_stmts:
                    target_file = resolve_import_path(
                        import_stmt, source_file, all_files
                    )
                    if target_file and target_file != source_file:
                        await neo4j_client.create_imports_edge(
                            repo_id=repo_id,
                            source_path=source_file,
                            target_path=target_file,
                        )

            # Clean up temp folder
            shutil.rmtree(temp_dir, ignore_errors=True)
            return {"saved_chunks": len(all_chunks)}

        await step.run("save_to_dbs", save_to_dbs_step)

        # Update status to 'completed'
        async def update_to_completed() -> dict[str, Any]:
            return await pg_client.update_repo_status(
                repo_id, user_id, "completed"
            )

        await step.run("update_status_completed", update_to_completed)
        return {"status": "success", "repo_id": repo_id}

    except Exception as e:
        logger.exception("Ingestion failed for repo %s: %s", repo_id, str(e))
        # Ensure cleanup if possible
        temp_dir = os.path.join(tempfile.gettempdir(), f"gitmesh_{repo_id}")
        shutil.rmtree(temp_dir, ignore_errors=True)

        # Update status to 'failed'
        async def update_to_failed() -> dict[str, Any]:
            return await pg_client.update_repo_status(
                repo_id, user_id, "failed"
            )

        await step.run("update_status_failed", update_to_failed)
        return {"status": "failed", "error": str(e), "repo_id": repo_id}
