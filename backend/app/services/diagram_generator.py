import logging
from typing import Dict
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage
from app.db.pg_client import SupabasePGClient

logger = logging.getLogger(__name__)

class DiagramGenerator:
    """Service to automatically generate visual Mermaid.js diagrams for a repository using Gemini and JSON graph."""

    def __init__(self, pg_client: SupabasePGClient) -> None:
        self.pg = pg_client
        self.llm = ChatGoogleGenerativeAI(model="gemini-3.5-flash-lite")

    async def _get_base_context_and_prompts(self, repo_id: str, repo_name: str, user_id: str) -> tuple[str, Dict[str, str]]:
        # Fetch graph and stats from Supabase
        graph_record = await self.pg.get_repo_graph(repo_id, user_id)
        if not graph_record:
            raise ValueError(f"Graph data not found for repo {repo_id}")

        graph_data = graph_record.get("graph_data", {})
        summary = graph_record.get("stats", {})
        
        # Extract files tree
        file_list = [node["id"] for node in graph_data.get("nodes", []) if node.get("type") == "file"]
        file_list = file_list[:150] # Cap at 150 files to prevent token overflows
        
        context_str = f"Repository Name: {repo_name}\n"
        context_str += f"Total Classes: {summary.get('classes_count', 0)}\n"
        context_str += f"Total Functions: {summary.get('functions_count', 0)}\n"
        context_str += "Files:\n" + "\n".join([f"- {f}" for f in file_list])

        mermaid_guidelines = """
CRITICAL MERMAID.JS SYNTAX AND STYLING RULES:
1. NEVER draw edges (arrows) to or from subgraph IDs (e.g. do NOT do `subgraphId --> node` or `node --> subgraphId`). Edges must ONLY connect leaf node IDs directly (e.g., `nodeA --> nodeB`).
2. Node IDs must be strictly alphanumeric with underscores (e.g. `F_MAIN`, `B_DB`). Never use file paths, dots, slashes, or file extensions as node IDs.
3. Subgraph names and titles must use double quotes inside brackets, e.g., `subgraph UI_Comp ["UI Components"]`. Do not use slashes inside the subgraph identifier itself.
4. Keep node titles clean and ALWAYS wrap special characters, slashes, and brackets (e.g. Next.js routes like `[id]`) in double quotes inside the node brackets. Example: `F_CHAT["app/projects/[id]/page.tsx"]`.
5. NEVER use colon syntax for edge labels in graph TD or LR (e.g., DO NOT use `A --> B: label`). For edge labels in flowcharts, you MUST use the pipe syntax. 
6. ALL edge labels MUST be wrapped in double quotes inside the pipes to prevent parser errors from special characters like `&` or `()`. Example: `A -->|"1. Sends & Receives (Data)"| B`.
7. Return ONLY the raw Mermaid diagram text. Absolutely no conversational intro, no trailing remarks, and no markdown code block wrapping backticks (do NOT wrap with ```mermaid or ```).
8. PREMIUM STYLING & COLORS: Add high-quality, solid colors (Blue, Purple, Orange, Green, Yellow) to all diagram nodes. Do NOT use gradients.
   - For Flowcharts (TD / LR), append these exact classDef styles to the end of the script and apply them to nodes using the `class` directive:
     classDef blue fill:#2563eb,stroke:#1d4ed8,stroke-width:1.5px,color:#ffffff;
     classDef purple fill:#7c3aed,stroke:#6d28d9,stroke-width:1.5px,color:#ffffff;
     classDef orange fill:#ea580c,stroke:#c2410c,stroke-width:1.5px,color:#ffffff;
     classDef green fill:#16a34a,stroke:#15803d,stroke-width:1.5px,color:#ffffff;
     classDef yellow fill:#eab308,stroke:#ca8a04,stroke-width:1.5px,color:#000000;
     Apply these styling classes to ALL nodes (e.g., `class A,B blue; class C purple;`).
   - For Sequence or ER diagrams, prepend this initialization theme configuration directive on the very first line:
     %%{init: { 'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#ffffff', 'primaryBorderColor': '#334155', 'lineColor': '#64748b', 'actorBkg': '#2563eb', 'actorBorder': '#1d4ed8', 'actorTextColor': '#ffffff', 'rectBkgColor': '#7c3aed', 'rectBorderColor': '#6d28d9', 'rectTextColor': '#ffffff', 'entityBkg': '#16a34a', 'entityBorder': '#15803d', 'entityTextColor': '#ffffff' } }}%%
"""
        prompts = {
            "architecture": f"You are a software architect.\nGenerate a high-level Architecture Diagram using Mermaid.js syntax (strictly start with `graph TD` or `graph LR`).\nIt should represent the main modules, folder hierarchies, and dependencies of this repository.\n{mermaid_guidelines}",
            "userFlow": f"You are a systems engineer.\nGenerate a User Flow / Component Sequence Diagram using Mermaid.js syntax (strictly start with `graph TD`, `graph LR`, or `sequenceDiagram`).\nIt should show how user actions flow through components (e.g. frontend routes, API router, handlers, services, database reads).\n{mermaid_guidelines}",
            "dataFlow": f"You are a database architect.\nGenerate a Data Flow / Entity Schema Diagram using Mermaid.js syntax (strictly start with `graph TD`, `graph LR`, or `erDiagram`).\nIt should map the data relationships, models, schemas, and external APIs/databases accessed by the code.\n{mermaid_guidelines}"
        }
        return context_str, prompts

    async def generate_single_diagram(self, repo_id: str, repo_name: str, diagram_type: str, user_id: str) -> str:
        """Generates a single diagram of the specified type."""
        logger.info("Generating %s diagram for repo_id: %s", diagram_type, repo_id)
        context_str, prompts = await self._get_base_context_and_prompts(repo_id, repo_name, user_id)
        
        if diagram_type not in prompts:
            raise ValueError(f"Unknown diagram_type: {diagram_type}")
            
        return await self._generate_diagram(prompts[diagram_type], context_str)

    async def generate_all_diagrams(self, repo_id: str, repo_name: str, user_id: str) -> Dict[str, str]:
        """Generates Architecture, User Flow, and Data Flow diagrams in Mermaid.js syntax."""
        logger.info("Generating all diagrams for repo_id: %s", repo_id)
        context_str, prompts = await self._get_base_context_and_prompts(repo_id, repo_name, user_id)

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
