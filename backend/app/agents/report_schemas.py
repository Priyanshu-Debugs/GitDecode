"""
GitMesh — Report Agent Schemas
================================
Pydantic models for structured LLM outputs during report generation.
"""

from typing import List, Literal
from pydantic import BaseModel, Field


class ReportSection(BaseModel):
    """A single planned section in the codebase analysis report."""

    id: int = Field(..., description="Section index (1-based).")
    title: str = Field(..., description="Clear, professional section heading.")
    goal: str = Field(
        ...,
        description="One sentence describing what technical aspects this section analyzes."
    )
    bullets: List[str] = Field(
        ...,
        min_length=3,
        max_length=6,
        description="Specific key topics, mechanisms, or sub-systems to analyze."
    )
    target_words: int = Field(
        ...,
        description="Target word count for this section (between 200 and 600)."
    )
    requires_code_snippets: bool = Field(
        default=False,
        description="Whether this section should include concrete code block examples from the codebase."
    )
    relevant_files: List[str] = Field(
        default_factory=list,
        description="Specific file paths in the codebase that the section worker should inspect."
    )


class ReportPlan(BaseModel):
    """Structured overall plan for a codebase report."""

    report_title: str = Field(..., description="Descriptive title for the overall report.")
    report_type: Literal[
        "frontend", "backend", "fullstack", "library", "data_pipeline", "monorepo"
    ] = Field(..., description="Primary classification of the repository.")
    executive_summary_goal: str = Field(
        ...,
        description="High-level goal for the executive summary section."
    )
    sections: List[ReportSection] = Field(
        ...,
        min_length=5,
        max_length=8,
        description="Detailed list of 5 to 8 planned report sections."
    )


class ReportTypeDecision(BaseModel):
    """LLM classification of the repository type."""

    report_type: Literal[
        "frontend", "backend", "fullstack", "library", "data_pipeline", "monorepo"
    ] = Field(..., description="Primary repo classification.")
    reason: str = Field(..., description="Justification based on languages, dependencies, and file paths.")
    key_technologies: List[str] = Field(
        ...,
        description="List of key frameworks and languages detected (e.g. FastAPI, Next.js, PyTorch)."
    )
