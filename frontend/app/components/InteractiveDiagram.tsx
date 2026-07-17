"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import styles from "./InteractiveDiagram.module.css";

/* ═══════════════════════════════════════════════════════════════════
   HELPER SVG COMPONENTS
   ═══════════════════════════════════════════════════════════════════ */

/* ── Glass Card Node ──────────────────────────────────────────── */
function CardNode({
  x, y, w, h, label, sublabel, icon, active, color = "#c8ccd4",
}: {
  x: number; y: number; w: number; h: number;
  label: string; sublabel?: string; icon?: React.ReactNode;
  active: boolean; color?: string;
}) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Card body */}
      <rect
        x={-w / 2} y={-h / 2} width={w} height={h} rx={10}
        fill={active ? `rgba(${hexToRgb(color)}, 0.06)` : "rgba(8,8,8,0.95)"}
        stroke={active ? color : "rgba(255,255,255,0.05)"}
        strokeWidth={active ? 1 : 0.5}
      />
      {/* Top highlight line */}
      <line
        x1={-w / 2 + 10} y1={-h / 2 + 0.5} x2={w / 2 - 10} y2={-h / 2 + 0.5}
        stroke={active ? `${color}60` : "rgba(255,255,255,0.03)"}
        strokeWidth="0.5" strokeLinecap="round"
      />
      {/* Icon area */}
      {icon && <g transform="translate(0, -6)" opacity={active ? 0.9 : 0.35}>{icon}</g>}
      {/* Label */}
      <text
        y={icon ? 10 : (sublabel ? -2 : 3)} fontSize="8" textAnchor="middle"
        fill={active ? "#fafafa" : "rgba(255,255,255,0.5)"}
        fontFamily="var(--font-display)" fontWeight="500"
      >{label}</text>
      {/* Sublabel */}
      {sublabel && (
        <text
          y={icon ? 20 : 10} fontSize="6" textAnchor="middle"
          fill={active ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.25)"}
          fontFamily="var(--font-mono)"
        >{sublabel}</text>
      )}
    </g>
  );
}

/* ── Animated Connection ──────────────────────────────────────── */
function Connection({
  path, active, color = "#c8ccd4", dotCount = 1, speed = 3,
}: {
  path: string; active: boolean; color?: string; dotCount?: number; speed?: number;
}) {
  return (
    <g>
      {/* Static background line */}
      <path d={path} className={styles.connectorBase} />
      {/* Active highlight */}
      {active && (
        <>
          <path d={path} className={styles.connectorActive} stroke={color} />
          {/* Travelling dots */}
          {Array.from({ length: dotCount }).map((_, i) => (
            <circle key={i} r="2.2" fill={color} className={styles.travelDot}
              style={{ filter: `drop-shadow(0 0 4px ${color})` }}
            >
              <animateMotion
                dur={`${speed}s`}
                repeatCount="indefinite"
                begin={`${(i / dotCount) * speed}s`}
              >
                <mpath href={`#${pathId(path)}`} />
              </animateMotion>
            </circle>
          ))}
        </>
      )}
    </g>
  );
}

/* ── Stable path‐id helper (deterministic, no random) ─────── */
let _pid = 0;
const _pathMap = new Map<string, string>();
function pathId(d: string) {
  if (!_pathMap.has(d)) _pathMap.set(d, `cp${++_pid}`);
  return _pathMap.get(d)!;
}

/* ── Hex→RGB helper ───────────────────────────────────────── */
function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return `${parseInt(h.substring(0, 2), 16)}, ${parseInt(h.substring(2, 4), 16)}, ${parseInt(h.substring(4, 6), 16)}`;
}


/* ═══════════════════════════════════════════════════════════════════
   PATHS (defined once for <defs> and for <animateMotion mpath>)
   ═══════════════════════════════════════════════════════════════════ */
const PATHS = {
  devToIngest:      "M 130,130 C 170,130 200,130 240,130",
  ingestToNeo:      "M 310,130 C 345,130 360,100 395,100",
  ingestToVec:      "M 310,130 C 345,130 360,160 395,160",
  neoToOrch:        "M 455,100 C 485,100 495,130 530,130",
  vecToOrch:        "M 455,160 C 485,160 495,130 530,130",
  orchToDoc:        "M 560,110 C 570,85 570,65 560,50",
  orchToQa:         "M 590,115 L 650,60",
  orchToTest:       "M 620,130 C 660,130 690,90 720,60",
  chatToNeo:        "M 300,260 C 320,200 370,130 395,100",
  chatToVec:        "M 340,260 C 360,220 390,185 395,160",
  neoToChat:        "M 455,100 C 470,150 460,220 440,260",
  vecToChat:        "M 455,160 C 465,200 460,240 440,260",
  orchToDeploy:     "M 590,145 C 610,175 640,200 680,215",
  deployAck:        "M 240,140 C 200,140 170,140 130,140",
} as const;


/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */
export default function InteractiveDiagram() {
  const [phase, setPhase] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [typedChat, setTypedChat] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Check if mobile screen (less than 768px width)
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const TOTAL_PHASES = 11;

  /* ── Scroll tracking ───────────────────────────────────────── */
  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const wh = window.innerHeight;
      const progress = Math.max(0, Math.min(1, (wh - rect.top) / (wh + rect.height)));
      setScrollProgress(progress);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  /* ── Phase loop ────────────────────────────────────────────── */
  useEffect(() => {
    let tid: NodeJS.Timeout;
    const delays = [
      1400,  // 0  idle
      1800,  // 1  developer pushes code
      2000,  // 2  ingest + parse AST → databases
      1800,  // 3  data flows into orchestrator
      2000,  // 4  agents spawned & working
      2200,  // 5  agents verified ✓
      1600,  // 6  user types chat question
      1800,  // 7  RAG searches vectors + graph
      2400,  // 8  answer appears with citations
      2000,  // 9  deploy / merge live
      3200,  // 10 success ack, pause
    ];
    const run = (p: number) => {
      setPhase(p);
      tid = setTimeout(() => run((p + 1) % TOTAL_PHASES), delays[p]);
    };
    run(0);
    return () => clearTimeout(tid);
  }, []);

  /* ── Chat typing simulation ─────────────────────────────────── */
  useEffect(() => {
    if (phase === 6) {
      const msg = "How does auth middleware work?";
      let cursor = 0;
      setTypedChat("");
      const iv = setInterval(() => {
        setTypedChat(msg.slice(0, ++cursor));
        if (cursor >= msg.length) clearInterval(iv);
      }, 55);
      return () => clearInterval(iv);
    } else if (phase < 6) {
      setTypedChat("");
    }
  }, [phase]);

  /* ── Scroll 3D transforms ──────────────────────────────────── */
  let opacity = 0, ty = 100, sc = 0.93, rx = 8;
  if (scrollProgress >= 0.12 && scrollProgress < 0.35) {
    const t = (scrollProgress - 0.12) / 0.23;
    const e = t * (2 - t); // ease-out
    opacity = e; ty = (1 - e) * 100; sc = 0.93 + 0.07 * e; rx = (1 - e) * 8;
  } else if (scrollProgress >= 0.35 && scrollProgress <= 0.70) {
    opacity = 1; ty = 0; sc = 1; rx = 0;
  } else if (scrollProgress > 0.70 && scrollProgress <= 0.92) {
    const t = (scrollProgress - 0.70) / 0.22;
    const e = t * t; // ease-in
    opacity = 1 - e; ty = -e * 100; sc = 1 - 0.05 * e; rx = -e * 6;
  }

  /* ── Status label ──────────────────────────────────────────── */
  const statusLabels = [
    "Waiting for changes…",
    "Receiving git push from developer…",
    "Parsing AST · Indexing graph & embeddings…",
    "Routing data to AI Orchestrator…",
    "Agents analyzing: docs · quality · tests…",
    "All agent tasks verified ✓",
    "User asking a question…",
    "Searching vector store & knowledge graph…",
    "Answer generated with source citations",
    "Changes deployed — system live",
    "System synchronized — ready for next push",
  ];

  let cardWidth = "80vw";
  let cardRadius = 22;

  if (isMobile) {
    cardWidth = "100vw";
    cardRadius = 0;
  } else if (scrollProgress >= 0.35 && scrollProgress <= 0.70) {
    if (scrollProgress < 0.45) {
      const t = (scrollProgress - 0.35) / 0.10;
      const e = t * (2 - t); // ease-out
      cardWidth = `${80 + 20 * e}vw`;
      cardRadius = Math.round(22 * (1 - e));
    } else if (scrollProgress >= 0.45 && scrollProgress <= 0.60) {
      cardWidth = "100vw";
      cardRadius = 0;
    } else {
      const t = (scrollProgress - 0.60) / 0.10;
      const e = t * t; // ease-in
      cardWidth = `${100 - 20 * e}vw`;
      cardRadius = Math.round(22 * e);
    }
  }

  return (
    <div 
      ref={containerRef} 
      className={styles.wrapper} 
      style={{ 
        width: cardWidth, 
        maxWidth: "100vw", 
        margin: "0 auto", 
        transition: "width 500ms cubic-bezier(0.16, 1, 0.3, 1)" 
      }}
    >
      <motion.div
        className={styles.bezelOuter}
        style={{
          opacity,
          transform: `rotateX(${rx}deg) translateY(${ty}px) scale(${sc})`,
          transformStyle: "preserve-3d",
          pointerEvents: opacity < 0.1 ? "none" : "auto",
          borderRadius: `${cardRadius}px`,
          transition: "transform 350ms cubic-bezier(0.16, 1, 0.3, 1), opacity 350ms cubic-bezier(0.16, 1, 0.3, 1), border-radius 500ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div 
          className={styles.bezelInner}
          style={{
            borderRadius: `${Math.max(0, cardRadius - 4)}px`,
            transition: "border-radius 500ms cubic-bezier(0.16, 1, 0.3, 1)"
          }}
        >

          {/* ── Browser Chrome ─────────────────────────────── */}
          <div className={styles.chrome}>
            <div className={styles.dots}>
              <span className={styles.dotRed} />
              <span className={styles.dotYellow} />
              <span className={styles.dotGreen} />
            </div>
            <div className={styles.addressBar}>
              <span className={styles.lockIcon}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <span className={styles.url}>gitmesh.dev/overview</span>
            </div>
            <div className={styles.chromeSpacer}>
              <span className={styles.titleText}>GitMesh — System Architecture</span>
            </div>
          </div>

          {/* ── SVG Diagram ───────────────────────────────── */}
          <div className={styles.svgContainer}>
            <svg className={styles.svgDiagram} viewBox="0 0 900 470">

              {/* ── DEFS: gradients + path definitions ────── */}
              <defs>
                {Object.entries(PATHS).map(([key, d]) => (
                  <path key={key} id={pathId(d)} d={d} fill="none" />
                ))}

                <radialGradient id="glowRed" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#c8ccd4" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="#c8ccd4" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="glowAmber" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="glowGreen" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity="0.14" />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="glowBlue" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.14" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* ── Subtle grid ───────────────────────────── */}
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.012)" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="900" height="470" fill="url(#grid)" />

              {/* ── AMBIENT GLOWS ─────────────────────────── */}
              {phase >= 1 && phase <= 2 && <circle cx={275} cy={130} r={65} fill="url(#glowRed)" className={styles.glowPulse} />}
              {phase >= 3 && phase <= 4 && <circle cx={575} cy={130} r={80} fill="url(#glowAmber)" className={styles.glowPulse} />}
              {phase === 5 && <circle cx={575} cy={80} r={80} fill="url(#glowGreen)" className={styles.glowPulse} />}
              {phase >= 6 && phase <= 8 && <circle cx={480} cy={345} r={75} fill="url(#glowBlue)" className={styles.glowPulse} />}
              {phase >= 9 && <circle cx={720} cy={215} r={65} fill="url(#glowGreen)" className={styles.glowPulse} />}


              {/* ═══ CONNECTIONS ══════════════════════════════ */}

              {/* Dev → Ingestion */}
              <Connection path={PATHS.devToIngest} active={phase === 1} color="#c8ccd4" speed={2} />

              {/* Ingestion → Neo4j */}
              <Connection path={PATHS.ingestToNeo} active={phase === 2} color="#a78bfa" speed={2.2} />

              {/* Ingestion → Supabase */}
              <Connection path={PATHS.ingestToVec} active={phase === 2} color="#22c55e" speed={2.4} />

              {/* Neo4j → Orchestrator */}
              <Connection path={PATHS.neoToOrch} active={phase === 3} color="#f59e0b" speed={2} />

              {/* Supabase → Orchestrator */}
              <Connection path={PATHS.vecToOrch} active={phase === 3} color="#f59e0b" speed={2.2} />

              {/* Orchestrator → Docs Agent */}
              <Connection path={PATHS.orchToDoc} active={phase === 4} color="#f59e0b" speed={1.8} />

              {/* Orchestrator → QA Agent */}
              <Connection path={PATHS.orchToQa} active={phase === 4} color="#f59e0b" speed={2} />

              {/* Orchestrator → Test Agent */}
              <Connection path={PATHS.orchToTest} active={phase === 4} color="#f59e0b" speed={2.2} />

              {/* Chat → Neo4j lookup */}
              <Connection path={PATHS.chatToNeo} active={phase === 7} color="#3b82f6" speed={2.2} dotCount={2} />

              {/* Chat → Supabase lookup */}
              <Connection path={PATHS.chatToVec} active={phase === 7} color="#3b82f6" speed={2.5} dotCount={2} />

              {/* Neo4j → Chat (answer data) */}
              <Connection path={PATHS.neoToChat} active={phase === 8} color="#3b82f6" speed={2} />

              {/* Supabase → Chat (answer data) */}
              <Connection path={PATHS.vecToChat} active={phase === 8} color="#3b82f6" speed={2.2} />

              {/* Orchestrator → Deployed */}
              <Connection path={PATHS.orchToDeploy} active={phase === 9} color="#22c55e" speed={2.5} />

              {/* Deploy ack back to dev */}
              <Connection path={PATHS.deployAck} active={phase === 10} color="#22c55e" speed={3} />


              {/* ═══ NODES ═══════════════════════════════════ */}

              {/* ── Developer ─────────────────────────────── */}
              <g transform="translate(90, 130)">
                {/* Laptop body */}
                <rect x="-32" y="-24" width="64" height="36" rx="4"
                  fill={phase >= 1 ? "rgba(200,204,212,0.05)" : "rgba(8,8,8,0.95)"}
                  stroke={phase >= 1 ? "#c8ccd4" : "rgba(255,255,255,0.05)"}
                  strokeWidth={phase >= 1 ? 0.8 : 0.5}
                />
                {/* Screen */}
                <rect x="-28" y="-21" width="56" height="30" rx="2" fill="#0a0a0a" />
                {/* Code lines */}
                <g opacity={phase >= 1 ? 1 : 0.3}>
                  <rect x="-24" y="-17" width="16" height="1.5" rx="0.75" fill="#c8ccd4" opacity="0.8" />
                  <rect x="-24" y="-13" width="24" height="1.5" rx="0.75" fill="rgba(255,255,255,0.2)" />
                  <rect x="-24" y="-9" width="12" height="1.5" rx="0.75" fill="rgba(255,255,255,0.15)" />
                  <rect x="-24" y="-5" width="20" height="1.5" rx="0.75" fill="rgba(255,255,255,0.1)" />
                  <rect x="-24" y="-1" width="8" height="1.5" rx="0.75" fill="#c8ccd4" opacity="0.6" />
                  <rect x="-24" y="3" width="18" height="1.5" rx="0.75" fill="rgba(255,255,255,0.12)" />
                </g>
                {/* Keyboard base */}
                <path d="M -38,12 L 38,12 L 32,16 L -32,16 Z" fill="#0e0e0e" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
                {/* Label */}
                <text y="30" fontSize="7.5" textAnchor="middle" fill={phase >= 1 ? "#fafafa" : "rgba(255,255,255,0.5)"} fontFamily="var(--font-display)" fontWeight="500">Developer</text>
                <text y="40" fontSize="5.5" textAnchor="middle" fill="var(--color-text-tertiary)" fontFamily="var(--font-mono)">git push origin main</text>
              </g>

              {/* ── Ingestion Server ──────────────────────── */}
              <CardNode x={275} y={130} w={70} h={48} label="Ingestion" sublabel="tree-sitter · AST"
                active={phase >= 1 && phase <= 2} color="#c8ccd4"
                icon={
                  <g stroke="#fafafa" strokeWidth="0.8" fill="none">
                    <rect x="-6" y="-5" width="12" height="10" rx="1.5" />
                    <line x1="-3" y1="-2" x2="3" y2="-2" />
                    <line x1="-3" y1="0" x2="1" y2="0" />
                    <line x1="-3" y1="2" x2="4" y2="2" />
                  </g>
                }
              />

              {/* ── Neo4j ────────────────────────────────── */}
              <CardNode x={425} y={100} w={60} h={38} label="Neo4j" sublabel="knowledge graph"
                active={phase >= 2 && phase <= 3} color="#a78bfa"
                icon={
                  <g stroke="#a78bfa" strokeWidth="0.6" fill="none" opacity="0.7">
                    <circle cx="-4" cy="-2" r="2" /><circle cx="4" cy="-2" r="2" /><circle cx="0" cy="3" r="2" />
                    <line x1="-2" y1="-1" x2="2" y2="-1" /><line x1="-3" y1="0" x2="-1" y2="2" /><line x1="3" y1="0" x2="1" y2="2" />
                  </g>
                }
              />

              {/* ── Supabase Vectors ──────────────────────── */}
              <CardNode x={425} y={160} w={60} h={38} label="Supabase" sublabel="vector embeddings"
                active={phase >= 2 && phase <= 3} color="#22c55e"
                icon={
                  <g stroke="#22c55e" strokeWidth="0.6" fill="none" opacity="0.7">
                    <rect x="-5" y="-4" width="10" height="8" rx="1" />
                    <line x1="-3" y1="-1" x2="3" y2="-1" /><line x1="-3" y1="1" x2="1" y2="1" />
                  </g>
                }
              />

              {/* ── AI Orchestrator ───────────────────────── */}
              <g transform="translate(575, 130)">
                <rect x="-38" y="-32" width="76" height="64" rx="12"
                  fill={phase >= 3 && phase <= 5 ? (phase === 5 ? "rgba(34,197,94,0.06)" : "rgba(245,158,11,0.05)") : "rgba(8,8,8,0.95)"}
                  stroke={phase >= 3 && phase <= 5 ? (phase === 5 ? "#22c55e" : "#f59e0b") : "rgba(255,255,255,0.05)"}
                  strokeWidth={phase >= 3 && phase <= 5 ? 1 : 0.5}
                />
                <line x1="-28" y1="-31.5" x2="28" y2="-31.5"
                  stroke={phase >= 3 && phase <= 5 ? (phase === 5 ? "#22c55e40" : "#f59e0b40") : "rgba(255,255,255,0.02)"}
                  strokeWidth="0.5" strokeLinecap="round"
                />
                {/* Brain chip icon */}
                <g stroke={phase >= 3 && phase <= 5 ? "#fafafa" : "rgba(255,255,255,0.3)"} strokeWidth="0.8" fill="none" transform="translate(-7,-12)">
                  <rect x="0" y="0" width="14" height="14" rx="2" />
                  <circle cx="7" cy="7" r="3" />
                  <line x1="3" y1="0" x2="3" y2="-3" /><line x1="7" y1="0" x2="7" y2="-3" /><line x1="11" y1="0" x2="11" y2="-3" />
                  <line x1="3" y1="14" x2="3" y2="17" /><line x1="7" y1="14" x2="7" y2="17" /><line x1="11" y1="14" x2="11" y2="17" />
                  <line x1="0" y1="4" x2="-3" y2="4" /><line x1="0" y1="10" x2="-3" y2="10" />
                  <line x1="14" y1="4" x2="17" y2="4" /><line x1="14" y1="10" x2="17" y2="10" />
                </g>
                <text y="14" fontSize="7.5" textAnchor="middle" fill={phase >= 3 ? "#fafafa" : "rgba(255,255,255,0.5)"} fontFamily="var(--font-display)" fontWeight="500">AI Orchestrator</text>
                <text y="24" fontSize="5.5" textAnchor="middle" fill="var(--color-text-tertiary)" fontFamily="var(--font-mono)">multi-agent engine</text>
              </g>

              {/* ── Sub-agents ────────────────────────────── */}
              {/* Docs Agent */}
              <CardNode x={550} y={42} w={52} h={32} label="Docs" sublabel={phase === 5 ? "done ✓" : "agent"}
                active={phase >= 4 && phase <= 5} color={phase === 5 ? "#22c55e" : "#f59e0b"}
              />
              {/* QA Agent */}
              <CardNode x={650} y={50} w={52} h={32} label="Quality" sublabel={phase === 5 ? "done ✓" : "agent"}
                active={phase >= 4 && phase <= 5} color={phase === 5 ? "#22c55e" : "#f59e0b"}
              />
              {/* Test Agent */}
              <CardNode x={740} y={50} w={52} h={32} label="Tests" sublabel={phase === 5 ? "done ✓" : "agent"}
                active={phase >= 4 && phase <= 5} color={phase === 5 ? "#22c55e" : "#f59e0b"}
              />


              {/* ═══ CHAT Q&A SHOWCASE ═══════════════════════ */}

              <g transform="translate(120, 260)">
                {/* Chat panel background */}
                <rect x="0" y="0" width="580" height="175" rx="12"
                  fill="rgba(6,6,6,0.95)"
                  stroke={phase >= 6 && phase <= 8 ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.03)"}
                  strokeWidth={phase >= 6 && phase <= 8 ? 0.8 : 0.5}
                />
                {/* Top highlight */}
                <line x1="12" y1="0.5" x2="568" y2="0.5"
                  stroke={phase >= 6 && phase <= 8 ? "rgba(59,130,246,0.08)" : "rgba(255,255,255,0.02)"}
                  strokeWidth="0.5" strokeLinecap="round"
                />

                {/* Title bar */}
                <rect x="0" y="0" width="580" height="24" rx="12" fill="rgba(255,255,255,0.01)" />
                <rect x="0" y="14" width="580" height="10" fill="rgba(255,255,255,0.01)" />
                <line x1="0" y1="24" x2="580" y2="24" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />

                <circle cx="14" cy="12" r="1.8" fill="#ff5f57" />
                <circle cx="22" cy="12" r="1.8" fill="#febc2e" />
                <circle cx="30" cy="12" r="1.8" fill="#28c840" />
                <text x="290" y="15" fontSize="5.5" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontFamily="var(--font-mono)" letterSpacing="0.04em">
                  Code Chat — Powered by RAG
                </text>

                {/* ── User message bubble ──────────────── */}
                {phase >= 6 && (
                  <g transform="translate(560, 50)">
                    {(() => {
                      const msg = phase === 6 ? typedChat : "How does auth middleware work?";
                      const bw = Math.max(msg.length * 4.5 + 24, 40);
                      return (
                        <>
                          <rect x={-bw} y="-11" width={bw} height="22" rx="8"
                            fill="rgba(200,204,212,0.10)" stroke="rgba(200,204,212,0.2)" strokeWidth="0.5"
                          />
                          <text x={-bw / 2} y="2" fontSize="6" textAnchor="middle" fill="#c8ccd4" fontFamily="var(--font-sans)">{msg}</text>
                          {phase === 6 && <rect x={-4} y="-6" width="1.5" height="12" fill="#c8ccd4" opacity="0.8">
                            <animate attributeName="opacity" values="0.8;0;0.8" dur="1s" repeatCount="indefinite" />
                          </rect>}
                        </>
                      );
                    })()}
                  </g>
                )}

                {/* ── Thinking dots ────────────────────── */}
                {phase === 7 && (
                  <g transform="translate(24, 85)" opacity="0.7">
                    {[0, 8, 16].map((cx, i) => (
                      <circle key={i} cx={cx} cy="0" r="2" fill="#3b82f6">
                        <animate attributeName="opacity" values="0.3;1;0.3" dur="1.2s" begin={`${i * 0.2}s`} repeatCount="indefinite" />
                      </circle>
                    ))}
                    <text x="26" y="3" fontSize="5.5" fill="rgba(255,255,255,0.35)" fontFamily="var(--font-mono)">Searching knowledge graph & embeddings…</text>
                  </g>
                )}

                {/* ── AI answer with citation ─────────── */}
                {phase >= 8 && (
                  <g transform="translate(20, 72)">
                    <rect x="0" y="0" width="400" height="78" rx="8"
                      fill="rgba(255,255,255,0.015)" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5"
                    />
                    <text x="12" y="17" fontSize="6" fill="rgba(255,255,255,0.8)" fontFamily="var(--font-sans)">
                      The auth middleware in security.py validates JWT tokens using
                    </text>
                    <text x="12" y="29" fontSize="6" fill="rgba(255,255,255,0.8)" fontFamily="var(--font-sans)">
                      Supabase&apos;s verify method. It extracts the Bearer token from
                    </text>
                    <text x="12" y="41" fontSize="6" fill="rgba(255,255,255,0.8)" fontFamily="var(--font-sans)">
                      the Authorization header and validates expiry + signature.
                    </text>
                    {/* Source citation */}
                    <rect x="12" y="52" width="180" height="18" rx="4"
                      fill="rgba(200,204,212,0.04)" stroke="rgba(200,204,212,0.12)" strokeWidth="0.4"
                    />
                    <text x="20" y="63" fontSize="5" fill="#c8ccd4" fontFamily="var(--font-mono)" fontWeight="500">
                      📄 security.py  L42–L67
                    </text>
                    <text x="120" y="63" fontSize="5" fill="rgba(255,255,255,0.25)" fontFamily="var(--font-mono)">
                      similarity: 0.94
                    </text>
                  </g>
                )}

                {/* ── Input bar ────────────────────────── */}
                <g transform="translate(12, 155)">
                  <rect x="0" y="-8" width="556" height="22" rx="8"
                    fill="rgba(255,255,255,0.015)"
                    stroke={phase === 6 ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.04)"}
                    strokeWidth="0.5"
                  />
                  <text x="10" y="5" fontSize="5.5"
                    fill={phase >= 6 ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.2)"}
                    fontFamily="var(--font-sans)"
                  >
                    {phase === 6 ? typedChat : phase >= 7 ? "How does auth middleware work?" : "Ask anything about the codebase…"}
                  </text>
                </g>
              </g>




              {/* ═══ DEPLOYED / LIVE ═════════════════════════ */}
              <g transform="translate(720, 215)">
                <rect x="-40" y="-25" width="80" height="50" rx="12"
                  fill={phase >= 9 ? "rgba(34,197,94,0.06)" : "rgba(8,8,8,0.95)"}
                  stroke={phase >= 9 ? "#22c55e" : "rgba(255,255,255,0.04)"}
                  strokeWidth={phase >= 9 ? 1 : 0.5}
                />
                <line x1="-30" y1="-24.5" x2="30" y2="-24.5"
                  stroke={phase >= 9 ? "#22c55e40" : "rgba(255,255,255,0.02)"}
                  strokeWidth="0.5" strokeLinecap="round"
                />
                {/* Checkmark icon */}
                {phase >= 9 ? (
                  <g transform="translate(0, -6)">
                    <circle r="8" fill="rgba(34,197,94,0.15)" stroke="#22c55e" strokeWidth="0.8" />
                    <path d="M -4,0 L -1.5,2.5 L 4,-2" fill="none" stroke="#22c55e" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                ) : (
                  <g opacity="0.25" transform="translate(0, -6)">
                    <circle r="8" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
                    <circle r="1.5" fill="rgba(255,255,255,0.1)" />
                  </g>
                )}
                <text y="14" fontSize="7.5" textAnchor="middle"
                  fill={phase >= 9 ? "#22c55e" : "rgba(255,255,255,0.35)"}
                  fontFamily="var(--font-display)" fontWeight="500"
                >Deployed</text>
                <text y="22" fontSize="5" textAnchor="middle" fill="var(--color-text-tertiary)" fontFamily="var(--font-mono)">
                  merged & live
                </text>
              </g>


              {/* ═══ STATUS LINE ═════════════════════════════ */}
              <text x={450} y={460} fontSize="6.5" fontFamily="var(--font-mono)" textAnchor="middle"
                fill={phase >= 5 && phase <= 9 ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.2)"}
                letterSpacing="0.02em"
              >
                {statusLabels[phase]}
              </text>

            </svg>
          </div>

        </div>
      </motion.div>
      <div className={styles.reflection} />
    </div>
  );
}
