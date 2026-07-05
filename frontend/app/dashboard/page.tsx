"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/app/lib/useAuth";
import {
  listRepos,
  syncRepo,
  deleteRepo,
  getDependencyGraph,
  getCallGraph,
  getClassGraph,
  getRepoSummary,
  getBlastRadius,
  getRepoDiagrams,
  sendChatMessage,
  getChatHistory,
  listChatSessions,
  type RepoItem,
  type DependencyGraph,
  type ChatMessage,
  type RepoDiagrams,
} from "@/app/lib/api";
import styles from "./dashboard.module.css";

/* ── Inline SVG Icons ────────────────────────────────────────────────── */
function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

/* ── Client Dynamic Mermaid Renderer with Pan & Zoom ─────────────────── */
function MermaidDiagram({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!chart || typeof window === "undefined") return;

    let isMounted = true;
    setError("");
    setZoom(1);
    setPan({ x: 0, y: 0 });

    async function renderChart() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "loose",
        });

        const id = `mermaid-${Math.floor(Math.random() * 100000)}`;
        const { svg: renderedSvg } = await mermaid.render(id, chart);
        
        if (isMounted) {
          setSvg(renderedSvg);
        }
      } catch (err) {
        console.error("Mermaid render error:", err);
        if (isMounted) {
          setError("Failed to parse visual model format.");
        }
      }
    }

    renderChart();
    return () => {
      isMounted = false;
    };
  }, [chart]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = 1.1;
    if (e.deltaY < 0) {
      setZoom(prev => Math.min(3, prev * factor));
    } else {
      setZoom(prev => Math.max(0.3, prev / factor));
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  if (error) {
    return (
      <div style={{ color: "var(--color-danger)", fontSize: "0.75rem", fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap", width: "100%", height: "100%", padding: 24, overflow: "auto" }}>
        {error}
        <pre style={{ marginTop: 8, fontSize: "0.6875rem", opacity: 0.7 }}>{chart}</pre>
      </div>
    );
  }

  if (!svg) {
    return <div className={styles.loadingSpinner} style={{ width: 16, height: 16 }} />;
  }

  return (
    <div
      style={{
        width: "100%",
        height: "550px", // Larger size!
        position: "relative",
        overflow: "hidden",
        border: "0.5px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        background: "rgba(0,0,0,0.2)",
        cursor: isPanning ? "grabbing" : "grab"
      }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        ref={ref}
        dangerouslySetInnerHTML={{ __html: svg }}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "center center",
          width: "100%",
          height: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center"
        }}
      />
    </div>
  );
}

/* ── Force Layout Math Engine ────────────────────────────────────────── */
interface LayoutNode {
  id: string;
  label: string;
  type?: string;
  file_path?: string;
  language?: string | null;
  size_bytes?: number | null;
  x: number;
  y: number;
}

function computeSpringLayout(nodes: any[], edges: any[]): LayoutNode[] {
  if (!nodes || nodes.length === 0) return [];
  
  let layoutNodes: LayoutNode[] = nodes.map((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2;
    return {
      ...n,
      x: Math.cos(angle) * 150 + 350,
      y: Math.sin(angle) * 150 + 250,
    };
  });

  const k = 100; // Optimal node spacing
  const repulsion = 10000;
  const attraction = 0.08;

  for (let step = 0; step < 50; step++) {
    // 1. Nodes repelling each other
    for (let i = 0; i < layoutNodes.length; i++) {
      let fx = 0;
      let fy = 0;
      for (let j = 0; j < layoutNodes.length; j++) {
        if (i === j) continue;
        const dx = layoutNodes[i].x - layoutNodes[j].x;
        const dy = layoutNodes[i].y - layoutNodes[j].y;
        const distSq = dx * dx + dy * dy || 1;
        const dist = Math.sqrt(distSq);
        if (dist < 150) {
          const force = repulsion / distSq;
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        }
      }
      layoutNodes[i].x += fx * 0.1;
      layoutNodes[i].y += fy * 0.1;
    }

    // 2. Nodes attracted along relationships
    for (let edge of edges) {
      const s = layoutNodes.find((n) => n.id === edge.source);
      const t = layoutNodes.find((n) => n.id === edge.target);
      if (s && t) {
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = attraction * (dist - k);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        s.x += fx;
        s.y += fy;
        t.x -= fx;
        t.y -= fy;
      }
    }

    // 3. Keep layout bounded and pull towards center (gravity)
    for (let i = 0; i < layoutNodes.length; i++) {
      const dx = 350 - layoutNodes[i].x;
      const dy = 250 - layoutNodes[i].y;
      layoutNodes[i].x += dx * 0.03;
      layoutNodes[i].y += dy * 0.03;

      layoutNodes[i].x = Math.max(40, Math.min(660, layoutNodes[i].x));
      layoutNodes[i].y = Math.max(40, Math.min(460, layoutNodes[i].y));
    }
  }

  return layoutNodes;
}

/* ═════════════════════════════════════════════════════════════════════
   Dashboard Content Components (Nested under Suspense)
   ═════════════════════════════════════════════════════════════════════ */
function DashboardContent() {
  const { user } = useAuth(true);

  // Read Selection from URL params
  const searchParams = useSearchParams();
  const activeRepoId = searchParams.get("repo_id");

  // States
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // Left explorer panel width (%)
  const [leftWidth, setLeftWidth] = useState(50);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);

  // Graphs states
  const [activeGraphTab, setActiveGraphTab] = useState<"dep" | "call" | "class" | "diagrams" | "metrics">("dep");
  const [graphData, setGraphData] = useState<DependencyGraph | null>(null);
  const [layoutNodes, setLayoutNodes] = useState<LayoutNode[]>([]);
  const [hoveredNode, setHoveredNode] = useState<LayoutNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [graphZoom, setGraphZoom] = useState(1);
  const [graphPan, setGraphPan] = useState({ x: 0, y: 0 });

  // Interactive node dragging
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Blast Radius interactive highlighting
  const [blastRadiusFiles, setBlastRadiusFiles] = useState<string[]>([]);
  const [activeBlastFilePath, setActiveBlastFilePath] = useState<string | null>(null);
  const [blastRadiusLoading, setBlastRadiusLoading] = useState(false);

  // Summary & Diagrams Metrics
  const [summaryData, setSummaryData] = useState<any | null>(null);
  const [diagrams, setDiagrams] = useState<RepoDiagrams | null>(null);
  const [diagramsLoading, setDiagramsLoading] = useState(false);
  const [activeDiagramSubTab, setActiveDiagramSubTab] = useState<"arch" | "flow" | "data">("arch");

  // Chat states
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<any | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Resizer mouse handlers ──────────────────────────────────────────

  const startDragLeft = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingLeft(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingLeft) {
        const sidebar = document.querySelector("aside");
        const sidebarWidth = sidebar ? sidebar.getBoundingClientRect().width : 260;
        const remainingWidth = window.innerWidth - sidebarWidth;
        const relativeX = e.clientX - sidebarWidth;
        const pct = (relativeX / remainingWidth) * 100;
        setLeftWidth(Math.max(20, Math.min(80, pct)));
      }
    };

    const handleMouseUp = () => {
      setIsDraggingLeft(false);
    };

    if (isDraggingLeft) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingLeft]);

  // ── Database & State Queries ─────────────────────────────────────────

  const fetchRepos = useCallback(async () => {
    try {
      const data = await listRepos();
      setRepos(data);
    } catch {
      setRepos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  // Sync polling
  useEffect(() => {
    const hasProcessing = repos.some((r) => r.status === "queued" || r.status === "processing");
    if (!hasProcessing) return;

    const interval = setInterval(fetchRepos, 4000);
    return () => clearInterval(interval);
  }, [repos, fetchRepos]);

  // Fetch graph details when active repository or tab changes
  useEffect(() => {
    if (!activeRepoId) {
      setGraphData(null);
      setLayoutNodes([]);
      setSummaryData(null);
      return;
    }

    const activeRepo = repos.find(r => r.id === activeRepoId);
    if (activeRepo?.status !== "completed") {
      setGraphData(null);
      setLayoutNodes([]);
      setSummaryData(null);
      return;
    }

    // Load Summary stats
    getRepoSummary(activeRepoId).then(setSummaryData).catch(() => {});

    // Clear blast radius active scans
    setBlastRadiusFiles([]);
    setActiveBlastFilePath(null);

    // Load Graphs
    if (activeGraphTab === "dep") {
      getDependencyGraph(activeRepoId)
        .then((data) => {
          setGraphData(data);
          setLayoutNodes(computeSpringLayout(data.nodes, data.edges));
        })
        .catch(() => {});
    } else if (activeGraphTab === "call") {
      getCallGraph(activeRepoId)
        .then((data) => {
          setGraphData(data);
          setLayoutNodes(computeSpringLayout(data.nodes, data.edges));
        })
        .catch(() => {});
    } else if (activeGraphTab === "class") {
      getClassGraph(activeRepoId)
        .then((data) => {
          setGraphData(data);
          setLayoutNodes(computeSpringLayout(data.nodes, data.edges));
        })
        .catch(() => {});
    }
    
    // Zoom/Pan reset
    setGraphZoom(1);
    setGraphPan({ x: 0, y: 0 });
    setHoveredNode(null);
  }, [activeRepoId, activeGraphTab, repos]);

  // Fetch Diagrams
  useEffect(() => {
    if (!activeRepoId || activeGraphTab !== "diagrams") {
      setDiagrams(null);
      return;
    }

    setDiagramsLoading(true);
    getRepoDiagrams(activeRepoId)
      .then((data) => {
        setDiagrams(data);
      })
      .catch((err) => {
        console.error("Error loading diagrams:", err);
        setDiagrams(null);
      })
      .finally(() => {
        setDiagramsLoading(false);
      });
  }, [activeRepoId, activeGraphTab]);

  // Load chat histories
  useEffect(() => {
    if (!activeRepoId) {
      setMessages([]);
      setChatSessionId(null);
      return;
    }
    listChatSessions(activeRepoId)
      .then((sessions) => {
        if (sessions.length > 0) {
          const sid = sessions[0].session_id;
          setChatSessionId(sid);
          getChatHistory(sid, activeRepoId).then((history) => {
            setMessages(history.messages);
          });
        } else {
          setMessages([]);
          setChatSessionId(null);
        }
      })
      .catch(() => {
        setMessages([]);
        setChatSessionId(null);
      });
  }, [activeRepoId]);

  // Scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── SVG Interactive Mouse Events ─────────────────────────────────────

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    let nextZoom = graphZoom;
    if (e.deltaY < 0) {
      nextZoom = Math.min(3, graphZoom * zoomFactor);
    } else {
      nextZoom = Math.max(0.3, graphZoom / zoomFactor);
    }
    setGraphZoom(nextZoom);
  };

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setDraggedNodeId(nodeId);
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (draggedNodeId) {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const svgX = (mouseX - graphPan.x) / graphZoom;
      const svgY = (mouseY - graphPan.y) / graphZoom;

      setLayoutNodes(prev =>
        prev.map(n => (n.id === draggedNodeId ? { ...n, x: svgX, y: svgY } : n))
      );
    } else if (isPanning) {
      setGraphPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  };

  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as HTMLElement).tagName === "circle" || (e.target as HTMLElement).tagName === "text") return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - graphPan.x, y: e.clientY - graphPan.y });
  };

  const handleSvgMouseUp = () => {
    setDraggedNodeId(null);
    setIsPanning(false);
  };

  // Node click triggers Blast Radius
  const handleNodeClick = async (node: LayoutNode) => {
    if (!node.file_path || !activeRepoId) return;

    setBlastRadiusLoading(true);
    setActiveBlastFilePath(node.file_path);
    try {
      const res = await getBlastRadius(activeRepoId, node.file_path);
      setBlastRadiusFiles(res.affected_files || []);
    } catch (err) {
      console.error("Error loading blast radius:", err);
      setBlastRadiusFiles([]);
    } finally {
      setBlastRadiusLoading(false);
    }
  };

  const clearBlastHighlight = () => {
    setBlastRadiusFiles([]);
    setActiveBlastFilePath(null);
  };

  // ── Chat Actions ─────────────────────────────────────────────────────

  const handleSendChat = async () => {
    if (!chatInput.trim() || chatLoading || !activeRepoId) return;
    const query = chatInput.trim();
    setChatInput("");
    setChatLoading(true);

    const tempMsg: ChatMessage = {
      message_id: `temp-${Date.now()}`,
      session_id: chatSessionId || "",
      role: "user",
      content: query,
      created_at: new Date().toISOString(),
      sources: [],
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const res = await sendChatMessage(activeRepoId, query, chatSessionId || undefined);
      if (!chatSessionId) setChatSessionId(res.session_id);
      setMessages((prev) => [...prev.filter(m => m.message_id !== tempMsg.message_id), res]);
    } catch {
      setMessages((prev) => [
        ...prev.filter(m => m.message_id !== tempMsg.message_id),
        {
          message_id: `err-${Date.now()}`,
          session_id: chatSessionId || "",
          role: "assistant",
          content: "Sorry, I encountered an issue. Please try resubmitting your request.",
          created_at: new Date().toISOString(),
          sources: [],
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const activeRepo = repos.find((r) => r.id === activeRepoId);

  const handleZoom = (factor: number) => {
    setGraphZoom(prev => Math.max(0.3, Math.min(3, prev * factor)));
  };

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingSpinner} />
      </div>
    );
  }

  return (
    <div className={styles.workspace} style={{ cursor: isDraggingLeft && !leftCollapsed && !rightCollapsed ? "col-resize" : "default", position: "relative" }}>
      
      {/* Floating Restore Buttons */}
      {leftCollapsed && (
        <button
          className={styles.restorePanelBtn}
          onClick={() => setLeftCollapsed(false)}
          style={{ position: "absolute", left: 16, top: 16, zIndex: 90 }}
          title="Restore Explorer Panel"
        >
          📁 Restore Explorer
        </button>
      )}

      {rightCollapsed && (
        <button
          className={styles.restorePanelBtn}
          onClick={() => setRightCollapsed(false)}
          style={{ position: "absolute", right: 24, top: 18, zIndex: 90 }}
          title="Restore Chat Panel"
        >
          💬 Restore Chat Q&A
        </button>
      )}

      {/* ═════════════════════════════════════════════════════════════════
         LEFT HALF: Explorer graphs, Diagrams & Insights
         ═════════════════════════════════════════════════════════════════ */}
      <aside
        className={styles.leftPanel}
        style={{
          width: leftCollapsed ? "0%" : rightCollapsed ? "100%" : `${leftWidth}%`,
          display: leftCollapsed ? "none" : "flex",
          flex: "none",
        }}
      >
        <div className={styles.panelHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2 className={styles.panelTitle}>Codebase Explorer</h2>
            {activeRepo?.status === "completed" && (
              <span style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
                {activeGraphTab.toUpperCase()}
              </span>
            )}
          </div>
          {!rightCollapsed && (
            <button
              className={styles.panelHeaderCollapseBtn}
              onClick={() => setLeftCollapsed(true)}
              title="Collapse Explorer Panel"
            >
              ✕
            </button>
          )}
        </div>

        {activeRepo?.status !== "completed" ? (
          <div className={styles.panelBody} style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", color: "var(--color-text-tertiary)" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ marginBottom: 12 }}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
            <p style={{ fontSize: "0.8125rem", maxWidth: 220 }}>
              Select a completed repository from the sidebar to explore its codebase.
            </p>
          </div>
        ) : (
          <>
            {/* Graph Category Toggles */}
            <div className={styles.graphTabs}>
              <button
                className={`${styles.graphTabButton} ${activeGraphTab === "dep" ? styles.graphTabButtonActive : ""}`}
                onClick={() => setActiveGraphTab("dep")}
              >
                Dependencies
              </button>
              <button
                className={`${styles.graphTabButton} ${activeGraphTab === "call" ? styles.graphTabButtonActive : ""}`}
                onClick={() => setActiveGraphTab("call")}
              >
                Call Graph
              </button>
              <button
                className={`${styles.graphTabButton} ${activeGraphTab === "class" ? styles.graphTabButtonActive : ""}`}
                onClick={() => setActiveGraphTab("class")}
              >
                Classes
              </button>
              <button
                className={`${styles.graphTabButton} ${activeGraphTab === "diagrams" ? styles.graphTabButtonActive : ""}`}
                onClick={() => setActiveGraphTab("diagrams")}
              >
                Diagrams
              </button>
              <button
                className={`${styles.graphTabButton} ${activeGraphTab === "metrics" ? styles.graphTabButtonActive : ""}`}
                onClick={() => setActiveGraphTab("metrics")}
              >
                Insights
              </button>
            </div>

            {activeGraphTab !== "metrics" && activeGraphTab !== "diagrams" ? (
              <>
                {/* Search Bar & Active Blast info */}
                <div className={styles.graphSearchWrap} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", width: "100%", gap: 8 }}>
                    <div style={{ position: "relative", flex: 1 }}>
                      <input
                        type="text"
                        className={styles.formInput}
                        placeholder="Search entities/files..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ paddingLeft: 30, fontSize: "0.75rem", height: 32 }}
                      />
                      <div style={{ position: "absolute", left: 10, top: 9, color: "var(--color-text-tertiary)" }}>
                        <SearchIcon />
                      </div>
                    </div>
                    {searchQuery && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setSearchQuery("")}
                        style={{ fontSize: "0.6875rem" }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  
                  {/* Interactive Blast Radius Scan Controls */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "0.5px solid var(--color-border)", paddingTop: 8 }}>
                    <span style={{ fontSize: "0.6875rem", color: "var(--color-text-secondary)" }}>
                      {activeBlastFilePath ? (
                        <span>Blast scan: <code style={{ color: "#ef4444", fontSize: "0.625rem" }}>{activeBlastFilePath.split("/").pop()}</code></span>
                      ) : (
                        <span>Click a node to inspect its Blast Radius</span>
                      )}
                    </span>
                    {activeBlastFilePath && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={clearBlastHighlight}
                        style={{ fontSize: "0.625rem", height: 20, padding: "0 6px" }}
                      >
                        Clear Highlight
                      </button>
                    )}
                  </div>
                </div>

                {/* SVG Visualizer Canvas */}
                <div className={styles.graphCanvasContainer}>
                  {/* Zoom controls */}
                  <div className={styles.graphControls}>
                    <button className={styles.graphControlBtn} onClick={() => handleZoom(1.2)} title="Zoom In">+</button>
                    <button className={styles.graphControlBtn} onClick={() => handleZoom(0.8)} title="Zoom Out">-</button>
                    <button className={styles.graphControlBtn} onClick={() => { setGraphZoom(1); setGraphPan({ x: 0, y: 0 }); }} title="Reset Layout">⟲</button>
                  </div>

                  {/* Active hover info overlays */}
                  {hoveredNode && (
                    <div className={styles.graphNodeHoverInfo}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                        <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-white)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {hoveredNode.label}
                        </span>
                        <span className={styles.repoBranch} style={{ fontSize: "0.625rem", color: "#b01e0a" }}>
                          {hoveredNode.type || "file"}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
                        {hoveredNode.file_path && <div>Path: {hoveredNode.file_path}</div>}
                        {hoveredNode.size_bytes && <div>Size: {(hoveredNode.size_bytes / 1024).toFixed(1)} KB</div>}
                        {hoveredNode.language && <div>Lang: {hoveredNode.language}</div>}
                      </div>
                    </div>
                  )}

                  {/* SVG Nodes and Links Map */}
                  <svg
                    width="100%"
                    height="100%"
                    viewBox="0 0 700 500"
                    onWheel={handleWheel}
                    onMouseMove={handleSvgMouseMove}
                    onMouseDown={handleSvgMouseDown}
                    onMouseUp={handleSvgMouseUp}
                    onMouseLeave={handleSvgMouseUp}
                    style={{ cursor: draggedNodeId ? "grabbing" : isPanning ? "grabbing" : "grab" }}
                  >
                    <g transform={`translate(${graphPan.x}, ${graphPan.y}) scale(${graphZoom})`}>
                      {/* Lines/Edges */}
                      {graphData?.edges.map((edge, i) => {
                        const s = layoutNodes.find(n => n.id === edge.source);
                        const t = layoutNodes.find(n => n.id === edge.target);
                        if (!s || !t) return null;

                        const isHighlighted = searchQuery && (
                          s.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          t.label.toLowerCase().includes(searchQuery.toLowerCase())
                        );

                        const isInBlastEdge = blastRadiusFiles.includes(s.file_path || "") && blastRadiusFiles.includes(t.file_path || "");

                        return (
                          <line
                            key={`edge-${i}`}
                            x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                            stroke={isHighlighted ? "rgba(176, 30, 10, 0.8)" : isInBlastEdge ? "rgba(239, 68, 68, 0.6)" : "rgba(255, 255, 255, 0.04)"}
                            strokeWidth={isHighlighted || isInBlastEdge ? 1.5 : 1}
                          />
                        );
                      })}

                      {/* Node Circles */}
                      {layoutNodes.map((node) => {
                        const isMatchingSearch = searchQuery && node.label.toLowerCase().includes(searchQuery.toLowerCase());
                        const isInBlastRadius = blastRadiusFiles.includes(node.file_path || "") || node.file_path === activeBlastFilePath;

                        const r = node.type === "class" ? 7 : node.type === "function" ? 5 : 6;
                        
                        let fill = node.type === "class" ? "#ffffff" : node.type === "function" ? "#b01e0a" : "rgba(255, 255, 255, 0.3)";
                        if (isInBlastRadius) {
                          fill = node.file_path === activeBlastFilePath ? "#ef4444" : "#f87171";
                        }

                        return (
                          <g
                            key={node.id}
                            transform={`translate(${node.x}, ${node.y})`}
                            onMouseEnter={() => setHoveredNode(node)}
                            onMouseLeave={() => setHoveredNode(null)}
                            onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                            onClick={() => handleNodeClick(node)}
                            style={{ cursor: "pointer" }}
                          >
                            <circle
                              r={r}
                              fill={fill}
                              stroke={isMatchingSearch ? "#b01e0a" : isInBlastRadius ? "#ef4444" : "rgba(0,0,0,0.6)"}
                              strokeWidth={isMatchingSearch || isInBlastRadius ? 3 : 1}
                            />
                            {isMatchingSearch && (
                              <circle
                                r={r + 6}
                                fill="none"
                                stroke="rgba(176, 30, 10, 0.3)"
                                strokeWidth="2"
                                style={{ animation: "pulse 1.5s infinite" }}
                              />
                            )}
                            {isInBlastRadius && (
                              <circle
                                r={r + 8}
                                fill="none"
                                stroke="rgba(239, 68, 68, 0.4)"
                                strokeWidth="2"
                                style={{ animation: "pulse 2.0s infinite" }}
                              />
                            )}
                            {/* Monospace Labels */}
                            <text
                              y={r + 10}
                              textAnchor="middle"
                              fill={isMatchingSearch ? "var(--color-white)" : isInBlastRadius ? "#ef4444" : "var(--color-text-secondary)"}
                              fontSize="7.5"
                              fontFamily="var(--font-mono)"
                              opacity={searchQuery && !isMatchingSearch ? 0.2 : 0.8}
                            >
                              {node.label.split("/").pop()}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  </svg>
                </div>
              </>
            ) : activeGraphTab === "diagrams" ? (
              /* Visual Model Diagrams (Mermaid.js) */
              <div className={styles.panelBody} style={{ padding: 16 }}>
                <div className={styles.diagramTabContainer} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className={`${styles.diagramTabButton} ${activeDiagramSubTab === "arch" ? styles.diagramTabButtonActive : ""}`}
                      onClick={() => setActiveDiagramSubTab("arch")}
                    >
                      Architecture
                    </button>
                    <button
                      className={`${styles.diagramTabButton} ${activeDiagramSubTab === "flow" ? styles.diagramTabButtonActive : ""}`}
                      onClick={() => setActiveDiagramSubTab("flow")}
                    >
                      User Flow
                    </button>
                    <button
                      className={`${styles.diagramTabButton} ${activeDiagramSubTab === "data" ? styles.diagramTabButtonActive : ""}`}
                      onClick={() => setActiveDiagramSubTab("data")}
                    >
                      Data Flow
                    </button>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={async () => {
                      if (!activeRepoId) return;
                      setDiagramsLoading(true);
                      try {
                        const data = await getRepoDiagrams(activeRepoId, true);
                        setDiagrams(data);
                      } catch (err) {
                        console.error("Error regenerating diagrams:", err);
                      } finally {
                        setDiagramsLoading(false);
                      }
                    }}
                    disabled={diagramsLoading}
                    style={{ fontSize: "0.6875rem", height: 26, padding: "0 8px" }}
                  >
                    {diagramsLoading ? "Generating..." : "Regenerate"}
                  </button>
                </div>

                {diagramsLoading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                    <div className={styles.loadingSpinner} />
                  </div>
                ) : diagrams ? (
                  <div style={{ border: "none", background: "transparent", minHeight: "auto", display: "block", width: "100%" }}>
                    {activeDiagramSubTab === "arch" && <MermaidDiagram chart={diagrams.architecture} />}
                    {activeDiagramSubTab === "flow" && <MermaidDiagram chart={diagrams.userFlow} />}
                    {activeDiagramSubTab === "data" && <MermaidDiagram chart={diagrams.dataFlow} />}
                  </div>
                ) : (
                  <div style={{ color: "var(--color-text-tertiary)", fontSize: "0.8125rem", textAlign: "center" }}>
                    No visual models found for this repository.
                  </div>
                )}
              </div>
            ) : (
              /* Repository Insights */
              <div className={styles.panelBody}>
                {summaryData ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                    
                    <div>
                      <div className={styles.rightSectionTitle} style={{ marginBottom: 12 }}>Summary Metrics</div>
                      <div className={styles.statsGrid} style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 0 }}>
                        <div className={styles.statCard} style={{ padding: 12, gap: 4 }}>
                          <span style={{ fontSize: "1.25rem", fontWeight: 600 }}>{summaryData.total_classes || 0}</span>
                          <span style={{ fontSize: "0.625rem", color: "var(--color-text-secondary)" }}>Total Classes</span>
                        </div>
                        <div className={styles.statCard} style={{ padding: 12, gap: 4 }}>
                          <span style={{ fontSize: "1.25rem", fontWeight: 600 }}>{summaryData.total_functions || 0}</span>
                          <span style={{ fontSize: "0.625rem", color: "var(--color-text-secondary)" }}>Functions</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className={styles.rightSectionTitle} style={{ marginBottom: 12 }}>Languages Breakdown</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {summaryData.languages?.map((lang: any, idx: number) => {
                          const name = lang.language || "unknown";
                          const count = lang.count;
                          const total = summaryData.languages.reduce((acc: number, curr: any) => acc + curr.count, 0) || 1;
                          const percent = ((count / total) * 100).toFixed(1);
                          
                          const colors = ["#b01e0a", "#8f1908", "#6e1306", "#4d0d04"];
                          const barColor = colors[idx % colors.length];

                          return (
                            <div key={name} style={{ fontSize: "0.75rem" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text)" }}>{name}</span>
                                <span style={{ color: "var(--color-text-secondary)" }}>{percent}% ({count} files)</span>
                              </div>
                              <div style={{ height: 6, background: "rgba(255,255,255,0.03)", borderRadius: 3, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${percent}%`, background: barColor }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div className={styles.rightSectionTitle} style={{ marginBottom: 12 }}>Source Map Sample</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 150, overflowY: "auto" }}>
                        {summaryData.languages?.[0]?.sample_files?.map((file: string) => (
                          <div key={file} style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "4px 8px", border: "0.5px solid var(--color-border)", borderRadius: "var(--radius-sm)" }}>
                            📄 {file}
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                ) : (
                  <div style={{ color: "var(--color-text-tertiary)", fontSize: "0.8125rem", textAlign: "center" }}>
                    Loading summary insights...
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </aside>

      {/* ── CENTRAL RESIZE DIVIDER ── */}
      {!leftCollapsed && !rightCollapsed && (
        <div
          className={`${styles.resizeDivider} ${isDraggingLeft ? styles.resizeDividerActive : ""}`}
          onMouseDown={startDragLeft}
        />
      )}

      {/* ═════════════════════════════════════════════════════════════════
         RIGHT HALF: Code Q&A Chat Space (Expanded to fill remaining screen)
         ═════════════════════════════════════════════════════════════════ */}
      <main
        className={styles.middlePanel}
        style={{
          width: rightCollapsed ? "0%" : leftCollapsed ? "100%" : `${100 - leftWidth}%`,
          display: rightCollapsed ? "none" : "flex",
          flex: "none",
        }}
      >
        {activeRepo ? (
          <>
            {/* Header */}
            <div className={styles.chatWorkspaceHeader}>
              <div>
                <h1 className={styles.panelTitle} style={{ fontSize: "1rem" }}>
                  {activeRepo.github_url.split("/").pop() || "Repository"}
                </h1>
                <span className={styles.repoBranch} style={{ marginTop: 2 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 2 }}>
                    <line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
                    <path d="M18 9a9 9 0 0 1-9 9" />
                  </svg>
                  {activeRepo.branch}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span className={`${styles.statusBadge} ${
                  activeRepo.status === "completed" ? styles.statusCompleted : styles.statusProcessing
                }`}>
                  <span className={`${styles.statusDot} ${
                    activeRepo.status === "completed" ? styles.statusDotCompleted : styles.statusDotProcessing
                  }`} />
                  {activeRepo.status}
                </span>
                {!leftCollapsed && (
                  <button
                    className={styles.panelHeaderCollapseBtn}
                    onClick={() => setRightCollapsed(true)}
                    title="Collapse Chat Panel"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Conversation list */}
            <div className={styles.chatFeed}>
              {messages.length === 0 && (
                <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
                  <h3 style={{ fontFamily: "var(--font-display)", color: "var(--color-white)", fontSize: "1.1rem", marginBottom: 6 }}>
                    Ask about this codebase
                  </h3>
                  <p style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", maxWidth: 300, lineHeight: 1.5 }}>
                    GitMesh parses files, imports, and methods into Neo4j. Try asking:
                  </p>
                  <div className={styles.chatSuggestions} style={{ justifyContent: "center", maxWidth: 400, marginTop: 12 }}>
                    <button className={styles.chatSuggestionItem} onClick={() => setChatInput("Explain how files import each other in this repo.")}>
                      Explain file imports
                    </button>
                    <button className={styles.chatSuggestionItem} onClick={() => setChatInput("List the primary functions and methods defined.")}>
                      Show functions map
                    </button>
                    <button className={styles.chatSuggestionItem} onClick={() => setChatInput("Which files have class structures?")}>
                      Find classes
                    </button>
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.message_id}
                  className={msg.role === "user" ? styles.chatBubbleUser : styles.chatBubbleAssistant}
                >
                  <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
                  
                  {/* Inline Source Citations */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className={styles.citationsList}>
                      {msg.sources.map((src, i) => {
                        const label = src.file_path.split("/").pop() || "source";
                        const lines = src.start_line ? ` (L${src.start_line}-${src.end_line})` : "";
                        return (
                          <button
                            key={i}
                            className={styles.citationBadge}
                            onClick={() => setSelectedCitation(src)}
                            title={`Inspect ${src.file_path}`}
                          >
                            📄 {label}{lines}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              
              {chatLoading && (
                <div className={styles.chatBubbleAssistant}>
                  <div className={styles.loadingSpinner} style={{ width: 14, height: 14, borderWidth: 1.5 }} />
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Citations Snippet overlay */}
            {selectedCitation && (
              <div className={styles.modalOverlay} onClick={() => setSelectedCitation(null)}>
                <div className={styles.modal} style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div>
                      <h4 style={{ color: "var(--color-white)", fontSize: "0.875rem", fontFamily: "var(--font-mono)" }}>
                        {selectedCitation.file_path}
                      </h4>
                      {selectedCitation.start_line && (
                        <span style={{ fontSize: "0.6875rem", color: "var(--color-text-secondary)" }}>
                          Lines {selectedCitation.start_line} to {selectedCitation.end_line}
                        </span>
                      )}
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setSelectedCitation(null)}>Close</button>
                  </div>
                  {selectedCitation.snippet ? (
                    <pre style={{ background: "rgba(0,0,0,0.3)", padding: 16, border: "0.5px solid var(--color-border)", borderRadius: "var(--radius-md)", overflowX: "auto", fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "#f5f5f5" }}>
                      <code>{selectedCitation.snippet}</code>
                    </pre>
                  ) : (
                    <p style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>No snippet extracted for this citation node.</p>
                  )}
                </div>
              </div>
            )}

            {/* Input Form */}
            <div className={styles.chatInputWrapper}>
              <div className={styles.chatInputBox}>
                <textarea
                  className={styles.chatInputArea}
                  placeholder="Query codebase structures or methods..."
                  rows={1}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendChat();
                    }
                  }}
                  disabled={chatLoading}
                />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSendChat}
                  disabled={chatLoading || !chatInput.trim()}
                  style={{ width: 32, height: 32, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%" }}
                >
                  <SendIcon />
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Empty Workspace Welcome Panel */
          <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "center", alignItems: "center", textAlign: "center", padding: 40, background: "radial-gradient(circle at center, rgba(176,30,10,0.03) 0%, transparent 70%)" }}>
            <div style={{ marginBottom: 24, padding: 24, border: "0.5px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.01)", borderRadius: "50%" }}>
              <div className={styles.statusDotProcessing} style={{ width: 16, height: 16 }} />
            </div>
            <h1 style={{ fontFamily: "var(--font-display)", color: "var(--color-white)", fontSize: "1.75rem", fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 12 }}>
              GitMesh Workspace
            </h1>
            <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", maxWidth: 380, lineHeight: 1.6, fontWeight: 300 }}>
              Construct codebase dependency graphs, traverse function calls, analyze blast radiuses, and ask context-grounded questions about your repositories.
            </p>
            <div style={{ marginTop: 24, padding: "8px 16px", border: "0.5px solid var(--color-border)", borderRadius: "var(--radius-full)", fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--color-text-tertiary)" }}>
              SELECT OR IMPORT A REPOSITORY TO BEGIN
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className={styles.loadingScreen}><div className={styles.loadingSpinner} /></div>}>
      <DashboardContent />
    </Suspense>
  );
}
