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
        self.llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash")

    async def generate_all_diagrams(self, repo_id: str, repo_name: str) -> Dict[str, str]:
        """Generates Architecture, User Flow, and Data Flow diagrams in Mermaid.js syntax."""
        logger.info("Generating diagrams for repo_id: %s", repo_id)
        
        # 1. Fetch file structures from Neo4j to feed as context
        file_tree = await self.neo4j.get_file_tree(repo_id)
        file_list = [f["path"] for f in file_tree[:150]] # Cap at 150 files to prevent token overflows
        
        summary = await self.neo4j.get_repo_summary(repo_id)
        
        context_str = f"Repository Name: {repo_name}\n"
        context_str += f"Total Classes: {summary.get('total_classes', 0)}\n"
        context_str += f"Total Functions: {summary.get('total_functions', 0)}\n"
        context_str += "Files:\n" + "\n".join([f"- {f}" for f in file_list])

        # Common strict guidelines for Mermaid.js to avoid engine parsing errors
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

        # Generate Architecture Diagram
        arch_prompt = f"""You are a software architect.
Generate a high-level Architecture Diagram using Mermaid.js syntax (strictly start with `graph TD` or `graph LR`).
It should represent the main modules, folder hierarchies, and dependencies of this repository.
{mermaid_guidelines}"""
        architecture = await self._generate_diagram(arch_prompt, context_str)

        # Generate User Flow/Routing Flow Diagram
        flow_prompt = f"""You are a systems engineer.
Generate a User Flow / Component Sequence Diagram using Mermaid.js syntax (strictly start with `graph TD`, `graph LR`, or `sequenceDiagram`).
It should show how user actions flow through components (e.g. frontend routes, API router, handlers, services, database reads).
{mermaid_guidelines}"""
        user_flow = await self._generate_diagram(flow_prompt, context_str)

        # Generate Data Flow / Entity Schema Diagram
        data_prompt = f"""You are a database architect.
Generate a Data Flow / Entity Schema Diagram using Mermaid.js syntax (strictly start with `graph TD`, `graph LR`, or `erDiagram`).
It should map the data relationships, models, schemas, and external APIs/databases accessed by the code.
{mermaid_guidelines}"""
        data_flow = await self._generate_diagram(data_prompt, context_str)

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
            # Cleanup any markdown formatting wraps if returned by the LLM
            content = content.replace("```mermaid", "").replace("```", "").strip()
            return content
        except Exception as e:
            logger.exception("Failed to generate diagram: %s", str(e))
            return "graph TD\n  Start[Error generating diagram] --> End[Check LLM API limits]"
