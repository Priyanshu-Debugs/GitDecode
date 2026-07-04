"use client";

import { useState, useEffect } from "react";
import styles from "./InteractiveDiagram.module.css";

// Reusable text scramble hook
function useScramble(text: string, trigger: number) {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    let iterations = 0;
    const chars = "01XYZ_@#%&*+=-▒▓░█";
    const duration = 20; // ms per step

    const interval = setInterval(() => {
      setDisplay(
        text
          .split("")
          .map((char, index) => {
            if (char === " ") return " ";
            if (index < iterations) {
              return text[index];
            }
            return chars[Math.floor(Math.random() * chars.length)];
          })
          .join("")
      );

      if (iterations >= text.length) {
        clearInterval(interval);
      }
      iterations += 0.5; // Scramble speeds
    }, duration);

    return () => clearInterval(interval);
  }, [text, trigger]);

  return display;
}

interface Node {
  id: string;
  label: string;
  type: "input" | "output";
  desc: string;
}

const INPUT_NODES: Node[] = [
  {
    id: "github",
    label: "GitHub Connector",
    type: "input",
    desc: "Clones and pulls changes from remote Git repositories asynchronously.",
  },
  {
    id: "parser",
    label: "AST Syntax Parser",
    type: "input",
    desc: "Uses tree-sitter to inspect and map codebase import/class syntax structures.",
  },
  {
    id: "neo4j",
    label: "Neo4j Graph Database",
    type: "input",
    desc: "Stores and structures code relationships (imports, definitions, mappings).",
  },
  {
    id: "postgres",
    label: "Supabase DB & Vectors",
    type: "input",
    desc: "Hosts text embeddings, indices, and project configuration states.",
  },
];

const OUTPUT_NODES: Node[] = [
  {
    id: "dep_map",
    label: "Visual Dependency Map",
    type: "output",
    desc: "Interactive visualizer converting codebase structures into readable layouts.",
  },
  {
    id: "code_qa",
    label: "Factual Code Q&A",
    type: "output",
    desc: "Uses vector lookups and LLMs to answer questions with exact line citations.",
  },
  {
    id: "blast_radius",
    label: "Blast Radius Traversals",
    type: "output",
    desc: "Traces downstream consequences of codebase modifications before they are committed.",
  },
];

export default function InteractiveDiagram() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [pulseTrigger, setPulseTrigger] = useState(0);
  const [coreAnimating, setCoreAnimating] = useState(false);

  // Trigger a central pulse and scrambler refresh every 8 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setPulseTrigger((prev) => prev + 1);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleNodeClick = (id: string) => {
    setSelectedNode((prev) => (prev === id ? null : id));
  };

  const getActiveDesc = () => {
    const all = [...INPUT_NODES, ...OUTPUT_NODES];
    const node = all.find((n) => n.id === selectedNode);
    return node ? { label: node.label, type: node.type, desc: node.desc } : null;
  };

  const active = getActiveDesc();

  // Scrambled names for right outputs
  const titleMap = useScramble("Visual Dependency Map", pulseTrigger);
  const titleQa = useScramble("Factual Code Q&A", pulseTrigger);
  const titleBlast = useScramble("Blast Radius Traversals", pulseTrigger);

  const getScrambledLabel = (id: string, original: string) => {
    if (id === "dep_map") return titleMap;
    if (id === "code_qa") return titleQa;
    if (id === "blast_radius") return titleBlast;
    return original;
  };

  return (
    <div className={styles.diagramContainer}>
      {/* Click empty space to deselect */}
      <div className={styles.svgWrapper} onClick={() => setSelectedNode(null)}>
        <svg className={styles.diagramSvg} viewBox="0 0 860 400" fill="none">
          {/* Defined glow and arrow marker elements */}
          <defs>
            <filter id="glow-red" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* BACKGROUND CONNECTION LINES */}
          {/* Left Inputs -> Center Core Paths (Cubic Bezier Curves) */}
          <path id="path-github" d="M 180 80 C 280 80, 280 200, 380 200" className={styles.lineLeft} />
          <path id="path-parser" d="M 180 160 C 280 160, 280 200, 380 200" className={styles.lineLeft} />
          <path id="path-neo4j" d="M 180 240 C 280 240, 280 200, 380 200" className={styles.lineLeft} />
          <path id="path-postgres" d="M 180 320 C 280 320, 280 200, 380 200" className={styles.lineLeft} />

          {/* Center Core -> Right Outputs Paths */}
          <path id="path-dep" d="M 440 200 C 540 200, 540 100, 670 100" className={styles.lineRight} />
          <path id="path-qa" d="M 440 200 C 540 200, 540 200, 670 200" className={styles.lineRight} />
          <path id="path-blast" d="M 440 200 C 540 200, 540 300, 670 300" className={styles.lineRight} />

          {/* ACTIVE GLOWING PULSE LINES (dash offset animation) */}
          <path d="M 440 200 C 540 200, 540 100, 670 100" className={styles.linePulse} />
          <path d="M 440 200 C 540 200, 540 200, 670 200" className={styles.linePulse} />
          <path d="M 440 200 C 540 200, 540 300, 670 300" className={styles.linePulse} />

          {/* FLOATING BINARY DATA ANIMATION (flowing along Left paths) */}
          <text className={styles.binaryFlow} fill="#b01e0a" fontSize="9" fontFamily="monospace">
            0
            <animateMotion dur="3.5s" repeatCount="indefinite" path="M 180 80 C 280 80, 280 200, 380 200" />
          </text>
          <text className={styles.binaryFlow} fill="#b01e0a" fontSize="9" fontFamily="monospace">
            1
            <animateMotion dur="3.2s" begin="1.2s" repeatCount="indefinite" path="M 180 80 C 280 80, 280 200, 380 200" />
          </text>

          <text className={styles.binaryFlow} fill="#b01e0a" fontSize="9" fontFamily="monospace">
            1
            <animateMotion dur="2.8s" repeatCount="indefinite" path="M 180 160 C 280 160, 280 200, 380 200" />
          </text>
          <text className={styles.binaryFlow} fill="#b01e0a" fontSize="9" fontFamily="monospace">
            0
            <animateMotion dur="2.5s" begin="0.8s" repeatCount="indefinite" path="M 180 160 C 280 160, 280 200, 380 200" />
          </text>

          <text className={styles.binaryFlow} fill="#b01e0a" fontSize="9" fontFamily="monospace">
            0
            <animateMotion dur="3s" repeatCount="indefinite" path="M 180 240 C 280 240, 280 200, 380 200" />
          </text>
          <text className={styles.binaryFlow} fill="#b01e0a" fontSize="9" fontFamily="monospace">
            1
            <animateMotion dur="3.3s" begin="1.5s" repeatCount="indefinite" path="M 180 240 C 280 240, 280 200, 380 200" />
          </text>

          <text className={styles.binaryFlow} fill="#b01e0a" fontSize="9" fontFamily="monospace">
            1
            <animateMotion dur="2.6s" repeatCount="indefinite" path="M 180 320 C 280 320, 280 200, 380 200" />
          </text>
          <text className={styles.binaryFlow} fill="#b01e0a" fontSize="9" fontFamily="monospace">
            0
            <animateMotion dur="3s" begin="0.6s" repeatCount="indefinite" path="M 180 320 C 280 320, 280 200, 380 200" />
          </text>

          {/* CENTRAL CORE PROCESSING NODE (Glowing hexagon brand icon) */}
          <g
            className={`${styles.coreGroup} ${coreAnimating ? styles.coreClickAnimate : ""}`}
            transform="translate(380, 170)"
            onClick={(e) => {
              e.stopPropagation();
              setCoreAnimating(true);
            }}
            onAnimationEnd={() => setCoreAnimating(false)}
          >
            <circle cx="30" cy="30" r="38" className={styles.coreGlow} filter="url(#glow-red)" />
            <path
              d="M 30 10 L 47 20 L 47 40 L 30 50 L 13 40 L 13 20 Z"
              className={styles.pulsingCore}
            />
            {/* Asterisk style inner star */}
            <path
              d="M 30 18 L 30 42 M 18 30 L 42 30 M 21 21 L 39 39 M 21 39 L 39 21"
              stroke="#000000"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <circle
              cx="30"
              cy="30"
              r="34"
              className={styles.rotatingOrbit}
              fill="none"
              stroke="rgba(255, 255, 255, 0.25)"
              strokeWidth="1.5"
              strokeDasharray="8, 12"
            />
          </g>

          {/* LEFT INPUT NODES (foreignObjects) */}
          {INPUT_NODES.map((node, index) => (
            <foreignObject
              key={node.id}
              x="5"
              y={60 + index * 80}
              width="175"
              height="40"
              className={styles.nodeWrapper}
            >
              <div
                className={`${styles.nodeCard} ${styles.inputCard} ${
                  selectedNode === node.id ? styles.cardActive : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleNodeClick(node.id);
                }}
              >
                <div className={styles.bulletIndicator} />
                <span className={styles.cardLabel}>{node.label}</span>
              </div>
            </foreignObject>
          ))}

          {/* RIGHT OUTPUT NODES (foreignObjects) */}
          {OUTPUT_NODES.map((node, index) => (
            <foreignObject
              key={node.id}
              x="670"
              y={80 + index * 100}
              width="185"
              height="40"
              className={styles.nodeWrapper}
            >
              <div
                className={`${styles.nodeCard} ${styles.outputCard} ${
                  selectedNode === node.id ? styles.cardActive : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleNodeClick(node.id);
                }}
              >
                <div className={styles.bulletIndicatorRed} />
                <span className={styles.cardLabel}>
                  {getScrambledLabel(node.id, node.label)}
                </span>
              </div>
            </foreignObject>
          ))}
        </svg>

        {/* Info Overlay — inside svgWrapper for absolute positioning */}
        {active && (
          <div className={styles.infoCard} key={active.label}>
            <div className={styles.infoHead}>
              <span className={styles.infoLabel}>{active.label}</span>
              <span
                className={`${styles.badge} ${
                  active.type === "input" ? styles.badgeInput : styles.badgeOutput
                }`}
              >
                {active.type}
              </span>
            </div>
            <p className={styles.infoDesc}>{active.desc}</p>
          </div>
        )}
      </div>
    </div>
  );
}
