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

logger = logging.getLogger(__name__)

async def code_qa_node(state: AgentState) -> Dict[str, Any]:
    """
    Agent node that handles standard code QA using Vectorless RAG (AST Router)
    and Gemini Context Caching if available.
    """
    pg_client = get_pg()
    
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
    router = ASTRouter()
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

    # 6. Check/get Gemini Context Cache
    cache_mgr = ContextCacheManager(pg_client)
    cache_name = await cache_mgr.get_or_create_cache(repo_id, user_id, "gemini-3.1-flash-lite")

    # 7. Generate response using Gemini
    llm = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite")
    
    if cache_name:
        logger.info("Cache hit! Querying model using cache name: %s", cache_name)
        try:
            # Initialize Client
            api_key = os.environ.get("GOOGLE_API_KEY")
            client = genai.Client(api_key=api_key)
            
            prompt = (
                f"AST Routing Context (focus on these files and relationships):\n{dynamic_context}\n\n"
                f"User Question:\n{user_query}\n\n"
                "Provide a detailed answer with precise citations and line numbers."
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
            return {"messages": [AIMessage(content=response.text)]}
        except Exception as e:
            logger.exception("Failed to query Gemini using Context Cache, falling back to full context payload: %s", str(e))

    # Fallback/Default path (no cache or cache call failed)
    logger.info("Caching not used. Running standard full context query.")
    messages = [
        SystemMessage(content=CODE_QA_PROMPT),
        *state.get("messages", []),
        SystemMessage(content=f"AST Routed Context (Full details of relevant files):\n\n{dynamic_context}")
    ]
    response = await llm.ainvoke(messages)
    return {"messages": [response]}
