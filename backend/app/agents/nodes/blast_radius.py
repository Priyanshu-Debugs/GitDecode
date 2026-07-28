import json
import logging
from typing import Dict, Any
from pydantic import BaseModel, Field
from langchain_core.messages import AIMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from ..state import AgentState
from ..prompts import IMPACT_PROMPT
from app.api.dependencies import get_pg

from app.services.llm_factory import resolve_llm_from_state

logger = logging.getLogger(__name__)

class TargetExtraction(BaseModel):
    function_name: str = Field(description="Name of the target function to analyze.")
    file_path: str = Field(description="File path of the target function to analyze.")

async def blast_radius_node(state: AgentState) -> Dict[str, Any]:
    """
    Agent that analyzes downstream impacts using in-memory JSON graph traversal.
    """
    pg_client = get_pg()
    llm = resolve_llm_from_state(state)
    
    user_query = state.get("user_query", "")
    if not user_query and state.get("messages"):
        user_query = state["messages"][-1].content
        if hasattr(user_query, "content"):
            user_query = user_query.content
    
    # 1. Extract target function using structured output
    try:
        extraction_llm = llm.with_structured_output(TargetExtraction)
        extraction = await extraction_llm.ainvoke(f"Extract the target function and file from this query: {user_query}")
    except Exception as e:
        logger.error("Failed function extraction for blast radius: %s", str(e))
        # Fallback: Ask LLM for JSON directly and parse it
        try:
            fallback_prompt = f"Extract the target function and file from this query: {user_query}\n\nYou MUST return ONLY valid JSON matching this schema: {{\"function_name\": \"str\", \"file_path\": \"str\"}}. Do not include markdown code blocks or any other text."
            fallback_res = await llm.ainvoke(fallback_prompt)
            content = fallback_res.content
            if isinstance(content, str):
                content = content.replace("```json", "").replace("```", "").strip()
                parsed = json.loads(content)
                if "function_name" in parsed and "file_path" in parsed:
                    extraction = TargetExtraction(function_name=parsed["function_name"], file_path=parsed["file_path"])
        except Exception as e2:
            logger.error("JSON fallback for blast radius failed: %s", str(e2))
        
    if not extraction:
        return {"messages": [AIMessage(content="Could not determine the target function and file path from the query.")]}

    # 2. Fetch JSON dependency graph
    graph = await pg_client.get_repo_graph(state["repo_id"], state["user_id"])
    if not graph or not graph.get("graph_data"):
        return {"messages": [AIMessage(content="Codebase graph not found. Please sync the repository first.")]}

    graph_data = graph["graph_data"]
    edges = graph_data.get("edges", [])
    nodes = graph_data.get("nodes", [])

    # Target extraction parameters
    target_raw_file = (extraction.file_path or "").strip()
    target_raw_func = (extraction.function_name or "").strip()

    clean_target_file = target_raw_file.replace("\\", "/").rstrip("/")
    target_basename = clean_target_file.split("/")[-1] if clean_target_file else ""

    # 1. Resolve extracted file path to exact matching file nodes in graph
    matched_full_paths: set[str] = set()
    for n in nodes:
        n_id = n.get("id", "").replace("\\", "/")
        if (
            n_id == clean_target_file
            or n_id.endswith("/" + clean_target_file)
            or (target_basename and n_id.split("/")[-1] == target_basename)
        ):
            matched_full_paths.add(n_id)

    def matches_target_file(file_path_str: str) -> bool:
        if not file_path_str:
            return False
        fp = file_path_str.replace("\\", "/")
        if fp in matched_full_paths:
            return True
        if clean_target_file and (fp == clean_target_file or fp.endswith("/" + clean_target_file)):
            return True
        if target_basename and fp.split("/")[-1] == target_basename:
            return True
        return False

    logger.info("Blast radius targeting file '%s' (matched paths: %s), function '%s'", clean_target_file, list(matched_full_paths), target_raw_func)

    # 2. Check IMPORTS-level blast radius: which files import the target file?
    import_dependents: list[str] = []
    for edge in edges:
        if edge.get("type") == "IMPORTS":
            tgt = edge.get("target", "").replace("\\", "/")
            if matches_target_file(tgt):
                src_file = edge.get("source", "").replace("\\", "/")
                if src_file and src_file not in import_dependents:
                    import_dependents.append(src_file)

    # 3. Check CALLS-level blast radius: which functions call functions in the target file?
    callers: list[dict] = []
    is_specific_func = bool(
        target_raw_func
        and target_raw_func.lower() not in ("none", "null", "all", "", "file", target_basename.lower())
    )

    for edge in edges:
        if edge.get("type") == "CALLS":
            source = edge.get("source", "")
            target = edge.get("target", "")
            tgt_file = target.split("#")[0].replace("\\", "/")
            tgt_func = target.split("#")[1] if "#" in target else ""

            if matches_target_file(tgt_file):
                if not is_specific_func or tgt_func.lower() == target_raw_func.lower():
                    parts = source.split("#")
                    if len(parts) == 2:
                        caller_file, caller_name = parts
                        sig = ""
                        for n in nodes:
                            if n.get("id") == caller_file:
                                for sym in n.get("symbols", []):
                                    if sym.get("type") == "function" and sym.get("name") == caller_name:
                                        sig = sym.get("signature", "")
                                        break
                        caller_item = {
                            "name": caller_name,
                            "file_path": caller_file,
                            "signature": sig,
                        }
                        if caller_item not in callers:
                            callers.append(caller_item)

    impact_data = {
        "target": {"function": target_raw_func if is_specific_func else "ALL_FILE_SYMBOLS", "file": list(matched_full_paths) or clean_target_file},
        "direct_callers": callers,
        "files_that_import_target_file": import_dependents,
    }

    context = f"Impact Graph JSON:\n{json.dumps(impact_data, indent=2)}"

    # Truncate context if necessary to fit context window
    context_window = state.get("llm_config", {}).get("context_window", 1_000_000)
    max_chars = int(context_window * 3)
    if len(context) > max_chars:
        logger.warning(f"Blast radius context exceeds model limits ({len(context)} chars > {max_chars} chars). Truncating.")
        context = context[:max_chars - 100] + "\n\n[CONTEXT TRUNCATED TO FIT MODEL LIMITS]"

    messages = [
        SystemMessage(content=IMPACT_PROMPT),
        *state.get("messages", []),
        SystemMessage(content=f"{context}\n\nCRITICAL: You MUST start your response with a <think> block. Inside the <think> block, you MUST write out your analysis as a structured bulleted list of at least 3 sub-points before closing with </think> and providing your final answer. Do NOT output an empty think block or an unstructured paragraph!")
    ]

    response = await llm.ainvoke(messages, config={"tags": ["final_answer"]})
    return {"messages": [response]}
