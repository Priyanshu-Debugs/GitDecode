"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { howItWorksData, StepItem } from "../lib/howItWorksData";
import styles from "./page.module.css";
import {
  Terminal,
  GitBranch,
  FileCode,
  Network,
  Cpu,
  ArrowRight,
  Shield,
  Search,
  MessageSquare,
  Activity,
  Layers,
  ChevronRight
} from "lucide-react";

export default function HowItWorksPage() {
  const [activeStepId, setActiveStepId] = useState<number>(1);
  const activeStep = howItWorksData.steps.find((s) => s.id === activeStepId) || howItWorksData.steps[0];

  // State for the developer speech bubble
  const [showBubble, setShowBubble] = useState(false);
  const [bubbleText, setBubbleText] = useState("");
  const bubbleTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleQuoteEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ text: string }>;
      if (customEvent.detail && customEvent.detail.text) {
        setBubbleText(customEvent.detail.text);
        setShowBubble(true);

        if (bubbleTimerRef.current) {
          clearTimeout(bubbleTimerRef.current);
        }

        bubbleTimerRef.current = setTimeout(() => {
          setShowBubble(false);
        }, 4200);
      }
    };

    window.addEventListener("show-snarky-quote", handleQuoteEvent);

    return () => {
      window.removeEventListener("show-snarky-quote", handleQuoteEvent);
      if (bubbleTimerRef.current) {
        clearTimeout(bubbleTimerRef.current);
      }
    };
  }, []);

  // Auto-cloning simulation state for Step 1
  const [cloneOutput, setCloneOutput] = useState<string[]>([]);
  const [typingUrl, setTypingUrl] = useState("");
  const targetUrl = "https://github.com/Priyanshu-Debugs/GitDecode";

  useEffect(() => {
    if (activeStepId !== 1) {
      setCloneOutput([]);
      setTypingUrl("");
      return;
    }

    let urlTimeout: NodeJS.Timeout;
    let printInterval: NodeJS.Timeout;
    let index = 0;

    // Simulating developer typing the URL
    const type = () => {
      if (index < targetUrl.length) {
        setTypingUrl(targetUrl.slice(0, index + 1));
        index++;
        urlTimeout = setTimeout(type, 60);
      } else {
        // Start terminal printing
        printTerminalLines();
      }
    };

    urlTimeout = setTimeout(type, 500);

    const terminalLines = [
      "Cloning into 'GitDecode'...",
      "remote: Enumerating objects: 1240, done.",
      "remote: Counting objects: 100% (1240/1240), done.",
      "remote: Compressing objects: 100% (842/842), done.",
      "remote: Total 1240 (delta 610), reused 1020 (delta 420)",
      "Receiving objects: 100% (1240/1240), 4.28 MiB | 8.52 MiB/s, done.",
      "Resolving deltas: 100% (610/610), done.",
      "Detecting project workspace...",
      "✓ Monorepo detected: /frontend (Next.js) & /backend (Python FastAPI)",
      "✓ Language parsed: TypeScript, Python, CSS, HTML",
      "Repository connect & shallow clone completed in 1.42s."
    ];

    const printTerminalLines = () => {
      let lineIndex = 0;
      printInterval = setInterval(() => {
        if (lineIndex < terminalLines.length) {
          setCloneOutput((prev) => [...prev, terminalLines[lineIndex]]);
          lineIndex++;
        } else {
          clearInterval(printInterval);
        }
      }, 300);
    };

    return () => {
      clearTimeout(urlTimeout);
      if (printInterval) clearInterval(printInterval);
      setCloneOutput([]);
      setTypingUrl("");
    };
  }, [activeStepId]);

  // Syntax highlighting helper for the mock JSON editor
  const renderHighlightedJson = (step: StepItem) => {
    return (
      <code className={styles.editorCode}>
        <span className={styles.ln}>
          <span className={styles.codeBrace}>{"{"}</span>
        </span>
        <span className={styles.ln}>
          {"  "}
          <span className={styles.codeKey}>"id"</span>:{" "}
          <span className={styles.codeNum}>{step.id}</span>,
        </span>
        <span className={styles.ln}>
          {"  "}
          <span className={styles.codeKey}>"stepNumber"</span>:{" "}
          <span className={styles.codeVal}>"{step.stepNumber}"</span>,
        </span>
        <span className={styles.ln}>
          {"  "}
          <span className={styles.codeKey}>"title"</span>:{" "}
          <span className={styles.codeVal}>"{step.title}"</span>,
        </span>
        <span className={styles.ln}>
          {"  "}
          <span className={styles.codeKey}>"headline"</span>:{" "}
          <span className={styles.codeVal}>"{step.headline}"</span>,
        </span>
        <span className={styles.ln}>
          {"  "}
          <span className={styles.codeKey}>"description"</span>:{" "}
          <span className={styles.codeVal}>"{step.description}"</span>,
        </span>
        <span className={styles.ln}>
          {"  "}
          <span className={styles.codeKey}>"tech"</span>: <span className={styles.codeBrace}>[</span>
        </span>
        {step.tech.map((t, idx) => (
          <span key={t} className={styles.ln}>
            {"    "}
            <span className={styles.codeVal}>"{t}"</span>
            {idx < step.tech.length - 1 ? "," : ""}
          </span>
        ))}
        <span className={styles.ln}>
          {"  "}
          <span className={styles.codeBrace}>]</span>,
        </span>
        <span className={styles.ln}>
          {"  "}
          <span className={styles.codeKey}>"codePreview"</span>:{" "}
          <span className={styles.codeVal}>"{step.codePreview}"</span>
        </span>
        <span className={styles.ln}>
          <span className={styles.codeBrace}>{"}"}</span>
        </span>
      </code>
    );
  };

  // Rendering step-specific interactive developer diagrams
  const renderStepVisualizer = () => {
    switch (activeStepId) {
      case 1: // Connect & Import
        return (
          <div className={styles.visualizerContainer}>
            <div className={styles.terminalWindow}>
              <div className={styles.terminalHeader}>
                <div className={styles.dots}>
                  <span className={styles.dot} style={{ backgroundColor: "#ff5f56" }} />
                  <span className={styles.dot} style={{ backgroundColor: "#ffbd2e" }} />
                  <span className={styles.dot} style={{ backgroundColor: "#27c93f" }} />
                </div>
                <span className={styles.terminalTitle}>bash · git-clone</span>
              </div>
              <div className={styles.terminalContent}>
                <div className={styles.promptLine}>
                  <span className={styles.promptSymbol}>$</span> gitdecode-cli import --url <span className={styles.glowingText}>{typingUrl}</span>
                  <span className={styles.terminalCursor}>▋</span>
                </div>
                {cloneOutput.map((line, idx) => (
                  <div key={idx} className={styles.terminalLine}>
                    {line && line.startsWith("✓") ? (
                      <span className={styles.successColor}>{line}</span>
                    ) : line && (line.includes("Completed") || line.includes("completed")) ? (
                      <span className={styles.infoColor}>{line}</span>
                    ) : (
                      line || ""
                    )}
                  </div>
                ))}
              </div>
            </div>
            <p className={styles.visualizerCaption}>
              Shallow cloning ensures we only pull the metadata and files required for structural analysis, optimizing memory and reducing wait times under 2 seconds.
            </p>
          </div>
        );
      case 2: // AST parsing & building graph
        return (
          <div className={styles.visualizerContainer}>
            <div className={styles.astVisualizer}>
              <div className={styles.fileNodeRow}>
                <div className={styles.astCard}>
                  <div className={styles.astCardHeader}>
                    <FileCode size={14} className={styles.codeVal} />
                    <span>auth.ts</span>
                  </div>
                  <pre className={styles.astPre}>
                    <code>
                      {"export class AuthProvider {\n"}
                      {"  login() { ... }\n"}
                      {"}"}
                    </code>
                  </pre>
                </div>
                <div className={styles.astConnector}>
                  <motion.div
                    className={styles.astPulse}
                    animate={{ left: ["0%", "100%"] }}
                    transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  />
                  <span>Tree-Sitter AST Parser</span>
                </div>
                <div className={styles.astCard}>
                  <div className={styles.astCardHeader}>
                    <Layers size={14} className={styles.codeDim} />
                    <span>AST Node Representation</span>
                  </div>
                  <pre className={styles.astPre}>
                    <code>
                      {"{\n"}
                      {"  type: 'ExportNamedDeclaration',\n"}
                      {"  name: 'AuthProvider',\n"}
                      {"  methods: ['login']\n"}
                      {"}"}
                    </code>
                  </pre>
                </div>
              </div>

              <div className={styles.graphPreview}>
                <span className={styles.previewLabel}>Auto-Compiled Dependency Tree</span>
                <div className={styles.graphNodes}>
                  <div className={`${styles.gNode} ${styles.activeGNode}`}>layout.tsx</div>
                  <div className={styles.gLine}></div>
                  <div className={`${styles.gNode} ${styles.activeGNode}`}>page.tsx</div>
                  <div className={styles.gLine}></div>
                  <div className={styles.gNode}>auth.ts</div>
                  <div className={styles.gLine}></div>
                  <div className={styles.gNode}>api.ts</div>
                </div>
              </div>
            </div>
            <p className={styles.visualizerCaption}>
              Using Tree-sitter parsers, GitDecode parses code blocks into Abstract Syntax Trees (AST) to map exact imports, classes, functions, and cross-file calling dependencies.
            </p>
          </div>
        );
      case 3: // Vectorless RAG
        return (
          <div className={styles.visualizerContainer}>
            <div className={styles.ragVisualizer}>
              <div className={styles.queryInputBox}>
                <Search size={16} className={styles.codeDim} />
                <span>"Trace where user login handles session creation"</span>
              </div>
              <div className={styles.arrowIcon}>
                <Cpu size={20} className={styles.codeClass} />
                <span>AST Router Routing</span>
              </div>
              <div className={styles.ragGraphGrid}>
                {/* Router traversing nodes */}
                <div className={styles.depthNodeCol}>
                  <span className={styles.depthBadge}>Depth-1 (Source Code)</span>
                  <div className={`${styles.ragNodeCard} ${styles.glowGreenBorder}`}>
                    <div className={styles.ragNodeHeader}>
                      <span className={styles.nodeStatusDot} style={{ backgroundColor: "var(--color-green)" }} />
                      <span>auth/provider.ts</span>
                    </div>
                    <span className={styles.ragNodeDesc}>Matches query targets. Full content loaded into context window.</span>
                  </div>
                </div>
                <div className={styles.depthNodeCol}>
                  <span className={styles.depthBadge}>Depth-2 (AST Signatures)</span>
                  <div className={`${styles.ragNodeCard} ${styles.glowAmberBorder}`}>
                    <div className={styles.ragNodeHeader}>
                      <span className={styles.nodeStatusDot} style={{ backgroundColor: "var(--color-secondary-accent)" }} />
                      <span>lib/supabase.ts</span>
                    </div>
                    <span className={styles.ragNodeDesc}>Direct dependency. Function signatures & exports loaded for imports verification.</span>
                  </div>
                </div>
                <div className={styles.depthNodeCol}>
                  <span className={styles.depthBadge}>Depth-3 (Excluded)</span>
                  <div className={styles.ragNodeCard} style={{ opacity: 0.4 }}>
                    <div className={styles.ragNodeHeader}>
                      <span className={styles.nodeStatusDot} style={{ backgroundColor: "var(--color-dim)" }} />
                      <span>utils/logger.ts</span>
                    </div>
                    <span className={styles.ragNodeDesc}>Transitive logger helper. Excluded to optimize LLM tokens count.</span>
                  </div>
                </div>
              </div>
            </div>
            <p className={styles.visualizerCaption}>
              Our graph-based AST routing avoids lossy vector searches. We find query entrance nodes, execute a Depth-2 BFS traversal, and feed Gemini exact codebase context.
            </p>
          </div>
        );
      case 4: // Multi-Agent Pipeline
        return (
          <div className={styles.visualizerContainer}>
            <div className={styles.pipelineVisualizer}>
              <div className={styles.agentCenterNode}>
                <div className={styles.agentBadge}>LangGraph Supervisor</div>
                <div className={styles.agentPrompt}>Routes queries to specialist nodes</div>
              </div>
              <div className={styles.agentBranches}>
                <div className={styles.agentBranchCard}>
                  <div className={styles.agentBranchHeader}>Code QA Agent</div>
                  <p>Handles detailed code reasoning and syntax questions.</p>
                </div>
                <div className={styles.agentBranchCard}>
                  <div className={styles.agentBranchHeader}>Visualizer Agent</div>
                  <p>Compiles call hierarchies into clean Mermaid flowcharts.</p>
                </div>
                <div className={styles.agentBranchCard}>
                  <div className={styles.agentBranchHeader}>Blast Radius Agent</div>
                  <p>Performs static impact analysis for proposed code modifications.</p>
                </div>
                <div className={styles.agentBranchCard}>
                  <div className={styles.agentBranchHeader}>Repo Summary Agent</div>
                  <p>Generates high-level project summaries and developer onboarding maps.</p>
                </div>
              </div>
            </div>
            <p className={styles.visualizerCaption}>
              GitDecode coordinates LangGraph specialist agents under a supervisor model. Queries are auto-routed to optimize response depth, structured output parsing, and tool-use operations.
            </p>
          </div>
        );
      case 5: // Explore & Understand
        return (
          <div className={styles.visualizerContainer}>
            <div className={styles.chatWindowMock}>
              <div className={styles.chatHeader}>
                <MessageSquare size={14} />
                <span>GitDecode Intelligence Console</span>
              </div>
              <div className={styles.chatContent}>
                <div className={styles.chatMsgUser}>
                  <span>Where is auth initialized?</span>
                </div>
                <div className={styles.chatMsgSystem}>
                  <div className={styles.thoughtProcess}>
                    <Activity size={12} className={styles.spinningIcon} />
                    <span>thought: Routing query &rarr; QA Specialist &rarr; walking AST dependencies...</span>
                  </div>
                  <div className={styles.systemContent}>
                    Authentication is initialized using Supabase client library inside <span className={styles.glowingText}>lib/supabase.ts</span>.
                  </div>
                  <div className={styles.citationsBlock}>
                    <span className={styles.citationLabel}>Citations</span>
                    <div className={styles.citationLink}>
                      <FileCode size={12} />
                      <span>lib/supabase.ts:L12-L28</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p className={styles.visualizerCaption}>
              Real-time streaming (SSE) allows instantaneous rendering of reasoning steps, markdown answers, precise file citations, and interactive visual dependency flowcharts.
            </p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <Navbar />
      <main className={styles.wrap}>
        {/* ── IDE HEADER ─────────────────────────────────────────── */}
        <header className={styles.header}>
          <div className={styles.logoWrapper}>
            <Image
              src="/developer-logo-refined.svg"
              alt="GitDecode Developer Logo"
              width={140}
              height={140}
              priority
              className={styles.headerLogo}
            />
            {showBubble && (
              <div className={styles.bubble} role="status" aria-live="polite">
                {bubbleText}
              </div>
            )}
          </div>
          <p className={styles.label}>system_pipeline</p>
          <h1 className={styles.title}>HowItWorks.json</h1>
          <p className={styles.subtitle}>
            <span className={styles.comment}>// </span>
            Deep-dive technical breakdown of the GitDecode AI code intelligence engine.
          </p>
        </header>

        {/* ── INTERACTIVE DUAL PANE ───────────────────────────────── */}
        <section className={styles.interactiveSection}>
          <div className={styles.paneGrid}>

            {/* Left Pane - Mock JSON Editor */}
            <div className={styles.leftPane}>
              <div className={styles.editorFrame}>
                <div className={styles.editorBar}>
                  <div className={styles.editorTab}>
                    <FileCode size={14} className={styles.codeVal} />
                    <span>HowItWorks.json</span>
                  </div>
                  <span className={styles.editorMeta}>JSON · UTF-8</span>
                </div>
                <pre className={styles.editorPre}>
                  {renderHighlightedJson(activeStep)}
                </pre>
              </div>
            </div>

            {/* Right Pane - Step Details & Interactive Visualizer */}
            <div className={styles.rightPane}>
              <div className={styles.pipelineTabs}>
                {howItWorksData.steps.map((step) => {
                  const isActive = step.id === activeStepId;
                  return (
                    <button
                      key={step.id}
                      onClick={() => setActiveStepId(step.id)}
                      className={`${styles.stepTabButton} ${isActive ? styles.activeStepTabButton : ""}`}
                    >
                      <span className={styles.stepNumBadge}>{step.stepNumber}</span>
                      <span className={styles.stepTitleLabel}>{step.title}</span>
                      {isActive && <ChevronRight size={14} className={styles.activeChevron} />}
                    </button>
                  );
                })}
              </div>

              {/* Dynamic Visualization Area */}
              <div className={styles.visualizerWrapper}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeStepId}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className={styles.visualizerCard}>
                      <div className={styles.visualizerCardHeader}>
                        <h2 className={styles.visualizerTitle}>{activeStep.headline}</h2>
                        <div className={styles.techPillsRow}>
                          {activeStep.tech.map((t) => (
                            <span key={t} className={styles.techPill}>{t}</span>
                          ))}
                        </div>
                      </div>

                      {renderStepVisualizer()}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </section>

        {/* ── PIPELINE PROCESS OVERVIEW ────────────────────────────── */}
        <section className={styles.timelineSection}>
          <div className={styles.timelineHeader}>
            <p className={styles.label}>system_execution_flow</p>
            <h2 className={styles.timelineMainTitle}>Step-by-Step Architecture Process</h2>
            <p className={styles.timelineMainSubtitle}>
              Walk through the detailed sequence of steps GitDecode performs to clone, analyze, parse, route, and stream answers for your codebase.
            </p>
          </div>

          <div className={styles.timelineWrapper}>
            {/* Connecting vertical background line */}
            <div className={styles.timelineVerticalLine} />

            {howItWorksData.steps.map((step, idx) => (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className={styles.timelineStepCard}
              >
                {/* Step Badge */}
                <div className={styles.timelineStepBadge}>
                  {step.stepNumber}
                </div>

                {/* Step Details */}
                <div className={styles.timelineStepDetails}>
                  <div className={styles.timelineStepHeader}>
                    <h3 className={styles.timelineStepTitle}>{step.title}</h3>
                    <span className={styles.timelineStepHeadline}>{step.headline}</span>
                  </div>
                  <p className={styles.timelineStepDescription}>{step.description}</p>

                  {/* Tech tags */}
                  <div className={styles.timelineStepTechRow}>
                    {step.tech.map((t, i) => (
                      <span key={i} className={styles.timelineStepTechTag}>
                        {t}
                      </span>
                    ))}
                  </div>

                  {/* Code Snippet Box */}
                  <div className={styles.timelineStepCodeBox}>
                    <div className={styles.timelineCodeHeader}>
                      <span>terminal / code representation</span>
                      <span className={styles.timelineCodeLang}>bash · python</span>
                    </div>
                    <pre className={styles.timelineCodePre}>
                      <code>{step.codePreview}</code>
                    </pre>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── TECHNICAL COMPARISON / ARCHITECTURE SUMMARY ────────── */}
        <section className={styles.detailsSection}>
          <div className={styles.detailsHeader}>
            <p className={styles.label}>comparison</p>
            <h2 className={styles.detailsTitle}>Why Vectorless Graph RAG?</h2>
            <p className={styles.detailsSubtitle}>
              Traditional RAG splits code into text chunks and compares them using vector embeddings. This loses structure. GitDecode maps relations.
            </p>
          </div>

          <div className={styles.comparisonGrid}>
            <div className={styles.comparisonCard}>
              <h3 className={styles.comparisonCardTitle}>Traditional Vector RAG</h3>
              <ul className={styles.comparisonList}>
                <li className={styles.comparisonListItem}>
                  <span className={styles.crossSymbol}>✗</span>
                  <span>Splits functions and classes mid-line based on character count boundaries.</span>
                </li>
                <li className={styles.comparisonListItem}>
                  <span className={styles.crossSymbol}>✗</span>
                  <span>Ignores codebase imports, call relationships, and execution pathways.</span>
                </li>
                <li className={styles.comparisonListItem}>
                  <span className={styles.crossSymbol}>✗</span>
                  <span>Prone to retrieval hallucinations due to semantic similarity overlap.</span>
                </li>
              </ul>
            </div>

            <div className={styles.comparisonCard} style={{ borderColor: "var(--color-green)" }}>
              <div className={styles.comparisonGlowHeader}>
                <h3 className={styles.comparisonCardTitle} style={{ color: "var(--color-green)" }}>GitDecode AST Graph RAG</h3>
                <span className={styles.comparisonBadge}>Active</span>
              </div>
              <ul className={styles.comparisonList}>
                <li className={styles.comparisonListItem}>
                  <span className={styles.checkSymbol}>✓</span>
                  <span>Parses files into syntactically valid AST syntax blocks (methods, exports).</span>
                </li>
                <li className={styles.comparisonListItem}>
                  <span className={styles.checkSymbol}>✓</span>
                  <span>Builds a complete, multi-file relational import & call dependency graph.</span>
                </li>
                <li className={styles.comparisonListItem}>
                  <span className={styles.checkSymbol}>✓</span>
                  <span>Context window loading using Graph BFS (Depth-1 source + Depth-2 signatures).</span>
                </li>
              </ul>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
