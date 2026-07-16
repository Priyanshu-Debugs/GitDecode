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
from datetime import datetime, timezone
import os
import re
import shutil
import tempfile
import subprocess
from typing import Any

import inngest

from app.api.routes.repos import inngest_client
from app.db.pg_client import SupabasePGClient
from app.core.config import get_settings
from app.services.parsers.python_parser import parse_python_file
from app.services.parsers.ts_parser import parse_ts_file
from app.services.parsers.generic_parser import parse_generic_file, parse_notebook_file
from app.services.context_caching import ContextCacheManager

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
    ctx: inngest.Context
) -> dict[str, Any]:
    """Background pipeline triggered on repo/sync.requested.

    Clones the repository, walks it, parses using tree-sitter AST,
    compiles a unified JSON graph, and saves whole files and graph to Supabase.
    """
    step = ctx.step
    event_data = ctx.event.data
    repo_id = event_data["repo_id"]
    user_id = event_data["user_id"]
    repo_url = event_data["repo_url"]
    branch = event_data.get("branch", "main")

    settings = get_settings()

    # Instantiate Supabase PG client
    pg_client = SupabasePGClient(
        supabase_url=settings.SUPABASE_URL,
        service_role_key=settings.SUPABASE_SERVICE_ROLE_KEY,
    )

    # Step 1: Update repository sync status to 'processing' (cloning)
    async def update_to_processing() -> dict[str, Any]:
        return await pg_client.update_repo_status(
            repo_id, user_id, "processing", detailed_status="cloning"
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
            
            def run_git_clone(git_cmd):
                return subprocess.run(
                    git_cmd,
                    capture_output=True,
                )

            result = await asyncio.to_thread(run_git_clone, cmd)
            if result.returncode != 0:
                # Fallback to default branch
                logger.warning(
                    "Failed to clone branch '%s'. Falling back to default branch...",
                    branch
                )
                if os.path.exists(temp_dir):
                    shutil.rmtree(temp_dir, ignore_errors=True)
                os.makedirs(temp_dir, exist_ok=True)

                fallback_cmd = [
                    "git",
                    "clone",
                    "--depth",
                    "1",
                    repo_url,
                    temp_dir,
                ]
                result = await asyncio.to_thread(run_git_clone, fallback_cmd)
                if result.returncode != 0:
                    stderr_text = result.stderr.decode("utf-8", errors="ignore")
                    raise RuntimeError(
                        f"Git clone failed: {stderr_text}"
                    )
            return temp_dir

        temp_dir = await step.run("clone_repo", clone_repo_step)

        # Update detailed_status to 'parsing'
        async def update_to_parsing() -> dict[str, Any]:
            return await pg_client.update_repo_status(
                repo_id, user_id, "processing", detailed_status="parsing"
            )
        await step.run("update_status_parsing", update_to_parsing)

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

            files_to_save = []
            all_graph_nodes = []
            all_graph_edges = []
            file_imports_map: dict[str, list[str]] = {}

            BINARY_EXTENSIONS = {
                ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".tiff", ".bmp",
                ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
                ".zip", ".tar", ".gz", ".rar", ".7z", ".bz2", ".xz",
                ".mp3", ".mp4", ".avi", ".mkv", ".mov", ".wav", ".flac", ".ogg",
                ".exe", ".dll", ".so", ".bin", ".o", ".a", ".lib", ".out", ".app", ".dmg",
                ".woff", ".woff2", ".ttf", ".otf", ".eot",
                ".db", ".sqlite", ".sqlite3",
                ".pyc", ".pyd", ".pyo"
            }

            for rel_path in all_files:
                full_path = os.path.join(temp_dir, rel_path)
                ext = os.path.splitext(rel_path)[1].lower()
                
                if ext in BINARY_EXTENSIONS:
                    continue

                # Skip massive files (e.g. large CSVs, telemetry datasets) to prevent OOM/Payload limits
                MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024 if ext == ".ipynb" else 1 * 1024 * 1024
                try:
                    if os.path.getsize(full_path) > MAX_FILE_SIZE_BYTES:
                        logger.warning("Skipping large file %s (exceeds size limit)", rel_path)
                        continue
                except OSError:
                    continue

                try:
                    with open(
                        full_path, "r", encoding="utf-8", errors="ignore"
                    ) as f:
                        file_content = f.read().replace("\x00", "")
                except Exception as e:
                    logger.error(
                        "Could not read content of file %s: %s",
                        rel_path,
                        str(e),
                    )
                    continue

                # Run AST parser
                if ext == ".py":
                    graph_data = parse_python_file(
                        file_content, rel_path, repo_id, user_id
                    )
                elif ext in (".ts", ".tsx", ".js", ".jsx"):
                    graph_data = parse_ts_file(
                        file_content, rel_path, repo_id, user_id
                    )
                elif ext == ".ipynb":
                    graph_data = parse_notebook_file(
                        file_content, rel_path, repo_id, user_id
                    )
                else:
                    graph_data = parse_generic_file(
                        file_content, rel_path, repo_id, user_id
                    )

                all_graph_nodes.extend(graph_data["nodes"])
                all_graph_edges.extend(graph_data["edges"])
                file_imports_map[rel_path] = graph_data["raw_imports"]

                # Dynamic language mapping
                language = ext.lstrip('.') if ext else "text"
                if language == "tsx":
                    language = "typescript"
                elif language == "jsx":
                    language = "javascript"
                elif language == "yml":
                    language = "yaml"

                files_to_save.append({
                    "repo_id": repo_id,
                    "user_id": user_id,
                    "file_path": rel_path,
                    "language": language,
                    "content": file_content,
                    "size_bytes": len(file_content.encode("utf-8")),
                    "checksum": str(hash(file_content))
                })

            # Reconstruct unified JSON graph nodes
            resolved_nodes = []
            
            # Map of class/function details to easily group under files
            file_symbols = {}
            classes_count = 0
            functions_count = 0
            
            for label, props in all_graph_nodes:
                if label == "File":
                    # Handled by base file node creation below
                    continue
                
                fp = props.get("file_path")
                if not fp:
                    continue
                
                symbol = {
                    "type": label.lower(),
                    "name": props["name"],
                    "start_line": props["start_line"],
                    "end_line": props["end_line"],
                    "docstring": props.get("docstring"),
                    "signature": props.get("signature", "")
                }
                if label == "Class":
                    classes_count += 1
                elif label == "Function":
                    functions_count += 1
                    symbol["is_async"] = props.get("is_async", False)
                
                file_symbols.setdefault(fp, []).append(symbol)

            # Build file nodes containing their symbol list
            languages_breakdown = {}
            for file_entry in files_to_save:
                fp = file_entry["file_path"]
                lang = file_entry["language"]
                languages_breakdown[lang] = languages_breakdown.get(lang, 0) + 1
                
                resolved_nodes.append({
                    "id": fp,
                    "label": os.path.basename(fp),
                    "type": "file",
                    "language": lang,
                    "size_bytes": file_entry["size_bytes"],
                    "checksum": file_entry["checksum"],
                    "symbols": file_symbols.get(fp, [])
                })

            # Stitch resolved edges
            resolved_edges = []
            
            # Stitch AST imports edges
            for source_file, import_stmts in file_imports_map.items():
                for import_stmt in import_stmts:
                    target_file = resolve_import_path(import_stmt, source_file, all_files)
                    if target_file and target_file != source_file:
                        resolved_edges.append({
                            "source": source_file,
                            "target": target_file,
                            "type": "IMPORTS"
                        })

            # Stitch AST caller/callee or class/method edges
            for rel_type, start_props, end_props in all_graph_edges:
                if rel_type == "CALLS":
                    # Caller and callee function nodes
                    resolved_edges.append({
                        "source": f"{start_props['caller_file']}#{start_props['caller_name']}",
                        "target": f"{start_props['callee_file']}#{start_props['callee_name']}",
                        "type": "CALLS",
                        "line": start_props.get("line")
                    })
                elif rel_type == "HAS_METHOD":
                    # Class to method
                    resolved_edges.append({
                        "source": f"{start_props['file_path']}#{start_props['class_name']}",
                        "target": f"{start_props['file_path']}#{end_props['name']}",
                        "type": "HAS_METHOD"
                    })

            # Combine graph
            graph_data = {
                "nodes": resolved_nodes,
                "edges": resolved_edges
            }

            # Compile stats
            stats = {
                "files_count": len(files_to_save),
                "classes_count": classes_count,
                "functions_count": functions_count,
                "languages": languages_breakdown,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }

            # Save state as temporary files to avoid Inngest payload limits
            with open(os.path.join(temp_dir, "files_to_save.json"), "w", encoding="utf-8") as f:
                json.dump(files_to_save, f)
            with open(os.path.join(temp_dir, "graph_data.json"), "w", encoding="utf-8") as f:
                json.dump(graph_data, f)
            with open(os.path.join(temp_dir, "stats.json"), "w", encoding="utf-8") as f:
                json.dump(stats, f)

            return {
                "files_count": len(files_to_save),
                "classes_count": classes_count,
                "functions_count": functions_count
            }

        await step.run("parse_ast", parse_ast_step)

        # Update detailed_status to 'saving'
        async def update_to_saving() -> dict[str, Any]:
            return await pg_client.update_repo_status(
                repo_id, user_id, "processing", detailed_status="saving"
            )
        await step.run("update_status_saving", update_to_saving)

        # Step C: Save files and graph structure to Supabase
        async def save_to_dbs_step() -> dict[str, Any]:
            # Load states
            files_path = os.path.join(temp_dir, "files_to_save.json")
            graph_path = os.path.join(temp_dir, "graph_data.json")
            stats_path = os.path.join(temp_dir, "stats.json")

            files_to_save = []
            if os.path.exists(files_path):
                with open(files_path, "r", encoding="utf-8") as f:
                    files_to_save = json.load(f)

            graph_data = {"nodes": [], "edges": []}
            if os.path.exists(graph_path):
                with open(graph_path, "r", encoding="utf-8") as f:
                    graph_data = json.load(f)

            stats = {}
            if os.path.exists(stats_path):
                with open(stats_path, "r", encoding="utf-8") as f:
                    stats = json.load(f)

            # Purge stale DB files & graph
            logger.info("Purging old records for repo_id: %s", repo_id)
            await pg_client.delete_repo_files(repo_id, user_id)
            await pg_client.delete_repo_graph(repo_id, user_id)

            # Insert files in batches
            if files_to_save:
                logger.info("Inserting %d repository files to Supabase...", len(files_to_save))
                db_batch_size = 50
                for j in range(0, len(files_to_save), db_batch_size):
                    await pg_client.insert_repo_files(
                        files_to_save[j : j + db_batch_size]
                    )

            # Insert code graph
            logger.info("Saving code graph structure...")
            await pg_client.save_repo_graph(repo_id, user_id, graph_data, stats)

            # Pre-warm/Pre-create the Gemini context cache for the repository
            logger.info("Pre-warming Gemini Context Cache for repo_id: %s", repo_id)
            cache_mgr = ContextCacheManager(pg_client)
            await cache_mgr.get_or_create_cache(repo_id, user_id, "gemini-3.1-flash-lite")

            # Clean up temp folder
            shutil.rmtree(temp_dir, ignore_errors=True)
            return {"saved_files": len(files_to_save)}

        await step.run("save_to_dbs", save_to_dbs_step)

        # Update detailed_status to 'diagrams'
        async def update_to_diagrams() -> dict[str, Any]:
            return await pg_client.update_repo_status(
                repo_id, user_id, "processing", detailed_status="diagrams"
            )
        await step.run("update_status_diagrams", update_to_diagrams)

        # Step D: Generate repository diagrams
        async def generate_diagrams_step() -> dict[str, Any]:
            repo_row = await pg_client.get_repo(repo_id, user_id)
            repo_name = "repo"
            if repo_row and repo_row.get("github_url"):
                repo_name = repo_row["github_url"].split("/")[-1]

            from app.services.diagram_generator import DiagramGenerator
            generator = DiagramGenerator(pg_client)
            diagrams = await generator.generate_all_diagrams(repo_id, repo_name, user_id)
            await pg_client.update_repo_diagrams(repo_id, user_id, diagrams)
            return {"diagrams_count": len(diagrams)}

        await step.run("generate_diagrams", generate_diagrams_step)

        # Update status to 'completed'
        async def update_to_completed() -> dict[str, Any]:
            return await pg_client.update_repo_status(
                repo_id, user_id, "completed", detailed_status="completed"
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
                repo_id, user_id, "failed", detailed_status="failed", error_message=str(e)
            )

        await step.run("update_status_failed", update_to_failed)
        return {"status": "failed", "error": str(e), "repo_id": repo_id}
