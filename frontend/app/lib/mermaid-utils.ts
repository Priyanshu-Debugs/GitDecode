/**
 * Mermaid detection and preprocessing utilities for chat content.
 * Handles both properly fenced and unfenced Mermaid diagrams.
 */

export const MERMAID_KEYWORDS = [
  "graph ",
  "graph\n",
  "flowchart ",
  "sequenceDiagram",
  "erDiagram",
  "classDiagram",
  "gantt",
  "pie",
  "gitgraph",
  "mindmap",
  "timeline",
  "stateDiagram",
  "journey",
];

/**
 * Preprocesses chat content to wrap unfenced Mermaid code in proper
 * ```mermaid fenced code blocks so ReactMarkdown can detect and
 * render them as diagrams.
 *
 * Handles two cases:
 * 1. Entire content is a raw Mermaid diagram (from visualizer agent)
 * 2. Mixed content with unfenced Mermaid blocks inline
 */
export function preprocessMermaidContent(content: string): string {
  const trimmed = content.trim();

  // Case 1: entire content is a raw Mermaid diagram
  if (MERMAID_KEYWORDS.some((kw) => trimmed.startsWith(kw))) {
    return "```mermaid\n" + trimmed + "\n```";
  }

  // Case 2: scan for unfenced Mermaid blocks within mixed content
  // Match lines that start with a Mermaid keyword and continue until a blank line
  // or the end of the string, but only if not already inside a code fence
  let result = content;
  for (const kw of MERMAID_KEYWORDS) {
    const kwEscaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").trimEnd();
    // Match a block starting with the keyword at the beginning of a line,
    // that is NOT preceded by ``` (already fenced)
    const pattern = new RegExp(
      `(?<!\`\`\`\\s*(?:mermaid)?\\n)^(${kwEscaped}[^]*?)(?=\\n\\n|$)`,
      "m"
    );
    const match = result.match(pattern);
    if (match && match[0]) {
      const block = match[0].trim();
      // Verify it's not already inside a code block by checking preceding content
      const idx = result.indexOf(block);
      const before = result.substring(Math.max(0, idx - 20), idx);
      if (!before.includes("```")) {
        result = result.replace(block, "```mermaid\n" + block + "\n```");
      }
    }
  }

  return result;
}

/**
 * Check if a string of code content looks like a Mermaid diagram.
 */
export function isMermaidContent(code: string): boolean {
  const trimmed = code.trim();
  return MERMAID_KEYWORDS.some((kw) => trimmed.startsWith(kw));
}
