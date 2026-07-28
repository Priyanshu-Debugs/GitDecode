import logging
import json
from typing import Any, Dict, List, Set, Tuple
from pydantic import BaseModel, Field
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage

logger = logging.getLogger(__name__)

class TargetEntities(BaseModel):
    files: List[str] = Field(description="List of file paths from the repository that are directly related or mentioned in the query.")
    symbols: List[str] = Field(description="List of class or function names mentioned or related to the query.")

class ASTRouter:
    """
    AST Router implements Vectorless RAG via deterministic graph traversal.
    Given a user query and the JSON dependency graph, it identifies relevant files
    and applies a hybrid context stuffing strategy:
    - Depth-0 (target files): Full text content.
    - Depth-1 (direct dependencies/dependents): Full text content.
    - Depth-2 (indirect dependencies/dependents): AST signatures only.
    """

    def __init__(self, llm: Any = None) -> None:
        if llm is None:
            from app.services.llm_factory import get_default_llm
            llm = get_default_llm()
        self.llm = llm

    async def route_query(
        self,
        query: str,
        graph_data: Dict[str, Any],
        all_files_list: List[str],
    ) -> Dict[str, Any]:
        """
        Uses the LLM to identify the entry point files and symbols from the user query.
        Returns a dictionary of target files and target symbols.
        """
        # Prioritize files whose names/paths keyword-match the query, then append the rest.
        # This ensures relevant files are always in the sample even in large repos (>400 files).
        query_lower = query.lower()
        query_words = {w for w in query_lower.split() if len(w) > 2}
        scored: List[tuple] = []
        for f in all_files_list:
            fname = f.lower()
            score = sum(1 for w in query_words if w in fname)
            scored.append((score, f))
        scored.sort(key=lambda x: x[0], reverse=True)
        # Cap at 500 — keyword-matched files appear first so they're always included
        sample_files = [f for _, f in scored][:500]

        system_prompt = (
            "You are a code routing assistant. Your job is to identify ONLY the files that directly implement or define what the user's query is asking about.\n\n"
            "STRICT RULES:\n"
            "1. If the user asks about a specific file by name (e.g. 'explain omdb_utils.py'), return ONLY that file. Nothing else.\n"
            "2. If the user asks about a function or class, return ONLY the file(s) that define that function or class.\n"
            "3. NEVER include files that merely import or call the target — those are callers, not the subject.\n"
            "4. Return the minimum set of files. 1-2 files maximum unless the query explicitly spans multiple files.\n\n"
            f"Available Files in Repository:\n" + "\n".join([f"- {f}" for f in sample_files]) + "\n\n"
            "Respond strictly with a JSON object containing 'files' and 'symbols'."
        )

        try:
            router_llm = self.llm.with_structured_output(TargetEntities)
            res = await router_llm.ainvoke([
                SystemMessage(content=system_prompt),
                f"Query: {query}"
            ])
            return {"files": res.files, "symbols": res.symbols}
        except Exception as e:
            logger.error("Failed to extract target entities using LLM structured output: %s", str(e))
            # Fallback: Ask LLM for JSON directly and parse it
            try:
                import json
                fallback_prompt = system_prompt + "\n\nYou MUST return ONLY valid JSON matching this schema: {\"files\": [\"path1\"], \"symbols\": [\"func1\"]}. Do not include markdown code blocks or any other text."
                fallback_res = await self.llm.ainvoke([
                    SystemMessage(content=fallback_prompt),
                    f"Query: {query}"
                ])
                content = fallback_res.content
                if isinstance(content, str):
                    content = content.replace("```json", "").replace("```", "").strip()
                    parsed = json.loads(content)
                    return {"files": parsed.get("files", []), "symbols": parsed.get("symbols", [])}
            except Exception as e2:
                logger.error("JSON fallback failed: %s", str(e2))
            # Fallback: simple text parsing or substring matching
            matched_files = []
            for f in all_files_list:
                if f.lower() in query.lower() or any(part in query.lower() for part in f.split("/") if len(part) > 3):
                    matched_files.append(f)
            return {"files": matched_files, "symbols": []}

    def walk_graph(
        self,
        targets: List[str],
        graph_data: Dict[str, Any],
        max_depth: int = 2
    ) -> Tuple[Set[str], Set[str]]:
        """
        Traverses the graph starting from target files up to max_depth.

        Builds a file-level adjacency map by normalising compound edge keys
        (e.g. ``"app/foo.py#bar_fn"``) down to plain file paths so that
        CALLS and HAS_METHOD edges are visible alongside IMPORTS edges.

        Returns:
            depth_1_files: Files at depth 0 and depth 1 (full content).
            depth_2_files: Files at depth 2 (signatures only).
        """
        depth_1_files: Set[str] = set(targets)
        depth_2_files: Set[str] = set()

        edges = graph_data.get("edges", [])

        # Build file-level adjacency list.
        # IMPORTS edges already use plain file paths.
        # CALLS / HAS_METHOD edges use compound keys ("file.py#symbol") — strip the suffix.
        adj: Dict[str, Set[str]] = {}
        for edge in edges:
            src = edge.get("source", "")
            tgt = edge.get("target", "")
            if not src or not tgt:
                continue
            src_file = src.split("#")[0]
            tgt_file = tgt.split("#")[0]
            if src_file and tgt_file:
                # Bi-directional so both importer and importee get context
                adj.setdefault(src_file, set()).add(tgt_file)
                adj.setdefault(tgt_file, set()).add(src_file)

        # BFS depth-1
        queue = list(targets)
        next_queue: List[str] = []

        for node in queue:
            neighbors = adj.get(node, set())
            for neighbor in neighbors:
                if neighbor not in depth_1_files:
                    depth_1_files.add(neighbor)
                    next_queue.append(neighbor)

        # BFS depth-2
        for node in next_queue:
            neighbors = adj.get(node, set())
            for neighbor in neighbors:
                if neighbor not in depth_1_files and neighbor not in depth_2_files:
                    depth_2_files.add(neighbor)

        return depth_1_files, depth_2_files

    def build_hybrid_context(
        self,
        depth_1_files: Set[str],
        depth_2_files: Set[str],
        file_contents_map: Dict[str, Dict[str, Any]],
        graph_data: Dict[str, Any]
    ) -> str:
        """
        Builds the context payload:
        - Full file content for Depth 1 files.
        - Signatures / symbols only for Depth 2 files.
        """
        context_parts = []

        # 1. Full content files (Depth 0 & 1)
        context_parts.append("=== DETAILED FILE CONTEXT (Depth 0 & 1) ===")
        for file_path in sorted(depth_1_files):
            file_info = file_contents_map.get(file_path)
            if file_info:
                content = file_info.get("content", "")
                lang = file_info.get("language", "unknown")
                
                if file_path.endswith(".ipynb"):
                    try:
                        import json
                        nb = json.loads(content)
                        for cell in nb.get("cells", []):
                            if "outputs" in cell:
                                cell["outputs"] = [{"data": {"text/plain": "[OUTPUT EXCLUDED FOR SIZE]"}}]
                        content = json.dumps(nb, indent=2)
                    except Exception:
                        pass
                
                if len(content) > 150000:
                    content = content[:150000] + "\n\n...[FILE CONTENT TRUNCATED DUE TO SIZE LIMIT]..."
                
                context_parts.append(
                    f"--- FILE: {file_path} (Language: {lang}, Size: {file_info.get('size_bytes', 0)} bytes) ---\n"
                    f"{content}\n"
                )

        # 2. AST Signatures only (Depth 2)
        context_parts.append("=== OUTLINE / SIGNATURE CONTEXT (Depth 2) ===")
        
        # Build symbol map from graph nodes
        nodes = graph_data.get("nodes", [])
        symbol_outlines: Dict[str, List[str]] = {}
        for node in nodes:
            # Check if the node is a file node with symbols
            node_id = node.get("id")
            symbols = node.get("symbols", [])
            if node_id in depth_2_files and symbols:
                outlines = []
                for sym in symbols:
                    sym_type = sym.get("type", "unknown")
                    sym_name = sym.get("name", "unknown")
                    sym_sig = sym.get("signature", "")
                    doc = sym.get("docstring")
                    doc_str = f"  # {doc}" if doc else ""
                    if sym_sig:
                        outlines.append(f"- {sym_type.upper()}: {sym_sig}{doc_str}")
                    else:
                        outlines.append(f"- {sym_type.upper()}: {sym_name}{doc_str}")
                if outlines:
                    symbol_outlines[node_id] = outlines

        for file_path in sorted(depth_2_files):
            outlines = symbol_outlines.get(file_path, [])
            file_info = file_contents_map.get(file_path)
            lang = file_info.get("language", "unknown") if file_info else "unknown"
            
            outline_text = "\n".join(outlines) if outlines else "(No class or function symbols extracted)"
            context_parts.append(
                f"--- FILE OUTLINE: {file_path} (Language: {lang}) ---\n"
                f"{outline_text}\n"
            )

        # 3. Graph Dependency Map Summary
        context_parts.append("=== RELEVANT CODE DEPENDENCY GRAPH ===")
        relevant_edges = []
        all_active_files = depth_1_files.union(depth_2_files)
        
        for edge in graph_data.get("edges", []):
            src = edge.get("source")
            tgt = edge.get("target")
            if src in all_active_files and tgt in all_active_files:
                relevant_edges.append(f"{src} -[{edge.get('type', 'DEPENDS')}]-> {tgt}")

        if relevant_edges:
            context_parts.append("\n".join(relevant_edges))
        else:
            context_parts.append("(No inter-dependencies found in active context set)")

        return "\n\n".join(context_parts)
