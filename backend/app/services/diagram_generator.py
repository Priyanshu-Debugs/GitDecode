import logging
from typing import Dict
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage
from app.db.neo4j_client import Neo4jClient

logger = logging.getLogger(__name__)

class DiagramGenerator:
    """Service to automatically generate visual Mermaid.js diagrams for a repository using Gemini."""

    def __init__(self, neo4j_client: Neo4jClient) -> None:
        self.neo4j = neo4j_client
        self.llm = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite")

    async def _get_base_context_and_prompts(self, repo_id: str, repo_name: str) -> tuple[str, Dict[str, str]]:
        file_tree = await self.neo4j.get_file_tree(repo_id)
        file_list = [f["path"] for f in file_tree[:150]] # Cap at 150 files to prevent token overflows
        
        summary = await self.neo4j.get_repo_summary(repo_id)
        
        context_str = f"Repository Name: {repo_name}\n"
        context_str += f"Total Classes: {summary.get('total_classes', 0)}\n"
        context_str += f"Total Functions: {summary.get('total_functions', 0)}\n"
        context_str += "Files:\n" + "\n".join([f"- {f}" for f in file_list])

        mermaid_guidelines = """
CRITICAL MERMAID.JS SYNTAX RULES:
1. NEVER draw edges (arrows) to or from subgraph IDs (e.g. do NOT do `subgraphId --> node` or `node --> subgraphId`). Edges must ONLY connect leaf node IDs directly (e.g., `nodeA --> nodeB`).
2. Node IDs must be strictly alphanumeric with underscores (e.g. `F_MAIN`, `B_DB`). Never use file paths, dots, slashes, or file extensions as node IDs.
3. Subgraph names and titles must use double quotes inside brackets, e.g., `subgraph UI_Comp ["UI Components"]`. Do not use slashes inside the subgraph identifier itself.
4. Keep node titles clean and ALWAYS wrap special characters, slashes, and brackets (e.g. Next.js routes like `[id]`) in double quotes inside the node brackets. Example: `F_CHAT["app/projects/[id]/page.tsx"]`.
5. NEVER use colon syntax for edge labels in graph TD or LR (e.g., DO NOT use `A --> B: label`). For edge labels in flowcharts, you MUST use the pipe syntax. 
6. ALL edge labels MUST be wrapped in double quotes inside the pipes to prevent parser errors from special characters like `&` or `()`. Example: `A -->|"1. Sends & Receives (Data)"| B`.
7. Return ONLY the raw Mermaid diagram text. Absolutely no conversational intro, no trailing remarks, and no markdown code block wrapping backticks (do NOT wrap with ```mermaid or ```).
"""
        prompts = {
            "architecture": f"You are a software architect.\nGenerate a high-level Architecture Diagram using Mermaid.js syntax (strictly start with `graph TD` or `graph LR`).\nIt should represent the main modules, folder hierarchies, and dependencies of this repository.\n{mermaid_guidelines}",
            "userFlow": f"You are a systems engineer.\nGenerate a User Flow / Component Sequence Diagram using Mermaid.js syntax (strictly start with `graph TD`, `graph LR`, or `sequenceDiagram`).\nIt should show how user actions flow through components (e.g. frontend routes, API router, handlers, services, database reads).\n{mermaid_guidelines}",
            "dataFlow": f"You are a database architect.\nGenerate a Data Flow / Entity Schema Diagram using Mermaid.js syntax (strictly start with `graph TD`, `graph LR`, or `erDiagram`).\nIt should map the data relationships, models, schemas, and external APIs/databases accessed by the code.\n{mermaid_guidelines}"
        }
        return context_str, prompts

    async def generate_single_diagram(self, repo_id: str, repo_name: str, diagram_type: str) -> str:
        """Generates a single diagram of the specified type."""
        logger.info("Generating %s diagram for repo_id: %s", diagram_type, repo_id)
        context_str, prompts = await self._get_base_context_and_prompts(repo_id, repo_name)
        
        if diagram_type not in prompts:
            raise ValueError(f"Unknown diagram_type: {diagram_type}")
            
        return await self._generate_diagram(prompts[diagram_type], context_str)

    async def generate_all_diagrams(self, repo_id: str, repo_name: str) -> Dict[str, str]:
        """Generates Architecture, User Flow, and Data Flow diagrams in Mermaid.js syntax."""
        logger.info("Generating all diagrams for repo_id: %s", repo_id)
        context_str, prompts = await self._get_base_context_and_prompts(repo_id, repo_name)

        architecture = await self._generate_diagram(prompts["architecture"], context_str)
        user_flow = await self._generate_diagram(prompts["userFlow"], context_str)
        data_flow = await self._generate_diagram(prompts["dataFlow"], context_str)

        return {
            "architecture": architecture,
            "userFlow": user_flow,
            "dataFlow": data_flow
        }

    async def _generate_diagram(self, system_prompt: str, context: str) -> str:
        try:
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=f"Context details of the codebase:\n{context}")
            ]
            res = await self.llm.ainvoke(messages)
            content = res.content
            if isinstance(content, list):
                content = "".join([block.get("text", "") for block in content if isinstance(block, dict) and block.get("type") == "text"])
            
            # Cleanup any markdown formatting wraps if returned by the LLM
            content = str(content).replace("```mermaid", "").replace("```", "").strip()
            return content
        except Exception as e:
            logger.exception("Failed to generate diagram: %s", str(e))
            return "graph TD\n  Start[Error generating diagram] --> End[Check LLM API limits]"
