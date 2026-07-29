"""
GitDecode — Inngest Background Workers
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
import stat
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


# ── Module-Level Helpers for Incremental Sync ────────────────────────

def _parse_git_diff(diff_output: str) -> list[tuple[str, str]]:
    """Parse ``git diff --name-status`` output into a list of (status, file_path).

    Status codes returned by git:
        A = Added, M = Modified, D = Deleted, R = Renamed (Rxx prefix)

    Returns:
        List of (status_char, file_path) tuples.
    """
    changes: list[tuple[str, str]] = []
    for line in diff_output.strip().splitlines():
        parts = line.split("\t")
        if len(parts) >= 2:
            status = parts[0][0]  # First character: A, M, D, R …
            file_path = parts[-1]  # Last element handles renames (old \t new)
            changes.append((status, file_path))
    return changes


_BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".tiff", ".bmp",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".zip", ".tar", ".gz", ".rar", ".7z", ".bz2", ".xz",
    ".mp3", ".mp4", ".avi", ".mkv", ".mov", ".wav", ".flac", ".ogg",
    ".exe", ".dll", ".so", ".bin", ".o", ".a", ".lib", ".out", ".app", ".dmg",
    ".woff", ".woff2", ".ttf", ".otf", ".eot",
    ".db", ".sqlite", ".sqlite3",
    ".pyc", ".pyd", ".pyo",
}


def _parse_single_file_for_graph(
    rel_path: str,
    full_path: str,
    repo_id: str,
    user_id: str,
    all_file_paths: list[str],
) -> tuple[str | None, dict | None, list[dict]]:
    """Read and AST-parse a single file and build its graph representation.

    Returns a 3-tuple:
        - content (str|None): raw file content, or None if file should be skipped.
        - file_node (dict|None): the resolved graph node for this file.
        - new_edges (list[dict]): import edges originating from this file.
    """
    ext = os.path.splitext(rel_path)[1].lower()
    if ext in _BINARY_EXTENSIONS:
        return None, None, []

    MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024 if ext == ".ipynb" else 1 * 1024 * 1024
    try:
        if os.path.getsize(full_path) > MAX_FILE_SIZE_BYTES:
            logger.warning("Skipping large file %s during incremental sync", rel_path)
            return None, None, []
    except OSError:
        return None, None, []

    try:
        with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read().replace("\x00", "")
    except Exception as exc:
        logger.error("Could not read %s: %s", rel_path, exc)
        return None, None, []

    # Run the appropriate AST parser
    if ext == ".py":
        graph_data = parse_python_file(content, rel_path, repo_id, user_id)
    elif ext in (".ts", ".tsx", ".js", ".jsx"):
        graph_data = parse_ts_file(content, rel_path, repo_id, user_id)
    elif ext == ".ipynb":
        graph_data = parse_notebook_file(content, rel_path, repo_id, user_id)
    else:
        graph_data = parse_generic_file(content, rel_path, repo_id, user_id)

    # Build symbol list from raw parser output
    symbols: list[dict] = []
    for label, props in graph_data.get("nodes", []):
        if label == "File":
            continue
        fp = props.get("file_path")
        if fp != rel_path:
            continue
        symbol: dict = {
            "type": label.lower(),
            "name": props["name"],
            "start_line": props["start_line"],
            "end_line": props["end_line"],
            "docstring": props.get("docstring"),
            "signature": props.get("signature", ""),
        }
        if label == "Function":
            symbol["is_async"] = props.get("is_async", False)
        symbols.append(symbol)

    # Language normalisation (same as full parse)
    language = ext.lstrip(".") if ext else "text"
    if language == "tsx":
        language = "typescript"
    elif language == "jsx":
        language = "javascript"
    elif language == "yml":
        language = "yaml"

    file_node = {
        "id": rel_path,
        "label": os.path.basename(rel_path),
        "type": "file",
        "language": language,
        "size_bytes": len(content.encode("utf-8")),
        "checksum": str(hash(content)),
        "symbols": symbols,
    }

    # Build import edges using the same resolve_import_path logic
    new_edges: list[dict] = []
    for import_stmt in graph_data.get("raw_imports", []):
        target_file = resolve_import_path(import_stmt, rel_path, all_file_paths)
        if target_file and target_file != rel_path:
            new_edges.append({"source": rel_path, "target": target_file, "type": "IMPORTS"})

    # Build AST edges (CALLS, HAS_METHOD) from parser output
    for rel_type, start_props, end_props in graph_data.get("edges", []):
        if rel_type == "CALLS":
            new_edges.append({
                "source": f"{start_props['caller_file']}#{start_props['caller_name']}",
                "target": f"{start_props['callee_file']}#{start_props['callee_name']}",
                "type": "CALLS",
                "line": start_props.get("line"),
            })
        elif rel_type == "HAS_METHOD":
            new_edges.append({
                "source": f"{start_props['file_path']}#{start_props['class_name']}",
                "target": f"{start_props['file_path']}#{end_props['name']}",
                "type": "HAS_METHOD",
            })

    return content, file_node, new_edges


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

    # 3. Generic Multi-Language Import Resolution (Go, Java, C/C++, Rust, C#, PHP, Ruby)
    clean_stmt = import_stmt.strip().strip(";").strip("'").strip('"')
    cleaned_path = clean_stmt.replace("\\", "/").replace(".", "/")
    basename = cleaned_path.split("/")[-1].lower()

    if basename and len(basename) > 2:
        for file in all_files:
            file_lower = file.lower()
            fname_no_ext = os.path.splitext(file_lower.split("/")[-1])[0]
            if fname_no_ext == basename or file_lower.endswith(cleaned_path):
                return file

    return None


# ── Failure Handlers ────────────────────────────────────────────────
# Fires when the sync function exhausts all Inngest retries.
# Updates the repo record in the DB so the frontend shows "Failed"
# instead of being stuck on "Ingesting".

async def _on_sync_failure(ctx: inngest.Context) -> None:
    """Per-function on_failure handler for sync_github_repository.

    Called by Inngest when the function fails after all retries are
    exhausted.  The original triggering event is available inside
    ``ctx.event.data["event"]``.
    """
    try:
        original_event = ctx.event.data.get("event", {})
        event_data = original_event.get("data", {})
        repo_id = event_data.get("repo_id")
        user_id = event_data.get("user_id")
        error_info = ctx.event.data.get("error", {})
        error_msg = error_info.get("message", "Unknown error") if isinstance(error_info, dict) else str(error_info)

        if not repo_id or not user_id:
            logger.error("on_failure: missing repo_id or user_id in event data")
            return

        settings = get_settings()
        pg_client = SupabasePGClient(
            supabase_url=settings.SUPABASE_URL,
            service_role_key=settings.SUPABASE_SERVICE_ROLE_KEY,
        )

        logger.warning("on_failure: marking repo %s as failed — %s", repo_id, error_msg)
        await pg_client.update_repo_status(
            repo_id, user_id, "failed",
            detailed_status="failed",
            error_message=f"Ingestion failed: {error_msg}",
        )

        # Cleanup temp files if they exist
        temp_dir = os.path.join(tempfile.gettempdir(), f"gitdecode_{repo_id}")
        shutil.rmtree(temp_dir, ignore_errors=True)
    except Exception as exc:
        logger.exception("on_failure handler itself errored: %s", exc)


@inngest_client.create_function(
    fn_id="sync_github_repository",
    trigger=[
        inngest.TriggerEvent(event="repo/sync.requested"),
        inngest.TriggerEvent(event="repo/sync_local.requested")
    ],
    on_failure=_on_sync_failure,
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
    github_token = event_data.get("github_token")
    zip_path = event_data.get("zip_path")
    is_local = "sync_local" in ctx.event.name

    # If github_token is provided, convert URL to authenticated HTTPS URL
    clone_url = repo_url
    if github_token and "github.com/" in repo_url:
        clean_target = repo_url.replace("https://github.com/", "").rstrip("/").removesuffix(".git")
        clone_url = f"https://x-access-token:{github_token}@github.com/{clean_target}.git"

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
        # Step A: Smart Clone — depth 1 for first sync, depth 50 for re-sync
        async def clone_repo_step() -> str:
            temp_dir = os.path.join(tempfile.gettempdir(), f"gitdecode_{repo_id}")
            
            def force_remove_dir(path: str):
                if not os.path.exists(path):
                    return
                def handle_remove_readonly(func, p, exc_info):
                    try:
                        os.chmod(p, stat.S_IWRITE)
                        func(p)
                    except Exception:
                        pass
                try:
                    shutil.rmtree(path, onerror=handle_remove_readonly)
                except Exception:
                    pass

            await asyncio.to_thread(force_remove_dir, temp_dir)

            if is_local and zip_path:
                os.makedirs(temp_dir, exist_ok=True)
                logger.info("Extracting local repository zip %s to %s", zip_path, temp_dir)
                import zipfile
                def run_unzip():
                    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                        zip_ref.extractall(temp_dir)
                await asyncio.to_thread(run_unzip)
                try:
                    os.remove(zip_path)
                except OSError:
                    pass
                # Write clone_info for local repos (no git history)
                clone_info = {"mode": "full", "head_sha": None, "changed_files": None}
                with open(os.path.join(temp_dir, "clone_info.json"), "w") as f:
                    json.dump(clone_info, f)
                return temp_dir

            # ── Determine if this is a first-time sync or a re-sync ──────
            repo_record = await pg_client.get_repo(repo_id, user_id)
            last_commit = repo_record.get("last_synced_commit") if repo_record else None

            logger.info(
                "Cloning repository %s (branch: %s) last_commit=%s to %s",
                repo_url, branch, last_commit[:7] if last_commit else "none", temp_dir,
            )
            git_env = os.environ.copy()
            git_env["GIT_TERMINAL_PROMPT"] = "0"
            git_env["GCM_INTERACTIVE"] = "never"

            # Use deeper clone if we need to compute a diff against last_commit
            clone_depth = "50" if last_commit else "1"

            cmd = [
                "git", "-c", "credential.helper=", "clone",
                "--depth", clone_depth, "--branch", branch, clone_url, temp_dir,
            ]

            def run_git_clone(git_cmd):
                return subprocess.run(git_cmd, capture_output=True, env=git_env)

            result = await asyncio.to_thread(run_git_clone, cmd)
            if result.returncode != 0:
                logger.warning("Failed to clone branch '%s'. Falling back to default branch...", branch)
                await asyncio.to_thread(force_remove_dir, temp_dir)

                fallback_cmd = [
                    "git", "-c", "credential.helper=", "clone",
                    "--depth", clone_depth, clone_url, temp_dir,
                ]
                result = await asyncio.to_thread(run_git_clone, fallback_cmd)
                if result.returncode != 0:
                    stderr_text = result.stderr.decode("utf-8", errors="ignore")
                    raise RuntimeError(f"Git clone failed: {stderr_text}")

            # ── Capture HEAD SHA and Commit Message ──────────────────────
            def get_head_info():
                r_sha = subprocess.run(
                    ["git", "rev-parse", "HEAD"],
                    capture_output=True, cwd=temp_dir,
                )
                r_msg = subprocess.run(
                    ["git", "log", "-1", "--format=%s"],
                    capture_output=True, cwd=temp_dir,
                )
                sha = r_sha.stdout.decode("utf-8", errors="ignore").strip() if r_sha.returncode == 0 else None
                msg = r_msg.stdout.decode("utf-8", errors="ignore").strip() if r_msg.returncode == 0 else None
                return sha, msg

            head_sha, head_msg = await asyncio.to_thread(get_head_info)
            logger.info("HEAD SHA: %s, Message: %s", head_sha[:7] if head_sha else "unknown", head_msg or "none")

            # ── Compute diff for incremental re-sync ─────────────────────
            changed_files: list[tuple[str, str]] | None = None
            if last_commit and head_sha and last_commit != head_sha:
                def run_git_diff():
                    return subprocess.run(
                        ["git", "diff", "--name-status", last_commit, "HEAD"],
                        capture_output=True, cwd=temp_dir,
                    )
                diff_result = await asyncio.to_thread(run_git_diff)
                if diff_result.returncode == 0:
                    diff_text = diff_result.stdout.decode("utf-8", errors="ignore")
                    changed_files = _parse_git_diff(diff_text)
                    logger.info(
                        "Incremental re-sync: %d changed files between %s and %s",
                        len(changed_files), last_commit[:7], head_sha[:7],
                    )
                else:
                    # Diff failed (e.g. last_commit not in shallow history)
                    # Fall back to full parse
                    logger.warning(
                        "git diff failed (last_commit not in shallow history). "
                        "Falling back to full parse."
                    )
            elif last_commit and head_sha and last_commit == head_sha:
                # No commits since last sync — nothing to do
                changed_files = []  # Empty list → incremental mode, zero changes
                logger.info("No new commits since last sync (%s). Nothing to re-parse.", head_sha[:7])

            mode = "incremental" if changed_files is not None else "full"
            logger.info("Sync mode: %s", mode)

            # Write clone_info to disk for downstream steps
            clone_info = {
                "mode": mode,
                "head_sha": head_sha,
                "head_msg": head_msg,
                "changed_files": changed_files,  # list of [status, path] or null
            }
            with open(os.path.join(temp_dir, "clone_info.json"), "w", encoding="utf-8") as f:
                json.dump(clone_info, f)

            return temp_dir

        temp_dir = await step.run("clone_repo", clone_repo_step)

        # Update detailed_status to 'parsing'
        async def update_to_parsing() -> dict[str, Any]:
            repo = await pg_client.get_repo_by_id(repo_id, user_id)
            if repo and repo.get("detailed_status") == "cancelled":
                raise RuntimeError("Ingestion cancelled by user.")
            return await pg_client.update_repo_status(
                repo_id, user_id, "processing", detailed_status="parsing"
            )
        await step.run("update_status_parsing", update_to_parsing)

        # Step B: Smart parse — full or incremental depending on clone_info
        async def parse_ast_step() -> dict[str, Any]:
            # Load clone info written by clone step
            clone_info_path = os.path.join(temp_dir, "clone_info.json")
            clone_info: dict = {}
            if os.path.exists(clone_info_path):
                with open(clone_info_path, "r", encoding="utf-8") as f:
                    clone_info = json.load(f)

            mode = clone_info.get("mode", "full")
            changed_files_raw = clone_info.get("changed_files")  # list of [str, str] or None

            # ── INCREMENTAL MODE ────────────────────────────────────────
            if mode == "incremental" and changed_files_raw is not None:
                changed_files = [(s, p) for s, p in changed_files_raw]

                if not changed_files:
                    logger.info("Incremental sync: no changed files — skipping parse step.")
                    # Write empty incremental marker so save step does nothing
                    with open(os.path.join(temp_dir, "mode.json"), "w") as f:
                        json.dump({"mode": "incremental", "empty": True}, f)
                    return {"files_count": 0, "classes_count": 0, "functions_count": 0}

                # Load existing graph and file list from DB
                existing_graph_row = await pg_client.get_repo_graph(repo_id, user_id)
                graph_data: dict = (
                    existing_graph_row.get("graph_data", {"nodes": [], "edges": []})
                    if existing_graph_row else {"nodes": [], "edges": []}
                )
                existing_stats: dict = (
                    existing_graph_row.get("stats", {})
                    if existing_graph_row else {}
                )

                # Collect all current file paths for import resolution (lightweight, paths only)
                existing_files = await pg_client.get_all_repo_file_paths(repo_id, user_id)
                all_file_paths: list[str] = [f["file_path"] for f in existing_files]

                files_to_upsert: list[dict] = []
                files_to_delete: list[str] = []
                classes_delta = 0
                functions_delta = 0

                for status, file_path in changed_files:
                    if status == "D":
                        # ── Deleted file: strip from graph and mark for DB delete ──
                        graph_data["nodes"] = [
                            n for n in graph_data["nodes"] if n["id"] != file_path
                        ]
                        graph_data["edges"] = [
                            e for e in graph_data["edges"]
                            if e["source"].split("#")[0] != file_path
                            and e["target"].split("#")[0] != file_path
                        ]
                        files_to_delete.append(file_path)
                        all_file_paths = [p for p in all_file_paths if p != file_path]
                        logger.debug("Incremental: removed deleted file %s", file_path)

                    elif status in ("A", "M", "R"):
                        # ── Added / Modified / Renamed: re-parse the file ──
                        full_path = os.path.join(temp_dir, file_path)
                        if not os.path.exists(full_path):
                            logger.warning("Incremental: file %s not found in clone dir, skipping", file_path)
                            continue

                        content, file_node, new_edges = _parse_single_file_for_graph(
                            file_path, full_path, repo_id, user_id, all_file_paths
                        )
                        if content is None or file_node is None:
                            continue

                        # Collect symbol counts for stats update
                        for sym in file_node.get("symbols", []):
                            if sym["type"] == "class":
                                classes_delta += 1
                            elif sym["type"] == "function":
                                functions_delta += 1

                        # Replace old node (if any) with the freshly parsed one
                        graph_data["nodes"] = [
                            n for n in graph_data["nodes"] if n["id"] != file_path
                        ]
                        graph_data["nodes"].append(file_node)

                        # Drop all edges that originate from this file, then re-add
                        graph_data["edges"] = [
                            e for e in graph_data["edges"]
                            if e["source"].split("#")[0] != file_path
                        ]
                        graph_data["edges"].extend(new_edges)

                        # Track for DB upsert
                        ext = os.path.splitext(file_path)[1].lower().lstrip(".")
                        language = ext or "text"
                        if language == "tsx": language = "typescript"
                        elif language == "jsx": language = "javascript"
                        elif language == "yml": language = "yaml"

                        files_to_upsert.append({
                            "repo_id": repo_id,
                            "user_id": user_id,
                            "file_path": file_path,
                            "language": language,
                            "content": content,
                            "size_bytes": len(content.encode("utf-8")),
                            "checksum": str(hash(content)),
                        })

                        if file_path not in all_file_paths:
                            all_file_paths.append(file_path)

                        logger.debug("Incremental: parsed %s file %s", status, file_path)

                # Update stats incrementally (adjust existing counts)
                updated_stats = dict(existing_stats)
                updated_stats["updated_at"] = datetime.now(timezone.utc).isoformat()

                # Persist to disk for save_to_dbs_step
                with open(os.path.join(temp_dir, "graph_data.json"), "w", encoding="utf-8") as f:
                    json.dump(graph_data, f)
                with open(os.path.join(temp_dir, "incremental_upsert.json"), "w", encoding="utf-8") as f:
                    json.dump({"upsert": files_to_upsert, "delete": files_to_delete}, f)
                with open(os.path.join(temp_dir, "stats.json"), "w", encoding="utf-8") as f:
                    json.dump(updated_stats, f)
                with open(os.path.join(temp_dir, "mode.json"), "w", encoding="utf-8") as f:
                    json.dump({"mode": "incremental", "empty": False}, f)

                return {
                    "files_count": len(files_to_upsert),
                    "classes_count": classes_delta,
                    "functions_count": functions_delta,
                }

            # ── FULL MODE: existing logic unchanged ─────────────────────
            with open(os.path.join(temp_dir, "mode.json"), "w", encoding="utf-8") as f:
                json.dump({"mode": "full"}, f)

            all_files: list[str] = []
            for root, _, files_list in os.walk(temp_dir):
                for file in files_list:
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, temp_dir).replace(os.sep, "/")
                    if ".git" in rel_path or ".venv" in rel_path or "node_modules" in rel_path:
                        continue
                    all_files.append(rel_path)

            files_to_save = []
            all_graph_nodes = []
            all_graph_edges = []
            file_imports_map: dict[str, list[str]] = {}

            BINARY_EXTENSIONS = _BINARY_EXTENSIONS

            for rel_path in all_files:
                full_path = os.path.join(temp_dir, rel_path)
                ext = os.path.splitext(rel_path)[1].lower()

                if ext in BINARY_EXTENSIONS:
                    continue

                MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024 if ext == ".ipynb" else 1 * 1024 * 1024
                try:
                    if os.path.getsize(full_path) > MAX_FILE_SIZE_BYTES:
                        logger.warning("Skipping large file %s (exceeds size limit)", rel_path)
                        continue
                except OSError:
                    continue

                try:
                    with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                        file_content = f.read().replace("\x00", "")
                except Exception as e:
                    logger.error("Could not read content of file %s: %s", rel_path, str(e))
                    continue

                # Run AST parser
                if ext == ".py":
                    graph_data = parse_python_file(file_content, rel_path, repo_id, user_id)
                elif ext in (".ts", ".tsx", ".js", ".jsx"):
                    graph_data = parse_ts_file(file_content, rel_path, repo_id, user_id)
                elif ext == ".ipynb":
                    graph_data = parse_notebook_file(file_content, rel_path, repo_id, user_id)
                else:
                    graph_data = parse_generic_file(file_content, rel_path, repo_id, user_id)

                all_graph_nodes.extend(graph_data["nodes"])
                all_graph_edges.extend(graph_data["edges"])
                file_imports_map[rel_path] = graph_data["raw_imports"]

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
            file_symbols = {}
            classes_count = 0
            functions_count = 0

            for label, props in all_graph_nodes:
                if label == "File":
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

            resolved_edges = []
            for source_file, import_stmts in file_imports_map.items():
                for import_stmt in import_stmts:
                    target_file = resolve_import_path(import_stmt, source_file, all_files)
                    if target_file and target_file != source_file:
                        resolved_edges.append({
                            "source": source_file,
                            "target": target_file,
                            "type": "IMPORTS"
                        })

            for rel_type, start_props, end_props in all_graph_edges:
                if rel_type == "CALLS":
                    resolved_edges.append({
                        "source": f"{start_props['caller_file']}#{start_props['caller_name']}",
                        "target": f"{start_props['callee_file']}#{start_props['callee_name']}",
                        "type": "CALLS",
                        "line": start_props.get("line")
                    })
                elif rel_type == "HAS_METHOD":
                    resolved_edges.append({
                        "source": f"{start_props['file_path']}#{start_props['class_name']}",
                        "target": f"{start_props['file_path']}#{end_props['name']}",
                        "type": "HAS_METHOD"
                    })

            graph_data = {"nodes": resolved_nodes, "edges": resolved_edges}
            stats = {
                "files_count": len(files_to_save),
                "classes_count": classes_count,
                "functions_count": functions_count,
                "languages": languages_breakdown,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }

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

        # Step C: Smart Save — incremental upsert or full purge + insert
        async def save_to_dbs_step() -> dict[str, Any]:
            # Determine sync mode written by parse step
            mode_path = os.path.join(temp_dir, "mode.json")
            mode_info: dict = {"mode": "full"}
            if os.path.exists(mode_path):
                with open(mode_path, "r", encoding="utf-8") as f:
                    mode_info = json.load(f)

            graph_path = os.path.join(temp_dir, "graph_data.json")
            stats_path = os.path.join(temp_dir, "stats.json")

            graph_data: dict = {"nodes": [], "edges": []}
            if os.path.exists(graph_path):
                with open(graph_path, "r", encoding="utf-8") as f:
                    graph_data = json.load(f)

            stats: dict = {}
            if os.path.exists(stats_path):
                with open(stats_path, "r", encoding="utf-8") as f:
                    stats = json.load(f)

            # ── Helper: persist HEAD commit info before temp_dir is deleted ──
            async def _persist_commit_info() -> None:
                """Read clone_info.json and write commit SHA/msg/changed_files to DB."""
                clone_info_path = os.path.join(temp_dir, "clone_info.json")
                if not os.path.exists(clone_info_path):
                    return
                try:
                    with open(clone_info_path, "r", encoding="utf-8") as f:
                        c_data = json.load(f)
                    head_sha = c_data.get("head_sha")
                    head_msg = c_data.get("head_msg")
                    changed_files_raw = c_data.get("changed_files")  # list of [status, path] or None
                    # Flatten changed_files to a plain list of paths for storage
                    changed_paths: list[str] | None = None
                    if isinstance(changed_files_raw, list):
                        changed_paths = [p for _, p in changed_files_raw]
                    if head_sha:
                        logger.info(
                            "Persisting last_synced_commit=%s (%s) for repo %s",
                            head_sha[:7], head_msg or "no msg", repo_id,
                        )
                        await pg_client.update_repo_sync_commit(
                            repo_id, user_id, head_sha, head_msg, changed_paths
                        )
                except Exception as exc:
                    logger.warning("Failed to persist commit info for repo %s: %s", repo_id, exc)

            # ── INCREMENTAL SAVE ────────────────────────────────────────
            if mode_info.get("mode") == "incremental":
                if mode_info.get("empty"):
                    logger.info("Incremental save: no changes, skipping DB writes.")
                    await _persist_commit_info()
                    shutil.rmtree(temp_dir, ignore_errors=True)
                    return {"saved_files": 0, "mode": "incremental"}

                inc_path = os.path.join(temp_dir, "incremental_upsert.json")
                inc: dict = {"upsert": [], "delete": []}
                if os.path.exists(inc_path):
                    with open(inc_path, "r", encoding="utf-8") as f:
                        inc = json.load(f)

                # Delete removed files from repo_files
                for fp in inc.get("delete", []):
                    logger.info("Incremental: deleting file record %s", fp)
                    await pg_client.delete_repo_file_by_path(repo_id, user_id, fp)

                # Upsert only changed/added files
                upsert_list = inc.get("upsert", [])
                if upsert_list:
                    logger.info("Incremental: upserting %d changed files", len(upsert_list))
                    db_batch_size = 50
                    for j in range(0, len(upsert_list), db_batch_size):
                        await pg_client.upsert_repo_files(upsert_list[j: j + db_batch_size])

                # Save the updated merged graph
                logger.info("Incremental: saving updated code graph...")
                await pg_client.save_repo_graph(repo_id, user_id, graph_data, stats)

                # Invalidate and rebuild Gemini context cache with updated file contents
                logger.info("Incremental: refreshing Gemini context cache for repo %s", repo_id)
                cache_mgr = ContextCacheManager(pg_client)
                await cache_mgr.invalidate_cache(repo_id, user_id)
                await cache_mgr.get_or_create_cache(repo_id, user_id, "gemini-3.1-flash-lite")

                # Persist HEAD commit info BEFORE deleting temp_dir
                await _persist_commit_info()
                shutil.rmtree(temp_dir, ignore_errors=True)
                return {"saved_files": len(upsert_list), "mode": "incremental"}

            # ── FULL SAVE: safe upsert + purge stale logic ─────────────────
            files_path = os.path.join(temp_dir, "files_to_save.json")
            files_to_save: list = []
            if os.path.exists(files_path):
                with open(files_path, "r", encoding="utf-8") as f:
                    files_to_save = json.load(f)

            if files_to_save:
                # 1. Fetch current file paths in DB before updating
                existing_file_rows = await pg_client.get_all_repo_file_paths(repo_id, user_id)
                existing_paths = {f["file_path"] for f in existing_file_rows} if existing_file_rows else set()
                new_paths = {f["file_path"] for f in files_to_save}

                logger.info("Full sync: saving %d repository files to Supabase...", len(files_to_save))
                db_batch_size = 50
                for j in range(0, len(files_to_save), db_batch_size):
                    try:
                        await pg_client.upsert_repo_files(files_to_save[j: j + db_batch_size])
                    except Exception as e:
                        logger.warning("upsert_repo_files failed, falling back to insert_repo_files: %s", e)
                        await pg_client.insert_repo_files(files_to_save[j: j + db_batch_size])

                # 2. Delete ONLY stale files (files that no longer exist in current clone)
                stale_paths = existing_paths - new_paths
                if stale_paths:
                    logger.info("Full sync: purging %d stale files no longer in repo...", len(stale_paths))
                    for sp in stale_paths:
                        await pg_client.delete_repo_file_by_path(repo_id, user_id, sp)

            # Insert code graph
            logger.info("Full sync: saving code graph structure...")
            await pg_client.save_repo_graph(repo_id, user_id, graph_data, stats)

            # Pre-warm Gemini context cache
            logger.info("Full sync: pre-warming Gemini Context Cache for repo_id: %s", repo_id)
            cache_mgr = ContextCacheManager(pg_client)
            await cache_mgr.get_or_create_cache(repo_id, user_id, "gemini-3.1-flash-lite")

            # Persist HEAD commit info BEFORE deleting temp_dir
            await _persist_commit_info()
            shutil.rmtree(temp_dir, ignore_errors=True)
            return {"saved_files": len(files_to_save), "mode": "full"}

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
        # NOTE: commit SHA/msg are now saved inside save_to_dbs_step before temp_dir is deleted.
        async def update_to_completed() -> dict[str, Any]:
            return await pg_client.update_repo_status(
                repo_id, user_id, "completed", detailed_status="completed"
            )

        await step.run("update_status_completed", update_to_completed)
        return {"status": "success", "repo_id": repo_id}

    except Exception as e:
        logger.exception("Ingestion failed for repo %s: %s", repo_id, str(e))
        # Ensure cleanup if possible
        temp_dir = os.path.join(tempfile.gettempdir(), f"gitdecode_{repo_id}")
        shutil.rmtree(temp_dir, ignore_errors=True)

        # Update status to 'failed'
        async def update_to_failed() -> dict[str, Any]:
            return await pg_client.update_repo_status(
                repo_id, user_id, "failed", detailed_status="failed", error_message=str(e)
            )

        await step.run("update_status_failed", update_to_failed)
        return {"status": "failed", "error": str(e), "repo_id": repo_id}


# ── Global Failure & Cancellation Handler ───────────────────────────
# Catches ALL Inngest function failures AND cancellations via the
# inngest/function.failed and inngest/function.cancelled system events.

@inngest_client.create_function(
    fn_id="handle_function_failure",
    trigger=[
        inngest.TriggerEvent(event="inngest/function.failed"),
        inngest.TriggerEvent(event="inngest/function.cancelled"),
    ],
)
async def handle_function_failure(
    ctx: inngest.Context,
) -> dict[str, Any]:
    """Global catch-all for any Inngest function failure or cancellation.

    Extracts the original event data and updates the repo status
    to 'failed' so the UI stops showing 'Ingesting'.
    """
    try:
        event_name = ctx.event.name
        event_data = ctx.event.data or {}
        function_id = event_data.get("function_id", "")
        
        error_info = event_data.get("error", {})
        if isinstance(error_info, dict) and error_info.get("message"):
            error_msg = error_info["message"]
        elif event_name == "inngest/function.cancelled":
            error_msg = "Run was manually cancelled from Inngest."
        else:
            error_msg = str(error_info) if error_info else "Unknown error"

        # Only handle sync_github_repository failures/cancellations
        if "sync_github_repository" not in function_id:
            logger.info("Global failure handler: ignoring event '%s' for function '%s'", event_name, function_id)
            return {"handled": False}

        # Extract original event data
        original_event = event_data.get("event", {})
        original_data = original_event.get("data", {})
        repo_id = original_data.get("repo_id")
        user_id = original_data.get("user_id")

        if not repo_id or not user_id:
            logger.error("Global failure handler: missing repo_id or user_id for function '%s'", function_id)
            return {"handled": False, "reason": "missing identifiers"}

        settings = get_settings()
        pg_client = SupabasePGClient(
            supabase_url=settings.SUPABASE_URL,
            service_role_key=settings.SUPABASE_SERVICE_ROLE_KEY,
        )

        # Check if already marked as failed (avoid double-update)
        repo = await pg_client.get_repo(repo_id, user_id)
        if repo and repo.get("status") == "failed":
            logger.info("Global failure handler: repo %s already marked as failed, skipping", repo_id)
            return {"handled": False, "reason": "already_failed"}

        logger.warning(
            "Global failure handler (%s): marking repo %s as failed — %s",
            event_name, repo_id, error_msg,
        )
        await pg_client.update_repo_status(
            repo_id, user_id, "failed",
            detailed_status="failed",
            error_message=f"Ingestion {event_name.split('.')[-1]}: {error_msg}",
        )

        # Cleanup temp files
        temp_dir = os.path.join(tempfile.gettempdir(), f"gitdecode_{repo_id}")
        shutil.rmtree(temp_dir, ignore_errors=True)

        return {"handled": True, "repo_id": repo_id, "error": error_msg}

    except Exception as exc:
        logger.exception("Global failure handler itself errored: %s", exc)
        return {"handled": False, "error": str(exc)}


