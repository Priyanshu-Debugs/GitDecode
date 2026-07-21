import base64
import io
import re
import logging
import requests
import markdown
from xhtml2pdf import pisa

logger = logging.getLogger(__name__)


def render_mermaid_to_base64_png(mermaid_code: str) -> str | None:
    """Renders Mermaid diagram syntax into Base64 PNG image bytes via Kroki / Mermaid.ink APIs."""
    # Attempt 1: Kroki.io POST
    try:
        res = requests.post(
            "https://kroki.io/mermaid/png",
            json={"diagram_source": mermaid_code},
            timeout=8
        )
        if res.status_code == 200 and len(res.content) > 100:
            return base64.b64encode(res.content).decode("utf-8")
    except Exception as e:
        logger.warning("Kroki mermaid render failed: %s", str(e))

    # Attempt 2: Mermaid.ink fallback
    try:
        encoded = base64.b64encode(mermaid_code.encode("utf-8")).decode("utf-8")
        res = requests.get(f"https://mermaid.ink/img/{encoded}", timeout=8)
        if res.status_code == 200 and len(res.content) > 100:
            return base64.b64encode(res.content).decode("utf-8")
    except Exception as e:
        logger.warning("Mermaid.ink render failed: %s", str(e))

    return None


from datetime import datetime, timezone


def generate_pdf_from_markdown(markdown_text: str, repo_name: str = "Repository", created_at: str | datetime | None = None) -> bytes:
    """
    Compiles report markdown into a clean, professional, white-paper A4 PDF.
    Includes repeating headers/footers, visual PNG diagrams, styled code blocks, tables, and typography.
    """
    # Parse and format generation timestamp as dd-mm-yyyy HH:mm
    if isinstance(created_at, datetime):
        dt = created_at
    elif isinstance(created_at, str) and created_at.strip():
        try:
            dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        except Exception:
            dt = datetime.now(timezone.utc)
    else:
        dt = datetime.now(timezone.utc)

    formatted_date = dt.strftime("%d-%m-%Y")

    # Clean up any LLM-hallucinated static dates in markdown (e.g. October 2023, Date: October 2023, etc.)
    cleaned_markdown = re.sub(
        r'(Date:[\s\*]*).*?(?=\n|$)',
        f'\\g<1>{formatted_date}',
        markdown_text,
        flags=re.IGNORECASE,
        count=1
    )
    cleaned_markdown = re.sub(r'October\s+2023', formatted_date, cleaned_markdown, flags=re.IGNORECASE)

    # 1. Pre-process Mermaid diagram blocks into high-resolution visual PNG images
    def replace_mermaid(match):
        diagram_code = match.group(1).strip()
        b64_img = render_mermaid_to_base64_png(diagram_code)
        if b64_img:
            return (
                f'<div class="diagram-box">'
                f'<div style="font-size: 8.5pt; font-weight: bold; color: #2563eb; margin-bottom: 8px; text-transform: uppercase;">'
                f'Architecture &amp; System Topology &bull; {repo_name}</div>'
                f'<img src="data:image/png;base64,{b64_img}" style="max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 4px;" />'
                f'</div>'
            )
        return f'<div class="diagram-box"><strong>[ARCHITECTURE DIAGRAM: {repo_name}]</strong><pre>{diagram_code}</pre></div>'

    processed_markdown = re.sub(r'```mermaid\s*\n(.*?)```', replace_mermaid, cleaned_markdown, flags=re.DOTALL)

    # 2. Convert Markdown to HTML
    html_content = markdown.markdown(
        processed_markdown,
        extensions=[
            'markdown.extensions.tables',
            'markdown.extensions.fenced_code',
            'markdown.extensions.codehilite',
            'markdown.extensions.toc',
            'markdown.extensions.nl2br'
        ]
    )

    # 3. Wrap in professional HTML + CSS template with repeating footer frame
    full_html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page {{
    size: a4 portrait;
    margin: 1.8cm 1.5cm 2.2cm 1.5cm;
    @frame footer_frame {{
      -pdf-frame-content: footer_content;
      left: 1.5cm;
      width: 18cm;
      top: 27.2cm;
      height: 1.2cm;
    }}
  }}
  
  body {{
    font-family: Helvetica, Arial, sans-serif;
    color: #0f172a;
    line-height: 1.6;
    font-size: 10pt;
  }}

  .document-header {{
    border-bottom: 2px solid #2563eb;
    padding-bottom: 8px;
    margin-bottom: 20px;
  }}
  .document-header-title {{
    font-size: 9pt;
    color: #2563eb;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
  }}

  h1 {{
    font-size: 18pt;
    color: #0f172a;
    margin-top: 10px;
    margin-bottom: 12px;
    font-weight: bold;
  }}
  h2 {{
    font-size: 13pt;
    color: #1e293b;
    margin-top: 18px;
    margin-bottom: 8px;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 4px;
    font-weight: bold;
  }}
  h3 {{
    font-size: 11pt;
    color: #334155;
    margin-top: 14px;
    margin-bottom: 6px;
    font-weight: bold;
  }}

  p {{
    margin: 8px 0;
    color: #334155;
  }}
  ul, ol {{
    margin: 6px 0;
    padding-left: 20px;
  }}
  li {{
    margin-bottom: 4px;
    color: #334155;
  }}

  code {{
    background-color: #f1f5f9;
    color: #0f172a;
    font-family: Courier, monospace;
    padding: 2px 5px;
    font-size: 8.5pt;
    border-radius: 3px;
  }}
  pre {{
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 10px 12px;
    font-family: Courier, monospace;
    font-size: 8pt;
    color: #0f172a;
    border-radius: 4px;
    margin: 10px 0;
  }}

  blockquote {{
    border-left: 4px solid #3b82f6;
    padding-left: 12px;
    margin: 12px 0;
    color: #475569;
    font-style: italic;
    background-color: #f8fafc;
    padding-top: 6px;
    padding-bottom: 6px;
  }}

  table {{
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0;
  }}
  th, td {{
    border: 1px solid #cbd5e1;
    padding: 7px 10px;
    text-align: left;
    font-size: 8.5pt;
  }}
  th {{
    background-color: #f1f5f9;
    color: #0f172a;
    font-weight: bold;
  }}

  .diagram-box {{
    background-color: #f8fafc;
    border: 1px solid #cbd5e1;
    padding: 12px;
    margin: 14px 0;
    border-radius: 6px;
  }}
  .diagram-box strong {{
    color: #2563eb;
    font-size: 9pt;
  }}

  .footer-text {{
    text-align: center;
    color: #64748b;
    font-size: 8pt;
    font-weight: bold;
    border-top: 1px solid #e2e8f0;
    padding-top: 6px;
  }}
</style>
</head>
<body>

  <!-- Repeating Footer Content -->
  <div id="footer_content" class="footer-text">
    Generated by GitMesh on {formatted_date} &nbsp;|&nbsp; {repo_name} Codebase Analysis Report
  </div>

  <div class="document-header">
    <div class="document-header-title">Repository Analysis Report &bull; {repo_name} &bull; Generated: {formatted_date}</div>
  </div>

  {html_content}

</body>
</html>
"""

    # 4. Generate PDF buffer
    pdf_buffer = io.BytesIO()
    pisa_status = pisa.CreatePDF(
        src=io.StringIO(full_html),
        dest=pdf_buffer
    )

    if pisa_status.err:
        raise RuntimeError(f"PDF generation failed with status {pisa_status.err}")

    pdf_buffer.seek(0)
    return pdf_buffer.getvalue()
