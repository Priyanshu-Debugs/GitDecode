"use client";

import { useEffect, useState } from "react";
import styles from "./HeroDashboardMockup.module.css";

/* Simulated file names for the sidebar */
const FILES = [
  { name: "security.py", lang: "PY" },
  { name: "neo4j_client.py", lang: "PY" },
  { name: "ingestion.py", lang: "PY" },
  { name: "visualizer.ts", lang: "TS" },
  { name: "blast_agent.ts", lang: "TS" },
];

/* Simulated graph nodes */
const NODES = [
  { id: "main", x: 160, y: 40, label: "main.py", color: "#d4270f" },
  { id: "security", x: 60, y: 100, label: "security", color: "#f59e0b" },
  { id: "neo4j", x: 260, y: 100, label: "neo4j", color: "#a78bfa" },
  { id: "ingestion", x: 100, y: 170, label: "ingestion", color: "#22c55e" },
  { id: "embedder", x: 220, y: 170, label: "embedder", color: "#f59e0b" },
];

const EDGES: [string, string][] = [
  ["main", "security"],
  ["main", "neo4j"],
  ["security", "ingestion"],
  ["neo4j", "ingestion"],
  ["neo4j", "embedder"],
];

export default function HeroDashboardMockup() {
  const [activeNode, setActiveNode] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveNode((prev) => (prev + 1) % NODES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={styles.wrapper}>
      {/* Outer bezel / glass frame */}
      <div className={styles.bezelOuter}>
        <div className={styles.bezelInner}>
          {/* Browser chrome */}
          <div className={styles.chrome}>
            <div className={styles.dots}>
              <span className={styles.dotRed} />
              <span className={styles.dotYellow} />
              <span className={styles.dotGreen} />
            </div>
            <div className={styles.addressBar}>
              <span className={styles.lockIcon}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <span className={styles.url}>app.gitmesh.dev/dashboard</span>
            </div>
            <div className={styles.chromeSpacer} />
          </div>

          {/* Dashboard content */}
          <div className={styles.dashboardBody}>
            {/* Sidebar */}
            <div className={styles.sidebar}>
              <div className={styles.sidebarHeader}>
                <span className={styles.sidebarTitle}>Explorer</span>
              </div>
              {FILES.map((f, i) => (
                <div
                  key={f.name}
                  className={`${styles.sidebarFile} ${i === activeNode % FILES.length ? styles.sidebarFileActive : ""}`}
                >
                  <span className={styles.fileLang}>{f.lang}</span>
                  <span className={styles.fileName}>{f.name}</span>
                </div>
              ))}
            </div>

            {/* Main area — mini graph */}
            <div className={styles.mainArea}>
              <svg className={styles.graphSvg} viewBox="0 0 320 210">
                {/* Edges */}
                {EDGES.map(([from, to], i) => {
                  const f = NODES.find((n) => n.id === from)!;
                  const t = NODES.find((n) => n.id === to)!;
                  return (
                    <line
                      key={i}
                      x1={f.x}
                      y1={f.y}
                      x2={t.x}
                      y2={t.y}
                      stroke="rgba(255,255,255,0.08)"
                      strokeWidth="1"
                    />
                  );
                })}

                {/* Nodes */}
                {NODES.map((node, i) => (
                  <g key={node.id}>
                    {/* Glow ring for active node */}
                    {i === activeNode && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r="18"
                        fill="none"
                        stroke={node.color}
                        strokeWidth="1"
                        opacity="0.3"
                        className={styles.pulseRing}
                      />
                    )}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r="8"
                      fill={i === activeNode ? node.color : "rgba(255,255,255,0.06)"}
                      stroke={node.color}
                      strokeWidth="1.5"
                      opacity={i === activeNode ? 1 : 0.5}
                      className={styles.graphNode}
                    />
                    <text
                      x={node.x}
                      y={node.y + 22}
                      textAnchor="middle"
                      fill="rgba(255,255,255,0.4)"
                      fontSize="8"
                      fontFamily="var(--font-mono)"
                    >
                      {node.label}
                    </text>
                  </g>
                ))}
              </svg>
            </div>

            {/* Right panel — mini chat */}
            <div className={styles.chatPanel}>
              <div className={styles.chatHeader}>
                <span className={styles.chatDot} />
                <span className={styles.chatTitle}>Chat</span>
              </div>
              <div className={styles.chatMsg + " " + styles.chatUser}>
                How does auth work?
              </div>
              <div className={styles.chatMsg + " " + styles.chatBot}>
                JWT tokens validated in security.py via HS256...
              </div>
              <div className={styles.chatInputMock}>
                <span>Ask about code...</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reflection / glow underneath */}
      <div className={styles.reflection} />
    </div>
  );
}
