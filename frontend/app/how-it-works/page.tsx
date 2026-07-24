"use client";

import React, { useState, useEffect, useRef, Fragment } from "react";
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

  // Step 1 Infinite Loop
  useEffect(() => {
    if (activeStepId !== 1) {
      setCloneOutput([]);
      setTypingUrl("");
      return;
    }

    let urlTimeout: NodeJS.Timeout;
    let printInterval: NodeJS.Timeout;
    let resetTimeout: NodeJS.Timeout;

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

    const startCycle = () => {
      setCloneOutput([]);
      setTypingUrl("");
      let index = 0;

      const type = () => {
        if (index < targetUrl.length) {
          setTypingUrl(targetUrl.slice(0, index + 1));
          index++;
          urlTimeout = setTimeout(type, 50);
        } else {
          printTerminalLines();
        }
      };

      urlTimeout = setTimeout(type, 400);
    };

    const printTerminalLines = () => {
      let lineIndex = 0;
      printInterval = setInterval(() => {
        if (lineIndex < terminalLines.length) {
          setCloneOutput((prev) => [...prev, terminalLines[lineIndex]]);
          lineIndex++;
        } else {
          clearInterval(printInterval);
          resetTimeout = setTimeout(() => {
            startCycle();
          }, 2500);
        }
      }, 250);
    };

    startCycle();

    return () => {
      clearTimeout(urlTimeout);
      if (printInterval) clearInterval(printInterval);
      if (resetTimeout) clearTimeout(resetTimeout);
      setCloneOutput([]);
      setTypingUrl("");
    };
  }, [activeStepId]);

  // Step 2 Loop (AST Node & Graph Pulse)
  const [astActiveIndex, setAstActiveIndex] = useState(0);

  useEffect(() => {
    if (activeStepId !== 2) return;
    const interval = setInterval(() => {
      setAstActiveIndex((prev) => (prev + 1) % 4);
    }, 1300);
    return () => clearInterval(interval);
  }, [activeStepId]);

  // Step 3 Loop (Vectorless Graph RAG Query & Traversal)
  const [ragPhase, setRagPhase] = useState(0);
  const [ragQueryText, setRagQueryText] = useState("");
  const targetRagQuery = "Trace where user login handles session creation";

  useEffect(() => {
    if (activeStepId !== 3) {
      setRagPhase(0);
      setRagQueryText("");
      return;
    }

    let charIndex = 0;
    let typeTimeout: NodeJS.Timeout;
    let phaseTimeout1: NodeJS.Timeout;
    let phaseTimeout2: NodeJS.Timeout;
    let phaseTimeout3: NodeJS.Timeout;
    let loopTimeout: NodeJS.Timeout;

    const startRagCycle = () => {
      setRagPhase(0);
      setRagQueryText("");
      charIndex = 0;

      const typeQuery = () => {
        if (charIndex < targetRagQuery.length) {
          setRagQueryText(targetRagQuery.slice(0, charIndex + 1));
          charIndex++;
          typeTimeout = setTimeout(typeQuery, 40);
        } else {
          phaseTimeout1 = setTimeout(() => setRagPhase(1), 500);
          phaseTimeout2 = setTimeout(() => setRagPhase(2), 1500);
          phaseTimeout3 = setTimeout(() => setRagPhase(3), 2500);
          loopTimeout = setTimeout(() => {
            startRagCycle();
          }, 5500);
        }
      };

      typeTimeout = setTimeout(typeQuery, 300);
    };

    startRagCycle();

    return () => {
      clearTimeout(typeTimeout);
      clearTimeout(phaseTimeout1);
      clearTimeout(phaseTimeout2);
      clearTimeout(phaseTimeout3);
      clearTimeout(loopTimeout);
    };
  }, [activeStepId]);

  // Step 4 Loop (Multi-Agent Pipeline Active Node Routing)
  const [activeAgentIndex, setActiveAgentIndex] = useState(0);

  useEffect(() => {
    if (activeStepId !== 4) return;
    const interval = setInterval(() => {
      setActiveAgentIndex((prev) => (prev + 1) % 4);
    }, 1400);
    return () => clearInterval(interval);
  }, [activeStepId]);

  // Step 5 Loop (Explore & Streamed AI Responses)
  const [chatPhase, setChatPhase] = useState(0);
  const [chatTypedQuestion, setChatTypedQuestion] = useState("");
  const [chatStreamedAnswer, setChatStreamedAnswer] = useState("");
  const targetQuestion = "Where is auth initialized?";
  const targetAnswer = "Authentication is initialized using Supabase client library inside lib/supabase.ts.";

  useEffect(() => {
    if (activeStepId !== 5) {
      setChatPhase(0);
      setChatTypedQuestion("");
      setChatStreamedAnswer("");
      return;
    }

    let qIndex = 0;
    let aIndex = 0;
    let timer1: NodeJS.Timeout;
    let timer2: NodeJS.Timeout;
    let timer3: NodeJS.Timeout;
    let streamInterval: NodeJS.Timeout;
    let loopTimeout: NodeJS.Timeout;

    const startChatCycle = () => {
      setChatPhase(0);
      setChatTypedQuestion("");
      setChatStreamedAnswer("");
      qIndex = 0;
      aIndex = 0;

      const typeQuestion = () => {
        if (qIndex < targetQuestion.length) {
          setChatTypedQuestion(targetQuestion.slice(0, qIndex + 1));
          qIndex++;
          timer1 = setTimeout(typeQuestion, 45);
        } else {
          // Question typed -> Thinking phase
          timer2 = setTimeout(() => {
            setChatPhase(1); // thinking
            timer3 = setTimeout(() => {
              setChatPhase(2); // streaming
              streamAnswer();
            }, 1200);
          }, 400);
        }
      };

      const streamAnswer = () => {
        streamInterval = setInterval(() => {
          if (aIndex < targetAnswer.length) {
            setChatStreamedAnswer(targetAnswer.slice(0, aIndex + 1));
            aIndex++;
          } else {
            clearInterval(streamInterval);
            setChatPhase(3); // citations reveal
            loopTimeout = setTimeout(() => {
              startChatCycle();
            }, 3500);
          }
        }, 25);
      };

      timer1 = setTimeout(typeQuestion, 300);
    };

    startChatCycle();

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      if (streamInterval) clearInterval(streamInterval);
      if (loopTimeout) clearTimeout(loopTimeout);
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
        const astNodes = [
          { name: "layout.tsx", file: "app/layout.tsx" },
          { name: "page.tsx", file: "app/page.tsx" },
          { name: "auth.ts", file: "lib/auth.ts" },
          { name: "api.ts", file: "services/api.ts" }
        ];

        return (
          <div className={styles.visualizerContainer}>
            <div className={styles.astVisualizer}>
              <div className={styles.fileNodeRow}>
                <div className={`${styles.astCard} ${styles.glowGreenBorder}`}>
                  <div className={styles.astCardHeader}>
                    <FileCode size={14} className={styles.codeVal} />
                    <span>{astNodes[astActiveIndex].name}</span>
                  </div>
                  <pre className={styles.astPre}>
                    <code>
                      {astActiveIndex === 0 && "export default function RootLayout() { ... }"}
                      {astActiveIndex === 1 && "export default function HomePage() { ... }"}
                      {astActiveIndex === 2 && "export class AuthProvider {\n  login() { ... }\n}"}
                      {astActiveIndex === 3 && "export async function fetchApi() { ... }"}
                    </code>
                  </pre>
                </div>
                <div className={styles.astConnector}>
                  <motion.div
                    className={styles.astPulse}
                    animate={{ left: ["0%", "100%"] }}
                    transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                  />
                  <span>Tree-Sitter AST Parser</span>
                </div>
                <div className={`${styles.astCard} ${styles.glowAmberBorder}`}>
                  <div className={styles.astCardHeader}>
                    <Layers size={14} className={styles.codeDim} />
                    <span>AST Node Syntax Tree</span>
                  </div>
                  <pre className={styles.astPre}>
                    <code>
                      {astActiveIndex === 0 && "{\n  type: 'Program',\n  body: ['RootLayout']\n}"}
                      {astActiveIndex === 1 && "{\n  type: 'ExportDefault',\n  name: 'HomePage'\n}"}
                      {astActiveIndex === 2 && "{\n  type: 'ClassDeclaration',\n  name: 'AuthProvider'\n}"}
                      {astActiveIndex === 3 && "{\n  type: 'AsyncFunction',\n  name: 'fetchApi'\n}"}
                    </code>
                  </pre>
                </div>
              </div>

              <div className={styles.graphPreview}>
                <span className={styles.previewLabel}>Auto-Compiled Dependency Tree (Parsing Live...)</span>
                <div className={styles.graphNodes}>
                  {astNodes.map((n, idx) => (
                    <React.Fragment key={n.name}>
                      <div
                        className={`${styles.gNode} ${idx === astActiveIndex ? styles.activeGNode : ""}`}
                        style={{
                          transform: idx === astActiveIndex ? "scale(1.08)" : "scale(1)",
                          transition: "all 0.3s ease",
                          borderColor: idx === astActiveIndex ? "var(--color-green)" : "var(--color-border)",
                          boxShadow: idx === astActiveIndex ? "0 0 12px rgba(131, 193, 103, 0.4)" : "none"
                        }}
                      >
                        {n.name}
                      </div>
                      {idx < astNodes.length - 1 && <div className={styles.gLine} />}
                    </React.Fragment>
                  ))}
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
                <span>{ragQueryText}<span className={styles.terminalCursor}>▋</span></span>
              </div>
              <div className={styles.arrowIcon}>
                <Cpu size={20} className={ragPhase >= 1 ? styles.codeVal : styles.codeClass} />
                <span>{ragPhase === 0 ? "Awaiting Query..." : "AST Graph Traversal Active"}</span>
              </div>
              <div className={styles.ragGraphGrid}>
                {/* Depth 1 */}
                <div className={styles.depthNodeCol}>
                  <span className={styles.depthBadge}>Depth-1 (Source Code)</span>
                  <div
                    className={`${styles.ragNodeCard} ${ragPhase >= 1 ? styles.glowGreenBorder : ""}`}
                    style={{ transition: "all 0.3s ease", opacity: ragPhase >= 1 ? 1 : 0.4 }}
                  >
                    <div className={styles.ragNodeHeader}>
                      <span
                        className={styles.nodeStatusDot}
                        style={{ backgroundColor: ragPhase >= 1 ? "var(--color-green)" : "var(--color-dim)" }}
                      />
                      <span>auth/provider.ts</span>
                    </div>
                    <span className={styles.ragNodeDesc}>
                      {ragPhase >= 1 ? "Matches query target. Full context loaded into LLM window." : "Standby for traversal..."}
                    </span>
                  </div>
                </div>
                {/* Depth 2 */}
                <div className={styles.depthNodeCol}>
                  <span className={styles.depthBadge}>Depth-2 (AST Signatures)</span>
                  <div
                    className={`${styles.ragNodeCard} ${ragPhase >= 2 ? styles.glowAmberBorder : ""}`}
                    style={{ transition: "all 0.3s ease", opacity: ragPhase >= 2 ? 1 : 0.4 }}
                  >
                    <div className={styles.ragNodeHeader}>
                      <span
                        className={styles.nodeStatusDot}
                        style={{ backgroundColor: ragPhase >= 2 ? "var(--color-secondary-accent)" : "var(--color-dim)" }}
                      />
                      <span>lib/supabase.ts</span>
                    </div>
                    <span className={styles.ragNodeDesc}>
                      {ragPhase >= 2 ? "Direct dependency. Method signatures loaded for validation." : "Standby for traversal..."}
                    </span>
                  </div>
                </div>
                {/* Depth 3 */}
                <div className={styles.depthNodeCol}>
                  <span className={styles.depthBadge}>Depth-3 (Excluded)</span>
                  <div
                    className={styles.ragNodeCard}
                    style={{ opacity: ragPhase >= 3 ? 0.4 : 0.2, transition: "all 0.3s ease" }}
                  >
                    <div className={styles.ragNodeHeader}>
                      <span className={styles.nodeStatusDot} style={{ backgroundColor: "var(--color-dim)" }} />
                      <span>utils/logger.ts</span>
                    </div>
                    <span className={styles.ragNodeDesc}>
                      {ragPhase >= 3 ? "Transitive helper. Excluded to minimize LLM token usage." : "Standby for evaluation..."}
                    </span>
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
        const agents = [
          { name: "Code QA Agent", desc: "Handles detailed code reasoning and syntax questions." },
          { name: "Visualizer Agent", desc: "Compiles call hierarchies into clean Mermaid flowcharts." },
          { name: "Blast Radius Agent", desc: "Performs static impact analysis for proposed code modifications." },
          { name: "Repo Summary Agent", desc: "Generates high-level project summaries and developer onboarding maps." }
        ];

        return (
          <div className={styles.visualizerContainer}>
            <div className={styles.pipelineVisualizer}>
              <div className={styles.agentCenterNode}>
                <div className={styles.agentBadge}>LangGraph Supervisor</div>
                <div className={styles.agentPrompt}>Routing query to → {agents[activeAgentIndex].name}</div>
              </div>
              <div className={styles.agentBranches}>
                {agents.map((agent, idx) => {
                  const isActive = idx === activeAgentIndex;
                  return (
                    <div
                      key={agent.name}
                      className={styles.agentBranchCard}
                      style={{
                        borderColor: isActive ? "var(--color-green)" : "var(--color-border)",
                        background: isActive ? "rgba(131, 193, 103, 0.05)" : "var(--color-panel)",
                        transform: isActive ? "translateY(-3px)" : "none",
                        boxShadow: isActive ? "0 0 16px rgba(131, 193, 103, 0.2)" : "none",
                        transition: "all 0.3s ease"
                      }}
                    >
                      <div className={styles.agentBranchHeader} style={{ color: isActive ? "var(--color-green)" : "var(--color-text)" }}>
                        {agent.name} {isActive && ""}
                      </div>
                      <p>{agent.desc}</p>
                    </div>
                  );
                })}
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
                  <span>{chatTypedQuestion}<span className={styles.terminalCursor}>▋</span></span>
                </div>
                {chatPhase >= 1 && (
                  <div className={styles.chatMsgSystem}>
                    {chatPhase === 1 && (
                      <div className={styles.thoughtProcess}>
                        <Activity size={12} className={styles.spinningIcon} />
                        <span>thought: Routing query &rarr; QA Specialist &rarr; walking AST dependencies...</span>
                      </div>
                    )}
                    {chatPhase >= 2 && (
                      <div className={styles.systemContent}>
                        {chatStreamedAnswer}
                        {chatPhase === 2 && <span className={styles.terminalCursor}>▋</span>}
                      </div>
                    )}
                    {chatPhase >= 3 && (
                      <div className={styles.citationsBlock}>
                        <span className={styles.citationLabel}>Citations</span>
                        <div className={styles.citationLink}>
                          <FileCode size={12} />
                          <span>lib/supabase.ts:L12-L28</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
