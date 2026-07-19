"""
GitMesh — Report Agent State
==============================
TypedDict state definition for the multi-agent report generation pipeline.
"""

import operator
from typing import TypedDict, Annotated, Optional, List, Dict, Any


class ReportState(TypedDict):
    """State schema for the codebase report generation LangGraph pipeline."""
    repo_id: str
    user_id: str
    repo_name: str
    llm_config: Optional[dict]

    # Planner outputs
    report_type: str        # "frontend", "backend", "fullstack", "library", "data_pipeline", "monorepo"
    key_technologies: List[str]
    plan: Optional[dict]    # Serialized ReportPlan

    # Context injected at start
    graph_summary: str             # Stringified graph stats + file tree
    languages_breakdown: dict      # {"python": 14, "typescript": 22, ...}
    file_tree_sample: List[str]    # Sampled file paths (capped at 150)
    stats: dict                    # files_count, classes_count, functions_count

    # Mermaid diagrams (fetched from repos.diagrams column)
    diagrams: Optional[dict]       # {"architecture": "...", "userFlow": "...", "dataFlow": "..."}

    # Workers (fan-out / map-reduce accumulator)
    sections: Annotated[List[tuple[int, str]], operator.add]

    # Reducer output
    final_report: str
