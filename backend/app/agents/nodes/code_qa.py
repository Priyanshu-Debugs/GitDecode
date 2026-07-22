import logging
import asyncio
import os
from typing import Dict, Any
from langchain_core.messages import AIMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from google import genai
from google.genai import types

from ..state import AgentState
from ..prompts import CODE_QA_PROMPT
from app.api.dependencies import get_pg
from app.services.ast_router import ASTRouter
from app.services.context_caching import ContextCacheManager

from app.services.llm_factory import resolve_llm_from_state

logger = logging.getLogger(__name__)

async def code_qa_node(state: AgentState) -> Dict[str, Any]:
    """
    Agent node that handles standard code QA using Vectorless RAG (AST Router)
    and Gemini Context Caching if available.
    """
    pg_client = get_pg()
    llm = resolve_llm_from_state(state)
    provider = (state.get("llm_config") or {}).get("provider", "google")
    
    user_query = state.get("user_query", "")
    if not user_query and state.get("messages"):
        user_query = state["messages"][-1].content
        if hasattr(user_query, "content"):
            user_query = user_query.content # ensure string

    repo_id = state["repo_id"]
    user_id = state["user_id"]

    # 1. Fetch JSON dependency graph
    graph = await pg_client.get_repo_graph(repo_id, user_id)
    if not graph or not graph.get("graph_data"):
        return {"messages": [AIMessage(content="Could not retrieve the codebase graph structure. Please ensure the repository is fully synced.")]}

    graph_data = graph["graph_data"]

    # 2. Extract target files and symbols
    router = ASTRouter(llm=llm)
    all_files = [node["id"] for node in graph_data.get("nodes", []) if node.get("type") == "file"]
    
    logger.info("AST Router analyzing user query: '%s'", user_query)
    routing_res = await router.route_query(user_query, graph_data, all_files)
    target_files = routing_res.get("files", [])
    logger.info("AST Router identified entry files: %s", target_files)

    if not target_files:
        # Fallback: if no target files found, try passing top-level files
        target_files = all_files[:5]

    # 3. Walk dependency graph
    depth_1, depth_2 = router.walk_graph(target_files, graph_data, max_depth=2)
    logger.info("AST Walk results: %d full-text files (depth-1), %d signature-only files (depth-2)", len(depth_1), len(depth_2))

    # 4. Fetch contents for all mapped files from Supabase
    all_mapped_paths = list(depth_1.union(depth_2))
    files_list = await pg_client.get_repo_files(repo_id, user_id, all_mapped_paths)
    file_contents_map = {f["file_path"]: f for f in files_list}

    # 5. Build dynamic context (contains full content for depth-1, outlines for depth-2)
    dynamic_context = router.build_hybrid_context(depth_1, depth_2, file_contents_map, graph_data)

    # 6. Check/get Gemini Context Cache (Only for Google provider)
    cache_name = None
    if provider == "google":
        cache_mgr = ContextCacheManager(pg_client)
        cache_name = await cache_mgr.get_or_create_cache(repo_id, user_id, "gemini-3.1-flash-lite")
    
    if cache_name:
        logger.info("Cache hit! Querying model using cache name: %s", cache_name)
        try:
            # Initialize Client
            api_key = os.environ.get("GOOGLE_API_KEY")
            client = genai.Client(api_key=api_key)
            
            import re
            # Only keep human questions (no AI responses — they poison the context)
            recent_messages = state.get("messages", [])[:-1][-8:]
            history_text = ""
            for m in recent_messages:
                if m.type == "human":
                    history_text += f"User: {m.content}\n"

            target_files_str = "\n".join(f"- {f}" for f in target_files)

            # The cache already contains the ENTIRE codebase.
            # We send ZERO file content in the prompt — just the focus directive and question.
            # Sending file content here makes non-target files doubly prominent and causes drift.
            prompt = (
                f"{CODE_QA_PROMPT}\n\n"
                f"FOCUS DIRECTIVE: The user is asking about ONLY these specific files. "
                f"Retrieve their content from your cached context and answer EXCLUSIVELY about them. "
                f"Do NOT mention, summarize, or explain any other file.\n"
                f"Target Files:\n{target_files_str}\n\n"
                f"Recent conversation (for context only):\n{history_text}\n"
                f"User Question: {user_query}\n\n"
                f"CRITICAL: You MUST start your response with a <think> block. Inside the <think> block, you MUST write out your analysis as a structured bulleted list of at least 3 sub-points before closing with </think> and providing your final answer. Do NOT output an empty think block or an unstructured paragraph!"
            )
            
            # Run the synchronous API call in an async thread to prevent blocking
            def call_gemini():
                return client.models.generate_content(
                    model="gemini-3.1-flash-lite",
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        cached_content=cache_name
                    )
                )
                
            response = await asyncio.to_thread(call_gemini)
            sources_list = [{"file_path": f} for f in list(depth_1)]
            return {"messages": [AIMessage(content=response.text, additional_kwargs={"sources": sources_list})]}
        except Exception as e:
            logger.exception("Failed to query Gemini using Context Cache, falling back to full context payload: %s", str(e))

    # Fallback/Default path (non-Google provider, no cache or cache call failed)
    logger.info("Caching not used. Running standard full context query.")
    
    # NEW: Truncate context if necessary to fit context window
    context_window = state.get("llm_config", {}).get("context_window", 1_000_000)
    max_chars = int(context_window * 3) # Approx 1 token = 4 chars, reserving ~25% for safety
    
    if len(dynamic_context) > max_chars:
        logger.warning(f"Context exceeds model limits ({len(dynamic_context)} chars > {max_chars} chars). Truncating.")
        # Rebuild context without depth 2
        dynamic_context = router.build_hybrid_context(depth_1, set(), file_contents_map, graph_data)
        
        # If still too big, truncate the string itself
        if len(dynamic_context) > max_chars:
            dynamic_context = dynamic_context[:max_chars - 100] + "\n\n[CONTEXT TRUNCATED TO FIT MODEL LIMITS]"
            
    # Separate the user's exact target files from their graph neighbors
    # so the model has a clear hierarchy and doesn't treat neighbors as primary
    target_files_set = set(target_files)
    neighbor_files = depth_1 - target_files_set

    primary_context_parts = ["=== PRIMARY FILES (Answer EXCLUSIVELY about these) ==="]
    for fp in sorted(target_files_set):
        fi = file_contents_map.get(fp)
        if fi:
            primary_context_parts.append(
                f"--- FILE: {fp} ---\n{fi.get('content', '')}\n"
            )

    supporting_context_parts = ["=== SUPPORTING CONTEXT (For cross-references only — do NOT summarize these) ==="]
    for fp in sorted(neighbor_files):
        fi = file_contents_map.get(fp)
        if fi:
            supporting_context_parts.append(
                f"--- FILE: {fp} ---\n{fi.get('content', '')}\n"
            )

    primary_context = "\n".join(primary_context_parts)
    supporting_context = "\n".join(supporting_context_parts)

    target_files_str = "\n".join(f"- {f}" for f in target_files)
    messages = [
        SystemMessage(content=CODE_QA_PROMPT),
        *state.get("messages", []),
        SystemMessage(content=(
            f"FOCUS DIRECTIVE: The user's question is about ONLY these files:\n{target_files_str}\n\n"
            f"Your answer MUST be exclusively about the PRIMARY FILES section below. "
            f"Do NOT explain, summarize, or mention files from SUPPORTING CONTEXT unless the user explicitly asks.\n\n"
            f"{primary_context}\n\n"
            f"{supporting_context}\n\n"
            f"CRITICAL: You MUST start your response with a <think> block. Inside the <think> block, you MUST write out your analysis as a structured bulleted list of at least 3 sub-points before closing with </think> and providing your final answer. Do NOT output an empty think block or an unstructured paragraph!"
        )),
    ]
    try:
        response = await llm.ainvoke(messages, config={"tags": ["final_answer"]})
    except Exception as e:
        import traceback
        error_msg = f"ERROR IN CODE QA API: {str(e)}\n\nTraceback:\n{traceback.format_exc()}"
        from langchain_core.messages import AIMessage
        response = AIMessage(content=error_msg)
        
    sources_list = [{"file_path": f} for f in list(depth_1)]
    if hasattr(response, "additional_kwargs"):
        response.additional_kwargs["sources"] = sources_list
    return {"messages": [response]}
