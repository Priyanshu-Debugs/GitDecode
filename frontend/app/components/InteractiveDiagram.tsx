"use client";

import React, { useState, useEffect } from "react";
import styles from "./InteractiveDiagram.module.css";

/* ── Storage Cylinder Graphic Component ────────────────────────── */
interface StorageCylinderProps {
  x: number;
  y: number;
  active: boolean;
}

function StorageCylinder({ x, y, active }: StorageCylinderProps) {
  return (
    <g transform={`translate(${x}, ${y})`} className="transition-all duration-300">
      {/* 3D Cylinder Base */}
      <path
        d="M -14,0 L -14,16 A 14,4 0 0,0 14,16 L 14,0 Z"
        fill={active ? "rgba(34, 197, 94, 0.2)" : "rgba(255, 255, 255, 0.02)"}
        stroke={active ? "#22c55e" : "rgba(255, 255, 255, 0.10)"}
        strokeWidth="1.2"
        className="transition-colors duration-300"
      />
      {/* Storage layers */}
      <path
        d="M -14,5 A 14,4 0 0,0 14,5"
        fill="none"
        stroke={active ? "#22c55e" : "rgba(255, 255, 255, 0.06)"}
        strokeWidth="1"
        className="transition-colors duration-300"
      />
      <path
        d="M -14,10 A 14,4 0 0,0 14,10"
        fill="none"
        stroke={active ? "#22c55e" : "rgba(255, 255, 255, 0.06)"}
        strokeWidth="1"
        className="transition-colors duration-300"
      />
      {/* Top lid */}
      <ellipse
        cx="0"
        cy="0"
        rx="14"
        ry="4"
        fill={active ? "#22c55e" : "rgba(255, 255, 255, 0.06)"}
        stroke={active ? "#22c55e" : "rgba(255, 255, 255, 0.12)"}
        strokeWidth="1.2"
        className="transition-colors duration-300"
      />
      {/* Text Label */}
      <text
        y="26"
        fontSize="6.5"
        fontFamily="monospace"
        textAnchor="middle"
        fill={active ? "#22c55e" : "var(--color-text-tertiary)"}
        className="transition-colors duration-300 font-semibold"
      >
        Git ODB
      </text>
    </g>
  );
}

/* ── Laptop Graphic Component ──────────────────────────────────── */
interface LaptopIconProps {
  x: number;
  y: number;
  active: boolean;
}

function LaptopIcon({ x, y, active }: LaptopIconProps) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Screen frame */}
      <rect
        x="-26"
        y="-32"
        width="52"
        height="32"
        rx="2"
        fill="#111113"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth="1"
      />
      {/* Screen glass */}
      <rect x="-23" y="-29" width="46" height="26" rx="1" fill="#000000" />
      {/* Terminal text lines */}
      <circle
        cx="-19"
        cy="-25"
        r="0.8"
        fill={active ? "#b01e0a" : "#555"}
        className="animate-pulse"
      />
      <line x1="-15" y1="-25" x2="-4" y2="-25" stroke={active ? "#b01e0a" : "#444"} strokeWidth="0.8" />
      <line x1="-19" y1="-21" x2="3" y2="-21" stroke={active ? "#b01e0a" : "#444"} strokeWidth="0.8" />
      <line x1="-19" y1="-17" x2="-8" y2="-17" stroke={active ? "#b01e0a" : "#444"} strokeWidth="0.8" />
      {/* Keyboard Base */}
      <path
        d="M -34,0 L 34,0 L 29,4 L -29,4 Z"
        fill="#1e1e22"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1"
      />
    </g>
  );
}

/* ── GitMesh Daemon Primary Component ───────────────────────────── */
interface DaemonNodeProps {
  x: number;
  y: number;
  active: boolean;
}

function DaemonNode({ x, y, active }: DaemonNodeProps) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle
        cx="0"
        cy="0"
        r="28"
        fill="rgba(4, 4, 4, 0.9)"
        stroke={active ? "#b01e0a" : "rgba(255,255,255,0.08)"}
        strokeWidth="1.5"
        className="transition-colors duration-300"
        style={{
          filter: active ? "drop-shadow(0 0 6px rgba(176, 30, 10, 0.35))" : "none"
        }}
      />
      {/* Custom Git Branch icon */}
      <g stroke="#fafafa" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.85">
        <line x1="-2" y1="-10" x2="-2" y2="10" />
        <circle cx="-2" cy="-10" r="2.5" fill="#fafafa" stroke="none" />
        <circle cx="-2" cy="10" r="2.5" fill="#fafafa" stroke="none" />
        <path d="M -2,1 Q 7,1 7,-4" />
        <circle cx="7" cy="-4" r="2.5" fill="#fafafa" stroke="none" />
      </g>
      {active && (
        <circle
          cx="0"
          cy="0"
          r="34"
          fill="none"
          stroke="#b01e0a"
          strokeWidth="0.8"
          className="animate-ping"
          opacity="0.25"
        />
      )}
    </g>
  );
}

/* ── Consensus Peer Component ──────────────────────────────────── */
interface PeerNodeProps {
  x: number;
  y: number;
  label: string;
  active: boolean;
  lagging?: boolean;
}

function PeerNode({ x, y, label, active, lagging }: PeerNodeProps) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle
        cx="0"
        cy="0"
        r="18"
        fill={lagging ? "rgba(255, 255, 255, 0.01)" : "rgba(4, 4, 4, 0.9)"}
        stroke={lagging ? "rgba(255,255,255,0.04)" : active ? "#b01e0a" : "rgba(255,255,255,0.08)"}
        strokeWidth="1.2"
        className="transition-colors duration-300"
        style={{
          filter: active && !lagging ? "drop-shadow(0 0 5px rgba(176, 30, 10, 0.25))" : "none"
        }}
      />
      {/* Mini server icon details */}
      <g stroke={lagging ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.5)"} strokeWidth="0.8" fill="none" transform="translate(-7, -7)">
        <rect x="0" y="0" width="14" height="4" rx="0.5" />
        <rect x="0" y="5" width="14" height="4" rx="0.5" />
        <rect x="0" y="10" width="14" height="4" rx="0.5" />
        <circle cx="2.5" cy="2" r="0.5" fill={lagging ? "none" : active ? "#22c55e" : "#555"} />
        <circle cx="2.5" cy="7" r="0.5" fill={lagging ? "none" : active ? "#22c55e" : "#555"} />
        <circle cx="2.5" cy="12" r="0.5" fill={lagging ? "none" : active ? "#22c55e" : "#555"} />
      </g>
      {/* Peer details label */}
      <text
        y="26"
        fontSize="7.5"
        fontFamily="var(--font-display)"
        textAnchor="middle"
        fill={lagging ? "var(--color-text-tertiary)" : "var(--color-text-secondary)"}
      >
        {label}
      </text>
    </g>
  );
}

/* ── Main Consensus Animation Component ───────────────────────── */
export default function InteractiveDiagram() {
  const [phase, setPhase] = useState(0);
  const [typedText, setTypedText] = useState("");

  // Raft cycle state loop
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const runLoop = (currentPhase: number) => {
      setPhase(currentPhase);

      let delay = 1500;
      switch (currentPhase) {
        case 0: delay = 1000; break; // Reset & Idle state
        case 1: delay = 1800; break; // Blinking cursor and typing
        case 2: delay = 1200; break; // Red proposal shoots from client to daemon
        case 3: delay = 1000; break; // Appending uncommitted log
        case 4: delay = 1200; break; // Broadcasting proposal to Peer consensus group
        case 5: delay = 1800; break; // Replicating & receiving responses (Peer 1 & 2 ack, 3 lags)
        case 6: delay = 1500; break; // Committing index locally (Daemon Git ODB flashes green)
        case 7: delay = 1000; break; // Green client response packet
        case 8: delay = 3500; break; // Success logs shown, Peer 3 catches up, loop pause
      }

      timeoutId = setTimeout(() => {
        runLoop((currentPhase + 1) % 9);
      }, delay);
    };

    runLoop(0);
    return () => clearTimeout(timeoutId);
  }, []);

  // Handle terminal push typing simulation
  useEffect(() => {
    if (phase === 0) {
      setTypedText("");
    } else if (phase === 1) {
      const fullCommand = "git push origin main";
      let cursor = 0;
      setTypedText("");

      const typingInterval = setInterval(() => {
        setTypedText(fullCommand.slice(0, cursor + 1));
        cursor++;
        if (cursor >= fullCommand.length) {
          clearInterval(typingInterval);
        }
      }, 70);

      return () => clearInterval(typingInterval);
    }
  }, [phase]);

  // Terminal logging content dispatcher
  const getTerminalContent = () => {
    if (phase === 0) return ["> "];
    if (phase === 1) return [`> ${typedText}`];
    if (phase >= 2 && phase <= 6) return ["> git push origin main"];
    if (phase === 7) {
      return [
        "> git push origin main",
        "Writing objects: 100% (3/3), done."
      ];
    }
    if (phase === 8) {
      return [
        "> git push origin main",
        "Writing objects: 100% (3/3), done.",
        "To gitmesh://network/repo.git",
        "   a1b2c3d..e5f6g7h  main -> main"
      ];
    }
    return ["> "];
  };

  // Raft daemon label status text
  const getDaemonStatus = () => {
    switch (phase) {
      case 0: return "System Idle";
      case 1: return "Client push active";
      case 2: return "Receiving push request...";
      case 3: return "Appending transaction log index 103...";
      case 4: return "Broadcasting log to consensus group...";
      case 5: return "Replicating transaction (2/3 Acks)";
      case 6: return "Quorum reached. Committing index 103.";
      case 7: return "Returning client response acknowledgement...";
      case 8: return "Log committed. All peers synchronized.";
      default: return "GitMesh Daemon";
    }
  };

  return (
    <div className={styles.wrapper}>
      {/* Outer Bezel / Glass Frame */}
      <div className={styles.bezelOuter}>
        <div className={styles.bezelInner}>
          
          {/* Browser Top Chrome */}
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
              <span className={styles.url}>gitmesh.dev/consensus</span>
            </div>
            <div className={styles.chromeSpacer}>
              <span className={styles.titleText}>Consensus Engine: Raft Replication</span>
            </div>
          </div>

          {/* SVG Consensus Engine Flow Diagram */}
          <div className={styles.gifWrapper}>
            <svg className={styles.svgDiagram} viewBox="0 0 800 420">
              
              {/* ── CONNECTION LINES (STATIC UNDERLAYS) ───────────────── */}
              {/* Client -> Daemon */}
              <path d="M 170 155 Q 260 155 320 180" className={styles.lineLeft} />
              
              {/* Daemon -> Peers */}
              <path d="M 390 180 Q 500 135 590 100" className={styles.lineRight} />
              <path d="M 390 180 L 590 200" className={styles.lineRight} />
              <path d="M 390 180 Q 500 245 590 300" className={styles.lineRight} />

              {/* Peer -> Database line connection */}
              <line x1="650" y1="100" x2="696" y2="100" className={styles.lineLeft} />
              <line x1="650" y1="200" x2="696" y2="200" className={styles.lineLeft} />
              <line x1="650" y1="300" x2="696" y2="300" className={styles.lineLeft} />

              {/* ── ANIMATED LASER PACKETS (PHASE SPECIFIC) ──────────── */}
              {/* Proposal send to primary (Red packet) */}
              {phase === 2 && (
                <path d="M 170 155 Q 260 155 320 180" className={styles.laserRed} />
              )}

              {/* Proposal broadcast to group peers (Red packets) */}
              {phase === 4 && (
                <>
                  <path d="M 390 180 Q 500 135 590 100" className={styles.laserRed} />
                  <path d="M 390 180 L 590 200" className={styles.laserRed} />
                  {/* Peer 3 shows slower/lagging dotted path animation */}
                  <path d="M 390 180 Q 500 245 590 300" className={styles.laserRedLag} />
                </>
              )}

              {/* Replications responses returning from Peer 1 & 2 (Green packets) */}
              {phase === 5 && (
                <>
                  <path d="M 590 100 Q 500 135 390 180" className={styles.laserGreen} />
                  <path d="M 590 200 L 390 180" className={styles.laserGreen} />
                </>
              )}

              {/* Client write acknowledgment response (Green packet) */}
              {phase === 7 && (
                <path d="M 320 180 Q 260 155 170 155" className={styles.laserGreen} />
              )}

              {/* Peer 3 catch-up synchronization packet (Late replication red packet) */}
              {phase === 8 && (
                <path d="M 390 180 Q 500 245 590 300" className={styles.laserRed} />
              )}


              {/* ── CLIENT SIDE DEV WORKSTATION ──────────────────────── */}
              <LaptopIcon x={110} y={150} active={phase >= 1 && phase <= 8} />
              <text x={110} y={115} fontSize="9.5" textAnchor="middle" fill="#fff" className="font-display font-medium">
                Developer (Local)
              </text>
              
              {/* Terminal Screen Console */}
              <g transform="translate(40, 185)">
                {/* Console box container */}
                <rect x="0" y="0" width="140" height="75" rx="6" fill="#040404" stroke="rgba(255,255,255,0.06)" />
                <rect x="0" y="0" width="140" height="14" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.04)" />
                
                {/* Dots */}
                <circle cx="6" cy="7" r="1.5" fill="#ff5f57" />
                <circle cx="12" cy="7" r="1.5" fill="#febc2e" />
                <circle cx="18" cy="7" r="1.5" fill="#28c840" />

                {/* Console title */}
                <text x="134" y="9.5" fontSize="5.5" fill="var(--color-text-tertiary)" fontFamily="monospace" textAnchor="end">
                  bash
                </text>

                {/* Console output display lines */}
                {getTerminalContent().map((line, i) => (
                  <text
                    key={i}
                    x="8"
                    y={26 + i * 11}
                    fontFamily="monospace"
                    fontSize="6.8"
                    fill={i === 0 ? "var(--color-text)" : "var(--color-text-secondary)"}
                  >
                    {line}
                    {i === getTerminalContent().length - 1 && (phase === 0 || phase === 1) && (
                      <tspan className="animate-pulse" fill="#b01e0a">_</tspan>
                    )}
                  </text>
                ))}
              </g>

              {/* ── GITMESH DAEMON (PRIMARY CORE) ───────────────────── */}
              <g transform="translate(0, 10)">
                <DaemonNode x={360} y={180} active={phase >= 2 && phase <= 8} />
                <text x={360} y={142} fontSize="9.5" textAnchor="middle" fill="#fff" className="font-display font-medium">
                  GitMesh Daemon
                </text>
                
                {/* Local storage cylinder */}
                <StorageCylinder x={360} y={242} active={phase >= 6 && phase <= 8} />

                {/* Daemon Status display text */}
                <text
                  x={360}
                  y={300}
                  fontSize="7.5"
                  fontFamily="monospace"
                  textAnchor="middle"
                  fill={phase >= 2 ? "var(--color-text)" : "var(--color-text-tertiary)"}
                  className="font-medium"
                >
                  {getDaemonStatus()}
                </text>
              </g>

              {/* ── REPLICATED RAFT LOG INDEXES ──────────────────────── */}
              <g transform="translate(250, 360)">
                {/* Background outline */}
                <rect x="-8" y="-12" width="236" height="42" rx="6" fill="rgba(255,255,255,0.01)" stroke="rgba(255,255,255,0.03)" />
                <text x="110" y="44" fontSize="7.5" fontFamily="var(--font-mono)" fill="var(--color-text-tertiary)" textAnchor="middle" letterSpacing="0.04em">
                  Replicated Raft Log
                </text>

                {/* Index 101 */}
                <g transform="translate(10, 0)">
                  <rect x="0" y="-5" width="48" height="24" rx="4" fill="rgba(176, 30, 10, 0.05)" stroke="#b01e0a" strokeWidth="1" />
                  <text x="24" y="7" fontSize="7" fill="#fafafa" fontFamily="monospace" textAnchor="middle">
                    [101]
                  </text>
                  <text x="24" y="15" fontSize="4.5" fill="var(--color-text-secondary)" fontFamily="monospace" textAnchor="middle">
                    commit
                  </text>
                </g>

                {/* Index 102 */}
                <g transform="translate(85, 0)">
                  <rect x="0" y="-5" width="48" height="24" rx="4" fill="rgba(176, 30, 10, 0.05)" stroke="#b01e0a" strokeWidth="1" />
                  <text x="24" y="7" fontSize="7" fill="#fafafa" fontFamily="monospace" textAnchor="middle">
                    [102]
                  </text>
                  <text x="24" y="15" fontSize="4.5" fill="var(--color-text-secondary)" fontFamily="monospace" textAnchor="middle">
                    commit
                  </text>
                </g>

                {/* Index 103 (Proposal / commit state transition) */}
                {phase >= 3 && (
                  <g transform="translate(160, 0)" className="animate-fadeIn">
                    <rect
                      x="0"
                      y="-5"
                      width="48"
                      height="24"
                      rx="4"
                      fill={phase >= 6 ? "rgba(176, 30, 10, 0.05)" : "rgba(245, 158, 11, 0.03)"}
                      stroke={phase >= 6 ? "#b01e0a" : "#f59e0b"}
                      strokeDasharray={phase >= 6 ? "none" : "3,2"}
                      strokeWidth="1"
                      className="transition-all duration-300"
                    />
                    <text
                      x="24"
                      y={phase >= 6 ? 7 : 5}
                      fontSize="7"
                      fill={phase >= 6 ? "#fafafa" : "#fbbf24"}
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      [103]
                    </text>
                    <text
                      x="24"
                      y="15"
                      fontSize="4.5"
                      fill={phase >= 6 ? "var(--color-text-secondary)" : "#fbbf24"}
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {phase >= 6 ? "commit" : "pending"}
                    </text>
                  </g>
                )}
              </g>

              {/* ── CONSENSUS GROUP PEER WORKERS ─────────────────────── */}
              {/* Peer 1 */}
              <g>
                <PeerNode x={620} y={100} label="Peer 1 (Follower)" active={phase >= 4 && phase <= 8} />
                <StorageCylinder x={710} y={100} active={phase >= 5 && phase <= 8} />
              </g>

              {/* Peer 2 */}
              <g>
                <PeerNode x={620} y={200} label="Peer 2 (Follower)" active={phase >= 4 && phase <= 8} />
                <StorageCylinder x={710} y={200} active={phase >= 5 && phase <= 8} />
              </g>

              {/* Peer 3 (Lagging peer - catches up in Phase 8) */}
              <g>
                <PeerNode
                  x={620}
                  y={300}
                  label="Peer 3 (Follower)"
                  active={phase === 8}
                  lagging={phase !== 8}
                />
                <StorageCylinder x={710} y={300} active={phase === 8} />
              </g>

            </svg>
          </div>
        </div>
      </div>
      {/* Visual Ambient reflection */}
      <div className={styles.reflection} />
    </div>
  );
}
