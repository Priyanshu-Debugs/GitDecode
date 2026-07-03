from typing import Dict, Any
from langchain_core.messages import AIMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from ..state import AgentState
from ..prompts import CODE_QA_PROMPT
from app.api.dependencies import get_pg
from app.services.embeddings import HuggingFaceEmbeddingsClient

llm = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite")

async def code_qa_node(state: AgentState) -> Dict[str, Any]:
    """
    Agent that handles standard RAG vector search questions.
    """
    pg_client = get_pg()
    hf_client = HuggingFaceEmbeddingsClient()
    
    user_query = state.get("user_query", "")
    if not user_query and state.get("messages"):
        user_query = state["messages"][-1].content
        if hasattr(user_query, "content"):
            user_query = user_query.content # ensure string

    # 1. Embed query
    embeddings = await hf_client.get_embeddings([str(user_query)])
    if not embeddings:
        return {"messages": [AIMessage(content="Failed to generate embeddings for the query.")]}
    query_embedding = embeddings[0]

    # 2. Vector search
    chunks = await pg_client.search_vectors(
        repo_id=state["repo_id"],
        user_id=state["user_id"],
        embedding=query_embedding,
        match_count=5
    )

    # 3. Build context
    context = "Context from Vector Search:\n\n"
    for chunk in chunks:
        file_path = chunk.get("file_path", "unknown")
        start_line = chunk.get("start_line", "unknown")
        content = chunk.get("content", "")
        context += f"--- {file_path} (Line {start_line}) ---\n{content}\n\n"

    messages = [
        SystemMessage(content=CODE_QA_PROMPT),
        *state.get("messages", []),
        SystemMessage(content=context)
    ]
    
    response = await llm.ainvoke(messages)
    return {"messages": [response]}
