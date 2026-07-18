"use client";

import React, { useState } from "react";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { MermaidDiagram } from "@/components/ui/MermaidDiagram";
import {
  preprocessMermaidContent,
  isMermaidContent,
} from "@/app/lib/mermaid-utils";

/**
 * Premium markdown renderer for chat messages.
 * Handles Mermaid diagrams, syntax-highlighted code blocks,
 * tables, lists, and inline formatting with refined styling.
 */

const ChatMarkdownContext = React.createContext({ isUnclosedCodeBlock: false });

const SHARED_COMPONENTS: Components = {
    code({ className, children, ...props }: any) {
      const { isUnclosedCodeBlock } = React.useContext(ChatMarkdownContext);
      const codeString = String(children).replace(/\n$/, "");
            const langMatch = /language-(\w+)/.exec(className || "");
            const lang = langMatch ? langMatch[1] : undefined;
            
            // Mermaid detection: fenced ```mermaid or content-based heuristic
            if (lang === "mermaid" || (!lang && isMermaidContent(codeString))) {
              return (
                <div style={{ margin: "12px 0", width: "100%" }}>
                  <MermaidDiagram chart={codeString} isGenerating={isUnclosedCodeBlock} />
                </div>
              );
            }

            // Block code (has a language class or is inside a <pre>)
            if (lang || (className && className.includes("language-"))) {
              return (
                <CodeBlock language={lang || ""} code={codeString} />
              );
            }

            // Inline code
            return (
              <code
                style={{
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "0.5px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 5,
                  padding: "1.5px 6px",
                  fontSize: "0.8em",
                  fontFamily: "var(--font-mono)",
                  color: "#e0e0e0",
                }}
                {...props}
              >
                {children}
              </code>
            );
          },

          pre({ children }: any) {
            // The <pre> wrapper — we handle styling in CodeBlock,
            // so just pass through children
            return <>{children}</>;
          },

          h1: ({ children }) => (
            <h1
              style={{
                fontSize: "1.25rem",
                fontWeight: 600,
                color: "#ffffff",
                marginTop: 16,
                marginBottom: 8,
                letterSpacing: "-0.01em",
              }}
            >
              {children}
            </h1>
          ),

          h2: ({ children }) => (
            <h2
              style={{
                fontSize: "1.1rem",
                fontWeight: 600,
                color: "#ffffff",
                marginTop: 14,
                marginBottom: 6,
                letterSpacing: "-0.01em",
              }}
            >
              {children}
            </h2>
          ),

          h3: ({ children }) => (
            <h3
              style={{
                fontSize: "0.95rem",
                fontWeight: 600,
                color: "#f0f0f0",
                marginTop: 12,
                marginBottom: 4,
              }}
            >
              {children}
            </h3>
          ),

          p: ({ children }) => (
            <p
              style={{
                margin: "6px 0",
                lineHeight: 1.65,
                color: "var(--color-text)",
              }}
            >
              {children}
            </p>
          ),

          ul: ({ children }) => (
            <ul
              style={{
                margin: "6px 0",
                paddingLeft: 20,
                listStyleType: "disc",
              }}
            >
              {children}
            </ul>
          ),

          ol: ({ children }) => (
            <ol
              style={{
                margin: "6px 0",
                paddingLeft: 20,
                listStyleType: "decimal",
              }}
            >
              {children}
            </ol>
          ),

          li: ({ children }) => (
            <li
              style={{
                marginBottom: 3,
                lineHeight: 1.6,
                color: "var(--color-text)",
              }}
            >
              {children}
            </li>
          ),

          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "#c8ccd4",
                textDecoration: "none",
                borderBottom: "1px solid rgba(200, 204, 212, 0.3)",
                transition: "border-color 200ms",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.borderBottomColor = "#c8ccd4")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.borderBottomColor =
                  "rgba(200, 204, 212, 0.3)")
              }
            >
              {children}
            </a>
          ),

          blockquote: ({ children }) => (
            <blockquote
              style={{
                borderLeft: "3px solid rgba(200, 204, 212, 0.4)",
                paddingLeft: 14,
                margin: "10px 0",
                color: "var(--color-text-secondary)",
                fontStyle: "italic",
              }}
            >
              {children}
            </blockquote>
          ),

          table: ({ children }) => (
            <div style={{ overflowX: "auto", margin: "10px 0" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.8125rem",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {children}
              </table>
            </div>
          ),

          th: ({ children }) => (
            <th
              style={{
                padding: "8px 12px",
                textAlign: "left",
                borderBottom: "1px solid rgba(255,255,255,0.1)",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {children}
            </th>
          ),

          td: ({ children }) => (
            <td
              style={{
                padding: "6px 12px",
                borderBottom: "0.5px solid rgba(255,255,255,0.04)",
                color: "var(--color-text-secondary)",
              }}
            >
              {children}
            </td>
          ),

          strong: ({ children }) => (
            <strong style={{ color: "#ffffff", fontWeight: 600 }}>
              {children}
            </strong>
          ),

          em: ({ children }) => (
            <em style={{ color: "var(--color-text-secondary)" }}>{children}</em>
          ),

          hr: () => (
            <hr
              style={{
                border: "none",
                borderTop: "0.5px solid rgba(255,255,255,0.06)",
                margin: "14px 0",
              }}
            />
          ),
};

export function ChatMarkdown({ content }: { content: string }) {
  const processed = preprocessMermaidContent(content);
  const memoizedPlugins = React.useMemo(() => [remarkGfm], []);
  
  const tickMatches = content.match(/```/g) || [];
  const isUnclosedCodeBlock = tickMatches.length % 2 !== 0;

  return (
    <ChatMarkdownContext.Provider value={{ isUnclosedCodeBlock }}>
      <div className="chat-markdown-prose">
        <ReactMarkdown
          remarkPlugins={memoizedPlugins}
          components={SHARED_COMPONENTS}
        >
          {processed}
        </ReactMarkdown>
      </div>
    </ChatMarkdownContext.Provider>
  );
}

/* ── CodeBlock sub-component ──────────────────────────────────────── */

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };

  return (
    <div
      style={{
        position: "relative",
        margin: "10px 0",
        borderRadius: "var(--radius-md)",
        border: "0.5px solid rgba(255, 255, 255, 0.06)",
        background: "rgba(0, 0, 0, 0.35)",
        overflow: "hidden",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 12px",
          borderBottom: "0.5px solid rgba(255, 255, 255, 0.04)",
          background: "rgba(255, 255, 255, 0.02)",
        }}
      >
        <span
          style={{
            fontSize: "0.625rem",
            fontFamily: "var(--font-mono)",
            color: "var(--color-text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          style={{
            fontSize: "0.625rem",
            fontFamily: "var(--font-mono)",
            color: copied
              ? "var(--color-success)"
              : "var(--color-text-tertiary)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px 6px",
            borderRadius: 4,
            transition: "color 200ms",
          }}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {/* Code content */}
      <pre
        style={{
          padding: "12px 16px",
          margin: 0,
          overflowX: "auto",
          fontSize: "0.8125rem",
          lineHeight: 1.55,
          fontFamily: "var(--font-mono)",
          color: "#d4d4d4",
          whiteSpace: "pre",
          tabSize: 2,
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
