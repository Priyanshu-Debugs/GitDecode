"use client";

import { useState } from "react";
import styles from "./InteractiveDiagram.module.css";

interface Node {
  id: string;
  label: string;
  type: "file" | "service" | "agent" | "db";
  desc: string;
  connections: string[]; // downstream connections
}

const NODES: Node[] = [
  {
    id: "main",
    label: "main.py",
    type: "file",
    desc: "App entry point. Configures lifespan, loads configuration, and runs initial service handshakes.",
    connections: ["repos", "chat"],
  },
  {
    id: "repos",
    label: "routes/repos.py",
    type: "file",
    desc: "FastAPI router endpoints. Validates ingestion payload schemas and schedules repository syncing.",
    connections: ["ingestion", "github"],
  },
  {
    id: "chat",
    label: "routes/chat.py",
    type: "file",
    desc: "Exposes socket/REST channels connecting the user frontend to the code reasoning graph.",
    connections: ["graph"],
  },
  {
    id: "ingestion",
    label: "services/ingestion.py",
    type: "service",
    desc: "Parses Python/JS codebases via AST tree-sitter, mapping modules and logic to Neo4j nodes.",
    connections: ["neo4j", "postgres"],
  },
  {
    id: "github",
    label: "services/github.py",
    type: "service",
    desc: "Performs remote clones and repository extraction workflows using standard Git handles.",
    connections: [],
  },
  {
    id: "graph",
    label: "agents/graph.py",
    type: "agent",
    desc: "LangGraph engine routing codebase queries to specialized research nodes.",
    connections: ["visualizer", "code_qa"],
  },
  {
    id: "neo4j",
    label: "db/neo4j_client.py",
    type: "db",
    desc: "Neo4j AuraDB client mapping dependencies, module calls, and structural imports.",
    connections: [],
  },
  {
    id: "postgres",
    label: "db/pg_client.py",
    type: "db",
    desc: "Postgres driver containing local embeddings, user indices, and indexing results.",
    connections: [],
  },
  {
    id: "visualizer",
    label: "nodes/visualizer.py",
    type: "agent",
    desc: "Supervisor node converting Neo4j relations into high-contrast structural diagrams.",
    connections: [],
  },
  {
    id: "code_qa",
    label: "nodes/code_qa.py",
    type: "agent",
    desc: "RAG solver fetching vector context to deliver factual lines citations and files summaries.",
    connections: [],
  },
];

export default function InteractiveDiagram() {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const isHighlighted = (nodeId: string) => {
    if (!hoveredNode) return false;
    if (hoveredNode === nodeId) return true;
    const hovered = NODES.find((n) => n.id === hoveredNode);
    if (hovered?.connections.includes(nodeId)) return true;

    // Check upstream highlighting
    if (NODES.find((n) => n.id === hoveredNode)?.connections.some(conn => {
      const cNode = NODES.find(cn => cn.id === conn);
      return cNode?.connections.includes(nodeId);
    })) {
      return true;
    }
    return false;
  };

  const getActiveDesc = () => {
    const node = NODES.find((n) => n.id === (hoveredNode || "main"));
    return node ? { label: node.label, type: node.type, desc: node.desc } : null;
  };

  const active = getActiveDesc();

  // Helper to check connection path active states
  const isPathActive = (fromNode: string, toNode: string) => {
    if (!hoveredNode) return false;
    if (hoveredNode === fromNode && isHighlighted(toNode)) return true;
    if (isHighlighted(fromNode) && isHighlighted(toNode) && hoveredNode !== toNode) return true;
    return false;
  };

  return (
    <div className={styles.diagramContainer}>
      <div className={styles.svgWrapper}>
        <svg className={styles.diagramSvg} viewBox="0 0 800 420" fill="none">
          {/* Connection Lines (Background Paths) */}
          <path d="M 400 40 L 250 140" className={`${styles.path} ${isPathActive("main", "repos") ? styles.pathActive : ""}`} />
          <path d="M 400 40 L 550 140" className={`${styles.path} ${isPathActive("main", "chat") ? styles.pathActive : ""}`} />
          
          <path d="M 250 140 L 150 240" className={`${styles.path} ${isPathActive("repos", "ingestion") ? styles.pathActive : ""}`} />
          <path d="M 250 140 L 350 240" className={`${styles.path} ${isPathActive("repos", "github") ? styles.pathActive : ""}`} />
          <path d="M 550 140 L 550 240" className={`${styles.path} ${isPathActive("chat", "graph") ? styles.pathActive : ""}`} />
          
          <path d="M 150 240 L 110 340" className={`${styles.path} ${isPathActive("ingestion", "neo4j") ? styles.pathActive : ""}`} />
          <path d="M 150 240 L 300 340" className={`${styles.path} ${isPathActive("ingestion", "postgres") ? styles.pathActive : ""}`} />
          <path d="M 550 240 L 490 340" className={`${styles.path} ${isPathActive("graph", "visualizer") ? styles.pathActive : ""}`} />
          <path d="M 550 240 L 680 340" className={`${styles.path} ${isPathActive("graph", "code_qa") ? styles.pathActive : ""}`} />

          {/* HTML foreignObject Nodes (Foreground Cards) */}
          {/* Row 1 */}
          <foreignObject x="325" y="21" width="150" height="38">
            <NodeCard id="main" label="main.py" type="file" hoveredNode={hoveredNode} setHoveredNode={setHoveredNode} isHighlighted={isHighlighted} />
          </foreignObject>

          {/* Row 2 */}
          <foreignObject x="175" y="121" width="150" height="38">
            <NodeCard id="repos" label="routes/repos.py" type="file" hoveredNode={hoveredNode} setHoveredNode={setHoveredNode} isHighlighted={isHighlighted} />
          </foreignObject>
          <foreignObject x="475" y="121" width="150" height="38">
            <NodeCard id="chat" label="routes/chat.py" type="file" hoveredNode={hoveredNode} setHoveredNode={setHoveredNode} isHighlighted={isHighlighted} />
          </foreignObject>

          {/* Row 3 */}
          <foreignObject x="75" y="221" width="150" height="38">
            <NodeCard id="ingestion" label="services/ingestion.py" type="service" hoveredNode={hoveredNode} setHoveredNode={setHoveredNode} isHighlighted={isHighlighted} />
          </foreignObject>
          <foreignObject x="275" y="221" width="150" height="38">
            <NodeCard id="github" label="services/github.py" type="service" hoveredNode={hoveredNode} setHoveredNode={setHoveredNode} isHighlighted={isHighlighted} />
          </foreignObject>
          <foreignObject x="475" y="221" width="150" height="38">
            <NodeCard id="graph" label="agents/graph.py" type="agent" hoveredNode={hoveredNode} setHoveredNode={setHoveredNode} isHighlighted={isHighlighted} />
          </foreignObject>

          {/* Row 4 */}
          <foreignObject x="35" y="321" width="150" height="38">
            <NodeCard id="neo4j" label="db/neo4j_client.py" type="db" hoveredNode={hoveredNode} setHoveredNode={setHoveredNode} isHighlighted={isHighlighted} />
          </foreignObject>
          <foreignObject x="225" y="321" width="150" height="38">
            <NodeCard id="postgres" label="db/pg_client.py" type="db" hoveredNode={hoveredNode} setHoveredNode={setHoveredNode} isHighlighted={isHighlighted} />
          </foreignObject>
          <foreignObject x="415" y="321" width="150" height="38">
            <NodeCard id="visualizer" label="nodes/visualizer.py" type="agent" hoveredNode={hoveredNode} setHoveredNode={setHoveredNode} isHighlighted={isHighlighted} />
          </foreignObject>
          <foreignObject x="605" y="321" width="150" height="38">
            <NodeCard id="code_qa" label="nodes/code_qa.py" type="agent" hoveredNode={hoveredNode} setHoveredNode={setHoveredNode} isHighlighted={isHighlighted} />
          </foreignObject>
        </svg>
      </div>

      {/* Info Tooltip Card */}
      {active && (
        <div className={styles.infoCard}>
          <div className={styles.infoHead}>
            <span className={styles.infoLabel}>{active.label}</span>
            <span className={`${styles.badge} ${styles[active.type]}`}>{active.type}</span>
          </div>
          <p className={styles.infoDesc}>{active.desc}</p>
        </div>
      )}
    </div>
  );
}

interface NodeCardProps {
  id: string;
  label: string;
  type: string;
  hoveredNode: string | null;
  setHoveredNode: (id: string | null) => void;
  isHighlighted: (id: string) => boolean;
}

function NodeCard({
  id,
  label,
  type,
  hoveredNode,
  setHoveredNode,
  isHighlighted,
}: NodeCardProps) {
  const isSelfHovered = hoveredNode === id;
  const isLit = isSelfHovered || isHighlighted(id);

  return (
    <div
      className={`${styles.nodeCard} ${isSelfHovered ? styles.hovered : ""} ${
        isLit ? styles.highlighted : ""
      }`}
      onMouseEnter={() => setHoveredNode(id)}
      onMouseLeave={() => setHoveredNode(null)}
    >
      <div className={styles.cardIndicator} />
      <span className={styles.cardLabel}>{label}</span>
    </div>
  );
}
