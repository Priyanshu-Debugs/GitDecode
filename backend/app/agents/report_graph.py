"""
GitMesh — Report LangGraph Pipeline
=====================================
Multi-agent state graph orchestrating codebase report generation.
Pipeline: Planner -> Orchestrator -> Fan-Out Section Workers -> Reducer.
"""

import json
import logging
import re
from datetime import datetime, timezone
from typing import Dict, Any, List

from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.graph import StateGraph, START, END
from langgraph.types import Send

from app.agents.report_state import ReportState
from app.agents.report_schemas import ReportPlan, ReportSection, ReportTypeDecision
from app.agents.report_prompts import (
    REPORT_PLANNER_PROMPT,
    REPORT_ORCHESTRATOR_PROMPT,
    REPORT_WORKER_PROMPT,
    REPORT_REDUCER_PROMPT,
)
from app.services.llm_factory import resolve_llm_from_state
from app.api.dependencies import get_pg

logger = logging.getLogger(__name__)


# ── Node 1: Planner ────────────────────────────────────────────────────────
async def report_planner_node(state: ReportState) -> Dict[str, Any]:
    """Analyzes repo graph/stats, fetches existing diagrams, and classifies repo type."""
    logger.info("Starting report_planner_node for repo: %s", state.get("repo_id"))
    pg = get_pg()
    repo_id = state["repo_id"]
    user_id = state["user_id"]
    llm = resolve_llm_from_state(state)

    # 1. Fetch repo metadata
    repo_info = await pg.get_repo(repo_id=repo_id, user_id=user_id)
    repo_name = "Repository"
    diagrams = {}
    if repo_info:
        if "github_url" in repo_info and repo_info["github_url"]:
            repo_name = repo_info["github_url"].rstrip("/").split("/")[-1]
        diagrams = repo_info.get("diagrams") or {}

    # 2. Fetch graph data & stats
    graph = await pg.get_repo_graph(repo_id, user_id)
    graph_data = (graph or {}).get("graph_data", {})
    stats = (graph or {}).get("stats", {})

    file_nodes = [node for node in graph_data.get("nodes", []) if node.get("type") == "file"]
    file_tree_sample = [node["id"] for node in file_nodes[:150]]
    languages_breakdown = stats.get("languages", {})

    graph_summary_str = f"""Repository Name: {repo_name}
Total Files: {stats.get('files_count', len(file_tree_sample))}
Total Classes: {stats.get('classes_count', 0)}
Total Functions: {stats.get('functions_count', 0)}
Languages: {json.dumps(languages_breakdown)}

File Paths (sample up to 150):
""" + "\n".join([f"- {fp}" for fp in file_tree_sample])

    # 3. Classify repo using structured output
    try:
        structured_llm = llm.with_structured_output(ReportTypeDecision)
        messages = [
            SystemMessage(content=REPORT_PLANNER_PROMPT),
            HumanMessage(content=f"Repository details:\n{graph_summary_str}"),
        ]
        decision: ReportTypeDecision = await structured_llm.ainvoke(messages)
        report_type = decision.report_type
        key_tech = decision.key_technologies
    except Exception as e:
        logger.warning("Structured output failed in planner (%s), using default classification", str(e))
        report_type = "fullstack"
        key_tech = list(languages_breakdown.keys())

    return {
        "repo_name": repo_name,
        "report_type": report_type,
        "key_technologies": key_tech,
        "graph_summary": graph_summary_str,
        "languages_breakdown": languages_breakdown,
        "file_tree_sample": file_tree_sample,
        "stats": stats,
        "diagrams": diagrams,
    }


# ── Node 2: Orchestrator ───────────────────────────────────────────────────
async def report_orchestrator_node(state: ReportState) -> Dict[str, Any]:
    """Generates a structured section plan (5 to 8 sections) for the report."""
    logger.info("Starting report_orchestrator_node for repo: %s", state.get("repo_id"))
    llm = resolve_llm_from_state(state)

    context = f"""Repository Name: {state.get('repo_name')}
Classification: {state.get('report_type')}
Key Technologies: {', '.join(state.get('key_technologies', []))}
{state.get('graph_summary')}
"""

    try:
        structured_llm = llm.with_structured_output(ReportPlan)
        messages = [
            SystemMessage(content=REPORT_ORCHESTRATOR_PROMPT),
            HumanMessage(content=f"Codebase details:\n{context}"),
        ]
        plan_obj: ReportPlan = await structured_llm.ainvoke(messages)
        plan_dict = plan_obj.model_dump()
    except Exception as e:
        logger.warning("Structured output failed in orchestrator (%s), constructing fallback plan", str(e))
        plan_dict = {
            "report_title": f"Codebase Deep Analysis: {state.get('repo_name')}",
            "report_type": state.get("report_type", "fullstack"),
            "executive_summary_goal": "Provide high-level architecture and system breakdown.",
            "sections": [
                {
                    "id": 1,
                    "title": "Architecture & Module Breakdown",
                    "goal": "Analyze overarching project structure and core components.",
                    "bullets": ["Project structure overview", "Core components & responsibilities", "Key file Organization"],
                    "target_words": 400,
                    "requires_code_snippets": True,
                    "relevant_files": state.get("file_tree_sample", [])[:5],
                },
                {
                    "id": 2,
                    "title": "Sub-systems & Data Flow",
                    "goal": "Examine interaction between system modules.",
                    "bullets": ["Entry points & control flow", "Data models & schemas", "Internal/External APIs"],
                    "target_words": 400,
                    "requires_code_snippets": True,
                    "relevant_files": state.get("file_tree_sample", [])[5:10],
                },
                {
                    "id": 3,
                    "title": "Dependency & Import Graph",
                    "goal": "Evaluate coupling and dependency management.",
                    "bullets": ["External dependencies", "Internal module coupling", "Potential circular imports"],
                    "target_words": 350,
                    "requires_code_snippets": False,
                    "relevant_files": [],
                },
                {
                    "id": 4,
                    "title": "Code Quality & Design Patterns",
                    "goal": "Inspect design patterns and code readability.",
                    "bullets": ["Architectural patterns used", "Error handling consistency", "Code maintainability"],
                    "target_words": 400,
                    "requires_code_snippets": True,
                    "relevant_files": state.get("file_tree_sample", [])[:3],
                },
                {
                    "id": 5,
                    "title": "Recommendations & Technical Debt",
                    "goal": "Identify improvement areas and action items.",
                    "bullets": ["Architectural recommendations", "Performance & security audit", "Actionable refactoring roadmap"],
                    "target_words": 400,
                    "requires_code_snippets": False,
                    "relevant_files": [],
                },
            ],
        }

    return {"plan": plan_dict}


# ── Conditional Edge: Fan-Out ──────────────────────────────────────────────
def report_fanout(state: ReportState) -> List[Send]:
    """Dispatches parallel worker nodes for each section in the plan."""
    plan = state.get("plan") or {}
    sections = plan.get("sections", [])
    logger.info("Fan-out dispatching %d section workers for repo: %s", len(sections), state.get("repo_id"))

    return [
        Send(
            "section_worker",
            {
                "task": section,
                "repo_id": state["repo_id"],
                "user_id": state["user_id"],
                "report_type": state.get("report_type"),
                "graph_summary": state.get("graph_summary"),
                "stats": state.get("stats"),
                "llm_config": state.get("llm_config"),
            },
        )
        for section in sections
    ]


# ── Node 3: Section Worker ────────────────────────────────────────────────
async def report_section_worker(payload: dict) -> Dict[str, Any]:
    """Writes a single section of the report using provided file contents and graph context."""
    task = payload["task"]
    section_id = task.get("id", 1)
    section_title = task.get("title", f"Section {section_id}")
    logger.info("Starting report_section_worker for section %d: '%s'", section_id, section_title)

    repo_id = payload["repo_id"]
    user_id = payload["user_id"]
    pg = get_pg()
    llm = resolve_llm_from_state(payload)

    # 1. Fetch file contents for relevant files
    relevant_files = task.get("relevant_files", [])
    file_contents_context = ""
    if relevant_files:
        files_data = await pg.get_repo_files(repo_id, user_id, relevant_files)
        file_blocks = []
        for f in files_data:
            content = f.get("content", "")
            # Truncate large files to ~4500 chars per file to fit LLM window while giving deep context
            if len(content) > 4500:
                content = content[:4500] + "\n... [content truncated for length]"
            file_blocks.append(f"--- File: {f.get('file_path')} ---\n{content}")
        if file_blocks:
            file_contents_context = "\n\n".join(file_blocks)

    # 2. Build prompt context
    worker_context = f"""SECTION TASK DETAILS:
- Title: {section_title}
- Goal: {task.get('goal', '')}
- Bullet Points to Cover: {json.dumps(task.get('bullets', []))}
- Target Word Count: {task.get('target_words', 800)}
- Include Code Snippets: {task.get('requires_code_snippets', True)}

REPOSITORY GRAPH SUMMARY:
{payload.get('graph_summary', '')}

RELEVANT FILE CONTENTS FOR THIS SECTION:
{file_contents_context or "No specific source file contents loaded for this section; use graph summary and overall structure."}
"""


    messages = [
        SystemMessage(content=REPORT_WORKER_PROMPT),
        HumanMessage(content=f"Write this report section based on context:\n\n{worker_context}"),
    ]

    try:
        response = await llm.ainvoke(messages)
        content = response.content
        if isinstance(content, list):
            content = "".join([b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"])
        section_md = str(content).strip()
    except Exception as e:
        logger.exception("Failed in section worker for section %d: %s", section_id, str(e))
        section_md = f"## {section_title}\n\n*Unable to generate section content due to processing error: {str(e)}*"

    return {"sections": [(section_id, section_md)]}


# ── Node 4: Reducer ────────────────────────────────────────────────────────
async def report_reducer_node(state: ReportState) -> Dict[str, Any]:
    """Merges all section outputs, injects Mermaid diagrams, and polishes the final report."""
    logger.info("Starting report_reducer_node for repo: %s", state.get("repo_id"))
    llm = resolve_llm_from_state(state)

    # 1. Sort sections by section_id
    raw_sections = state.get("sections", [])
    sorted_sections = sorted(raw_sections, key=lambda x: x[0])
    combined_sections_md = "\n\n".join([sec[1] for sec in sorted_sections])

    # 2. Extract Mermaid diagrams if present
    diagrams = state.get("diagrams") or {}
    diagrams_context = ""
    if diagrams:
        diagrams_context = "AVAILABLE MERMAID DIAGRAMS TO EMBED IN APPROPRIATE SECTIONS:\n"
        if diagrams.get("architecture"):
            diagrams_context += f"### Architecture Diagram\n```mermaid\n{diagrams['architecture']}\n```\n\n"
        if diagrams.get("dataFlow"):
            diagrams_context += f"### Data Flow Diagram\n```mermaid\n{diagrams['dataFlow']}\n```\n\n"
        if diagrams.get("userFlow"):
            diagrams_context += f"### User Flow Diagram\n```mermaid\n{diagrams['userFlow']}\n```\n\n"

    plan = state.get("plan") or {}
    report_title = plan.get("report_title", f"Codebase Deep Analysis: {state.get('repo_name')}")
    current_date = datetime.now(timezone.utc).strftime("%d-%m-%Y")

    reducer_context = f"""DOCUMENT METADATA:
- Repository Name: {state.get('repo_name')}
- Report Title: {report_title}
- Project Classification: {state.get('report_type')}
- Key Technologies: {', '.join(state.get('key_technologies', []))}

{diagrams_context}

DRAFT SECTIONS TO COMBINE AND POLISH:
{combined_sections_md}
"""

    messages = [
        SystemMessage(content=REPORT_REDUCER_PROMPT),
        HumanMessage(content=f"Compile and polish the final report:\n\n{reducer_context}"),
    ]

    try:
        response = await llm.ainvoke(messages)
        content = response.content
        if isinstance(content, list):
            content = "".join([b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"])
        final_report = str(content).strip()
        
        # Enforce the exact generation timestamp to prevent LLM date hallucinations
        final_report = re.sub(
            r'(Date:[\s\*]*).*?(?=\n)',
            f'\\g<1>{current_date}',
            final_report,
            flags=re.IGNORECASE,
            count=1
        )
    except Exception as e:
        logger.exception("Failed in reducer node: %s", str(e))
        # Fallback manual merge
        final_report = f"# {report_title}\n\n"
        final_report += f"**Repository**: {state.get('repo_name')} | **Type**: {state.get('report_type')} | **Date**: {current_date}\n\n"
        final_report += "## Executive Summary\n\nThis report provides a structural analysis of the codebase based on automated AST graph parsing and code inspection.\n\n"
        final_report += combined_sections_md

    return {"final_report": final_report}


# ── Compile Graph ──────────────────────────────────────────────────────────
def build_report_graph():
    g = StateGraph(ReportState)

    g.add_node("planner", report_planner_node)
    g.add_node("orchestrator", report_orchestrator_node)
    g.add_node("section_worker", report_section_worker)
    g.add_node("reducer", report_reducer_node)

    g.add_edge(START, "planner")
    g.add_edge("planner", "orchestrator")
    g.add_conditional_edges("orchestrator", report_fanout, ["section_worker"])
    g.add_edge("section_worker", "reducer")
    g.add_edge("reducer", END)

    return g.compile()


report_graph = build_report_graph()
