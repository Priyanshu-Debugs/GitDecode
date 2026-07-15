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

    def __init__(self, model_name: str = "gemini-3.1-flash-lite") -> None:
        self.llm = ChatGoogleGenerativeAI(model=model_name)

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
        # Capping file list for prompt safety
        sample_files = all_files_list[:400]
        
        system_prompt = (
            "You are a code routing assistant. Analyze the user's codebase query and select the most relevant files "
            "and symbols (functions, classes) from the repository that should be used to answer the query.\n\n"
            f"Available Files in Repository:\n" + "\n".join([f"- {f}" for f in sample_files]) + "\n\n"
            "Respond strictly with a JSON object containing 'files' and 'symbols'."
        )
        
        router_llm = self.llm.with_structured_output(TargetEntities)
        try:
            res = await router_llm.ainvoke([
                SystemMessage(content=system_prompt),
                f"Query: {query}"
            ])
            return {"files": res.files, "symbols": res.symbols}
        except Exception as e:
            logger.error("Failed to extract target entities using LLM structured output: %s", str(e))
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
        Returns:
            depth_1_files: Files at depth 0 and depth 1 (full content).
            depth_2_files: Files at depth 2 (signatures only).
        """
        depth_1_files: Set[str] = set(targets)
        depth_2_files: Set[str] = set()

        edges = graph_data.get("edges", [])
        
        # Build adjacency lists for quick traversal
        # We traverse both IMPORTS (dependencies) and IMPORTED_BY (dependents)
        adj: Dict[str, Set[str]] = {}
        for edge in edges:
            src = edge.get("source")
            tgt = edge.get("target")
            if src and tgt:
                adj.setdefault(src, set()).add(tgt)
                adj.setdefault(tgt, set()).add(src)  # Bi-directional search for context relevance

        # BFS for depth 1
        queue = list(targets)
        next_queue: List[str] = []
        
        # Depth 1 traversal
        for node in queue:
            neighbors = adj.get(node, set())
            for neighbor in neighbors:
                if neighbor not in depth_1_files:
                    depth_1_files.add(neighbor)
                    next_queue.append(neighbor)

        # Depth 2 traversal
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
