"use client";

import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ReportPlan } from "@/app/lib/api";
import styles from "./ReportGenerationView.module.css";

/* ─────────────────────────────────────────────────────────────
   Animate-UI Inspired Framer Motion Animated Icons
   ───────────────────────────────────────────────────────────── */

/** Static Report (Page / Document) Icon */
function ReportPageIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}

/** Animated Planner Agent Icon (Scanning Magnifying Glass & Node) */
function AnimatedPlannerIcon({ isActive }: { isActive?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <motion.line
        x1="21"
        y1="21"
        x2="16.65"
        y2="16.65"
        animate={isActive ? { x2: [16.65, 14.5, 16.65], y2: [16.65, 14.5, 16.65] } : {}}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.circle
        cx="11"
        cy="11"
        r="3"
        fill="currentColor"
        animate={isActive ? { scale: [0.6, 1.1, 0.6], opacity: [0.4, 1, 0.4] } : {}}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />
    </svg>
  );
}

/** Animated Orchestrator Agent Icon (Expanding Blueprint Grid) */
function AnimatedOrchestratorIcon({ isActive }: { isActive?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <motion.rect
        x="3"
        y="3"
        width="7"
        height="7"
        rx="1"
        animate={isActive ? { scale: [1, 1.15, 1] } : {}}
        transition={{ duration: 2, repeat: Infinity, delay: 0 }}
      />
      <motion.rect
        x="14"
        y="3"
        width="7"
        height="7"
        rx="1"
        animate={isActive ? { scale: [1, 1.15, 1] } : {}}
        transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
      />
      <motion.rect
        x="14"
        y="14"
        width="7"
        height="7"
        rx="1"
        animate={isActive ? { scale: [1, 1.15, 1] } : {}}
        transition={{ duration: 2, repeat: Infinity, delay: 0.6 }}
      />
      <motion.rect
        x="3"
        y="14"
        width="7"
        height="7"
        rx="1"
        animate={isActive ? { scale: [1, 1.15, 1] } : {}}
        transition={{ duration: 2, repeat: Infinity, delay: 0.9 }}
      />
    </svg>
  );
}

/** Animated Section Writer Agent Icon (Code Brackets & Writing Cursor) */
function AnimatedWriterIcon({ isActive }: { isActive?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <motion.polyline
        points="16 18 22 12 16 6"
        animate={isActive ? { x: [0, 2, 0] } : {}}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.polyline
        points="8 6 2 12 8 18"
        animate={isActive ? { x: [0, -2, 0] } : {}}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.line
        x1="12"
        y1="8"
        x2="12"
        y2="16"
        strokeWidth="2.5"
        animate={isActive ? { opacity: [0.2, 1, 0.2] } : { opacity: 0.8 }}
        transition={{ duration: 0.8, repeat: Infinity }}
      />
    </svg>
  );
}

/** Animated Reducer Agent Icon (Rotating Synthesis Star / Gear) */
function AnimatedReducerIcon({ isActive }: { isActive?: boolean }) {
  return (
    <motion.svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      animate={isActive ? { rotate: 360 } : {}}
      transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      style={{ transformOrigin: "12px 12px" }}
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </motion.svg>
  );
}

interface ReportGenerationViewProps {
  stages: string[];
  plan: ReportPlan | null;
  sectionProgress: { completed: number; total: number; title?: string } | null;
  repoName?: string;
  onStop?: () => void;
}

export default function ReportGenerationView({
  stages = [],
  plan = null,
  sectionProgress = null,
  repoName,
  onStop = undefined,
}: ReportGenerationViewProps) {
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll terminal log to bottom on new stage
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [stages]);

  // Calculate overall percentage
  let percent = 5;
  if (sectionProgress && sectionProgress.total > 0) {
    percent = Math.min(
      98,
      Math.max(15, Math.round((sectionProgress.completed / sectionProgress.total) * 100))
    );
  } else if (plan) {
    percent = 15;
  } else if (stages.length > 0) {
    percent = Math.min(12, stages.length * 3 + 4);
  }

  // Derive status of the 4 specialized agents in the LangGraph Pipeline
  const isPlanReady = Boolean(plan);
  const isSectionsDone = Boolean(sectionProgress && sectionProgress.completed === sectionProgress.total);

  // 1. Planner Agent Status
  const plannerStatus: "completed" | "working" | "queued" =
    stages.length >= 1 ? "completed" : "working";

  // 2. Orchestrator Agent Status
  const orchestratorStatus: "completed" | "working" | "queued" = isPlanReady
    ? "completed"
    : plannerStatus === "completed"
    ? "working"
    : "queued";

  // 3. Section Worker Agent Status
  const sectionWorkerStatus: "completed" | "working" | "queued" = isSectionsDone
    ? "completed"
    : isPlanReady
    ? "working"
    : "queued";

  // 4. Reducer Agent Status
  const reducerStatus: "completed" | "working" | "queued" = isSectionsDone
    ? "working"
    : "queued";

  // Determine current Active Agent details
  let activeAgent = {
    name: "Planner Agent",
    role: "Repository Classifier",
    task: stages.length > 0 ? stages[stages.length - 1] : "Analyzing repository AST & metadata...",
    icon: <AnimatedPlannerIcon isActive={true} />,
  };

  if (reducerStatus === "working") {
    activeAgent = {
      name: "Reducer Agent",
      role: "Synthesis & Diagram Compiler",
      task: "Polishing markdown layout, verifying cross-references, and compiling Mermaid graphs...",
      icon: <AnimatedReducerIcon isActive={true} />,
    };
  } else if (sectionWorkerStatus === "working") {
    const currentTitle = sectionProgress?.title || `Section ${(sectionProgress?.completed || 0) + 1}`;
    activeAgent = {
      name: "Section Writer Agent",
      role: "Deep Codebase Synthesizer",
      task: `Synthesizing ${currentTitle} (${(sectionProgress?.completed || 0) + 1}/${sectionProgress?.total || 6})...`,
      icon: <AnimatedWriterIcon isActive={true} />,
    };
  } else if (orchestratorStatus === "working") {
    activeAgent = {
      name: "Orchestrator Agent",
      role: "Architectural Planner",
      task: "Constructing multi-section blueprint & defining section goals...",
      icon: <AnimatedOrchestratorIcon isActive={true} />,
    };
  }

  const agentsList = [
    {
      id: "planner",
      name: "Planner Agent",
      sub: "Tech Stack & AST Classifier",
      status: plannerStatus,
      icon: <AnimatedPlannerIcon isActive={plannerStatus === "working"} />,
    },
    {
      id: "orchestrator",
      name: "Orchestrator",
      sub: "Section Blueprinting",
      status: orchestratorStatus,
      icon: <AnimatedOrchestratorIcon isActive={orchestratorStatus === "working"} />,
    },
    {
      id: "worker",
      name: "Section Writer",
      sub: "Deep Code Synthesis",
      status: sectionWorkerStatus,
      icon: <AnimatedWriterIcon isActive={sectionWorkerStatus === "working"} />,
    },
    {
      id: "reducer",
      name: "Reducer",
      sub: "Diagram & Output Compiler",
      status: reducerStatus,
      icon: <AnimatedReducerIcon isActive={reducerStatus === "working"} />,
    },
  ];

  return (
    <div className={styles.container}>
      {/* Background ambient glow - Green Theme */}
      <div className={styles.ambientGlow} />

      {/* Header Banner */}
      <div className={styles.header}>
        <div className={styles.headerMain}>
          <div className={styles.iconWrapper}>
            <ReportPageIcon />
          </div>
          <div className={styles.titleArea}>
            <div className={styles.titleRow}>
              <h3 className={styles.titleText}>Deep Codebase Architectural Analysis</h3>
              {repoName && <span className={styles.repoBadge}>{repoName}</span>}
            </div>
            <div className={styles.subtitle}>
              <span className={styles.liveStatusDot} />
              <span>LangGraph Multi-Agent Pipeline Active</span>
            </div>
          </div>
        </div>

        {typeof onStop === "function" && (
          <button onClick={onStop} className={styles.stopBtn} title="Stop report generation">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
            Stop Generation
          </button>
        )}
      </div>

      {/* Linear Progress Bar - Primary Green */}
      <div className={styles.progressSection}>
        <div className={styles.progressLabelRow}>
          <span>Multi-Agent Workflow Execution</span>
          <span className={styles.progressPercent}>{percent}%</span>
        </div>
        <div className={styles.track}>
          <div className={styles.fill} style={{ width: `${percent}%` }} />
        </div>
      </div>

      {/* Multi-Agent Pipeline Graph Flow */}
      <div className={styles.pipelineContainer}>
        <div className={styles.sectionHeader}>
          <span>Multi-Agent Pipeline Nodes</span>
          <span>4 Autonomous AI Agents</span>
        </div>

        <div className={styles.pipelineFlow}>
          {agentsList.map((ag) => {
            const isAct = ag.status === "working";
            const isComp = ag.status === "completed";

            const cardClass = `${styles.pipelineNode} ${
              isAct ? styles.pipelineNodeActive : isComp ? styles.pipelineNodeCompleted : ""
            }`;
            const iconClass = `${styles.nodeIconWrapper} ${
              isAct ? styles.nodeIconActive : isComp ? styles.nodeIconCompleted : ""
            }`;
            const badgeClass = `${styles.nodeBadge} ${
              isAct ? styles.nodeBadgeActive : isComp ? styles.nodeBadgeCompleted : styles.nodeBadgeQueued
            }`;

            return (
              <div key={ag.id} className={cardClass}>
                <div className={styles.nodeHeader}>
                  <div className={iconClass}>{ag.icon}</div>
                  <span className={badgeClass}>
                    {isAct ? "WORKING" : isComp ? "DONE" : "QUEUED"}
                  </span>
                </div>
                <div className={styles.nodeTitle}>{ag.name}</div>
                <div className={styles.nodeSubtitle}>{ag.sub}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Agent Focus Card - Subtle Matte */}
      <motion.div
        key={activeAgent.name}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={styles.activeAgentCard}
      >
        <div className={styles.activeAgentLeft}>
          <div className={styles.activeAgentAvatar}>{activeAgent.icon}</div>
          <div className={styles.activeAgentDetails}>
            <div className={styles.activeAgentHeaderRow}>
              <span className={styles.activeAgentName}>{activeAgent.name}</span>
              <span className={styles.activeAgentRoleTag}>{activeAgent.role}</span>
            </div>
            <p className={styles.activeAgentTask}>{activeAgent.task}</p>
          </div>
        </div>
      </motion.div>

      {/* Live Activity Terminal Log */}
      {stages.length > 0 && (
        <div className={styles.terminalCard}>
          <div className={styles.terminalHeader}>
            <div className={styles.terminalDots}>
              <span className={styles.dotRed} />
              <span className={styles.dotYellow} />
              <span className={styles.dotGreen} />
            </div>
            <span>Agent Activity Stream</span>
          </div>

          <div className={styles.terminalLogs}>
            <AnimatePresence initial={false}>
              {stages.map((stg, i) => (
                <motion.div
                  key={`${i}-${stg}`}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className={styles.logItem}
                >
                  <span className={styles.logPrompt}>&gt;</span>
                  <span>{stg}</span>
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={terminalEndRef} />
          </div>
        </div>
      )}

      {/* Section Outline Plan Grid */}
      {plan && (
        <div className={styles.planContainer}>
          <div className={styles.planGridTitleRow}>
            <h4 className={styles.planTitle}>{plan.report_title}</h4>
            {plan.report_type && <span className={styles.planTypeBadge}>{plan.report_type}</span>}
          </div>

          <div className={styles.planGrid}>
            {plan.sections.map((sec, idx) => {
              let status: "completed" | "writing" | "queued" = "queued";
              if (sectionProgress) {
                if (idx < sectionProgress.completed) {
                  status = "completed";
                } else if (idx === sectionProgress.completed) {
                  status = "writing";
                }
              } else if (idx === 0) {
                status = "writing";
              }

              const cardClass = `${styles.planCard} ${
                status === "writing"
                  ? styles.planCardActive
                  : status === "completed"
                  ? styles.planCardCompleted
                  : ""
              }`;

              return (
                <motion.div
                  key={sec.id || idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: idx * 0.05 }}
                  className={cardClass}
                >
                  <div className={styles.planCardHeader}>
                    <span className={styles.planCardIndex}>
                      SECTION {String(sec.id).padStart(2, "0")}
                    </span>
                    {status === "completed" && (
                      <span className={styles.planCardStatusBadgeCompleted}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Done
                      </span>
                    )}
                    {status === "writing" && (
                      <span className={styles.planCardStatusBadgeWriting}>
                        <span className={styles.writingDot} />
                        Synthesizing...
                      </span>
                    )}
                    {status === "queued" && (
                      <span className={styles.planCardStatusBadgeQueued}>Queued</span>
                    )}
                  </div>

                  <h5 className={styles.planCardTitle}>{sec.title}</h5>
                  <p className={styles.planCardGoal}>{sec.goal}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
