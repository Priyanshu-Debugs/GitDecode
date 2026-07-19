"""
GitMesh — Codebase Report API Router
======================================
Endpoints for generating, fetching, deleting, and checking rate limits
for multi-agent codebase analysis reports via LangGraph & SSE.
"""

import asyncio
import json
import logging
from typing import Any, AsyncGenerator
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.responses import StreamingResponse

from pydantic import BaseModel
from app.api.dependencies import get_pg, require_auth, AuthenticatedUser
from app.db.pg_client import SupabasePGClient
from app.schemas.responses import CodebaseReportResponse, ErrorResponse
from app.agents.report_graph import report_graph
from app.core.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/repos/{repo_id}/report", tags=["reports"])


class PDFExportRequest(BaseModel):
    markdown: str
    repo_name: str = "Repository"


def sse_event(event_type: str, content: Any) -> str:
    """Format data payload as Server-Sent Event (SSE)."""
    data = json.dumps({"type": event_type, "content": content})
    return f"data: {data}\n\n"


@router.post(
    "/generate",
    responses={
        200: {"description": "Server-Sent Events stream of report generation progress."},
        400: {"model": ErrorResponse, "description": "Invalid repository or missing graph data."},
        429: {"model": ErrorResponse, "description": "Monthly report limit reached."},
    },
)
async def generate_report(
    repo_id: UUID,
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
) -> StreamingResponse:
    """Trigger multi-agent codebase report generation via SSE stream."""
    repo_str = str(repo_id)
    settings = get_settings()

    # 1. Rate Limit Enforcement
    is_developer = user.github_username in settings.DEVELOPERS
    if not is_developer:
        allowed = await pg.check_report_rate_limit(user.id, repo_str)
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Report generation limit reached (1 report per repository per month).",
            )

    # 2. Verify repository exists and is completed
    repo_row = await pg.get_repo(repo_str, user.id)
    if not repo_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found.",
        )
    if repo_row.get("status") != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Repository indexing is still processing or failed. Please wait until indexing completes.",
        )

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            yield sse_event("stage", "Analyzing repository graph structure & metadata...")
            await asyncio.sleep(0.5)

            # Invoke LangGraph report pipeline
            initial_state = {
                "repo_id": repo_str,
                "user_id": user.id,
                "repo_name": repo_row.get("github_url", "").rstrip("/").split("/")[-1] or "Repository",
                "llm_config": None,
                "sections": [],
            }

            final_report_md = ""
            plan_data = None
            total_sections = 0
            completed_sections = 0

            async for event in report_graph.astream(initial_state):
                for node_name, output in event.items():
                    if node_name == "planner":
                        repo_type = output.get("report_type", "fullstack")
                        key_tech = output.get("key_technologies", [])
                        yield sse_event("stage", f"Repository classified as '{repo_type}' ({', '.join(key_tech[:3])})")
                        yield sse_event(
                            "report_type",
                            {"report_type": repo_type, "key_technologies": key_tech},
                        )
                        await asyncio.sleep(0.3)

                    elif node_name == "orchestrator":
                        plan_data = output.get("plan")
                        if plan_data and "sections" in plan_data:
                            total_sections = len(plan_data["sections"])
                            yield sse_event("stage", f"Report plan created: {total_sections} detailed sections")
                            yield sse_event("plan", plan_data)
                        await asyncio.sleep(0.3)

                    elif node_name == "section_worker":
                        completed_sections += 1
                        sec_list = output.get("sections", [])
                        sec_title = f"Section {completed_sections}"
                        if sec_list:
                            sec_id = sec_list[0][0]
                            if plan_data and "sections" in plan_data:
                                for s in plan_data["sections"]:
                                    if s.get("id") == sec_id:
                                        sec_title = s.get("title", sec_title)
                                        break
                        yield sse_event("stage", f"Writing section {completed_sections}/{total_sections}: {sec_title}...")
                        yield sse_event(
                            "section_complete",
                            {"completed": completed_sections, "total": total_sections, "title": sec_title},
                        )

                    elif node_name == "reducer":
                        yield sse_event("stage", "Polishing final report & compiling diagrams...")
                        final_report_md = output.get("final_report", "")

            # Save report to DB
            if final_report_md:
                logger.info("Saving generated report for repo_id %s to Supabase", repo_str)
                await pg.save_report(repo_str, user.id, final_report_md, plan_data)

                # Record rate limit increment if not developer
                if not is_developer:
                    await pg.increment_report_rate_limit(user.id, repo_str)

                yield sse_event("report", final_report_md)
                yield sse_event("stage", "Codebase Report complete!")
            else:
                yield sse_event("error", "Failed to compile final report content.")

            yield sse_event("done", "")

        except Exception as e:
            logger.exception("Error during report generation: %s", str(e))
            yield sse_event("error", f"Report generation failed: {str(e)}")
            yield sse_event("done", "")

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get(
    "",
    response_model=CodebaseReportResponse,
    responses={
        404: {"model": ErrorResponse, "description": "No saved report found for this repository."},
    },
)
async def get_report(
    repo_id: UUID,
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
) -> Any:
    """Fetch the cached codebase report for a repository."""
    report = await pg.get_report(str(repo_id), user.id)
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No report found for this repository.",
        )
    return report


@router.delete(
    "",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_report(
    repo_id: UUID,
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
) -> Response:
    """Delete the saved report for a repository."""
    await pg.delete_report(str(repo_id), user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/rate-limit",
    responses={200: {"description": "Report rate limit status."}},
)
async def get_report_rate_limit_status(
    repo_id: UUID,
    user: AuthenticatedUser = Depends(require_auth),
    pg: SupabasePGClient = Depends(get_pg),
) -> dict[str, Any]:
    """Get report generation rate limit status for the current repository."""
    settings = get_settings()
    if user.github_username in settings.DEVELOPERS:
        return {"can_generate": True, "next_available": None, "is_developer": True}
    status_dict = await pg.get_report_rate_limit_status(user.id, str(repo_id))
    status_dict["is_developer"] = False
    return status_dict


@router.post(
    "/export-pdf",
    responses={200: {"description": "Generated PDF binary stream"}},
)
async def export_pdf(
    repo_id: UUID,
    payload: PDFExportRequest,
) -> Response:
    """Generate and stream a clean A4 PDF from Markdown content."""
    try:
        from app.services.pdf_generator import generate_pdf_from_markdown
        pdf_bytes = generate_pdf_from_markdown(payload.markdown, payload.repo_name)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{payload.repo_name}_codebase_report.pdf"'
            }
        )
    except Exception as e:
        logger.exception("PDF generation failed: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate PDF: {str(e)}"
        )

