"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { MermaidDiagram } from "@/components/ui/MermaidDiagram";
import { ChatMarkdown } from "@/components/ui/ChatMarkdown";
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
import { AgentBentoGrid } from "@/components/ui/agent-bento-grid";

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

  const width = 700;
  const height = 500;

  // 1. Initialize nodes in a neat grid pattern to start well-distributed
  const cols = Math.ceil(Math.sqrt(nodes.length));
  const rows = Math.ceil(nodes.length / cols);
  
  let layoutNodes: LayoutNode[] = nodes.map((n, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 120 + (col / Math.max(1, cols - 1)) * (width - 240) + (Math.random() - 0.5) * 15;
    const y = 80 + (row / Math.max(1, rows - 1)) * (height - 160) + (Math.random() - 0.5) * 15;
    return {
      ...n,
      x,
      y,
    };
  });

  const k = 100; // Target spacing between connected nodes
  const repulsion = 18000;
  const attraction = 0.08;
  const centerForce = 0.03;

  // 2. Perform 100 iterations of force relaxation in 2D
  for (let step = 0; step < 100; step++) {
    const fx = new Array(layoutNodes.length).fill(0);
    const fy = new Array(layoutNodes.length).fill(0);

    // Node-to-node repulsion (pushes all nodes apart)
    for (let i = 0; i < layoutNodes.length; i++) {
      const u = layoutNodes[i];
      for (let j = i + 1; j < layoutNodes.length; j++) {
        const v = layoutNodes[j];
        const dx = u.x - v.x;
        const dy = u.y - v.y;
        const distSq = dx * dx + dy * dy || 1;
        const dist = Math.sqrt(distSq);
        
        if (dist < 180) {
          const force = repulsion / distSq;
          const xForce = (dx / dist) * force;
          const yForce = (dy / dist) * force;
          
          fx[i] += xForce;
          fy[i] += yForce;
          fx[j] -= xForce;
          fy[j] -= yForce;
        }
      }
    }

    // Edge-based attraction (pulls connected nodes closer)
    edges.forEach(edge => {
      const sIdx = layoutNodes.findIndex(n => n.id === edge.source);
      const tIdx = layoutNodes.findIndex(n => n.id === edge.target);
      if (sIdx !== -1 && tIdx !== -1) {
        const s = layoutNodes[sIdx];
        const t = layoutNodes[tIdx];
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = attraction * (dist - k);
        
        const xForce = (dx / dist) * force;
        const yForce = (dy / dist) * force;

        fx[sIdx] += xForce;
        fy[sIdx] += yForce;
        fx[tIdx] -= xForce;
        fy[tIdx] -= yForce;
      }
    });

    // Apply accumulated forces and pull gently towards screen center (gravity)
    for (let i = 0; i < layoutNodes.length; i++) {
      const node = layoutNodes[i];
      
      const dcx = width / 2 - node.x;
      const dcy = height / 2 - node.y;
      
      node.x += fx[i] + dcx * centerForce;
      node.y += fy[i] + dcy * centerForce;

      // Bound containment padding
      node.x = Math.max(50, Math.min(width - 50, node.x));
      node.y = Math.max(50, Math.min(height - 50, node.y));
    }
  }

  return layoutNodes;
}

const MOCK_REPOS = [
  {
    id: 101,
    name: "gitmesh-runtime",
    description: "Distributed orchestration engine for indexing code ASTs and resolving reference linkages asynchronously using Python and Celery.",
    html_url: "https://github.com/gitmesh/gitmesh-runtime",
    stargazers_count: 142,
    forks_count: 18,
    language: "Python",
    default_branch: "main",
    owner: {
      login: "gitmesh",
      avatar_url: "https://avatars.githubusercontent.com/u/9919?v=4"
    },
    updated_at: "2026-07-05T12:00:00Z"
  },
  {
    id: 102,
    name: "ast-lexer-engine",
    description: "High-performance tree-sitter based lexing backend that tokenizes structures, classes, and scopes for vector indexing.",
    html_url: "https://github.com/gitmesh/ast-lexer-engine",
    stargazers_count: 98,
    forks_count: 12,
    language: "TypeScript",
    default_branch: "main",
    owner: {
      login: "gitmesh",
      avatar_url: "https://avatars.githubusercontent.com/u/9919?v=4"
    },
    updated_at: "2026-07-04T18:30:00Z"
  },
  {
    id: 103,
    name: "neo4j-vector-search",
    description: "Surgical context retrieval service linking code dependency graphs in Neo4j with pgvector-based dense semantic searches.",
    html_url: "https://github.com/gitmesh/neo4j-vector-search",
    stargazers_count: 256,
    forks_count: 34,
    language: "Go",
    default_branch: "main",
    owner: {
      login: "gitmesh",
      avatar_url: "https://avatars.githubusercontent.com/u/9919?v=4"
    },
    updated_at: "2026-07-03T09:15:00Z"
  },
  {
    id: 104,
    name: "gitmesh-web-dashboard",
    description: "Premium Awwwards-tier visual interface for analyzing codebase topologies, user action timelines, and vector queries.",
    html_url: "https://github.com/gitmesh/gitmesh-web-dashboard",
    stargazers_count: 64,
    forks_count: 6,
    language: "TypeScript",
    default_branch: "main",
    owner: {
      login: "gitmesh",
      avatar_url: "https://avatars.githubusercontent.com/u/9919?v=4"
    },
    updated_at: "2026-07-06T05:00:00Z"
  }
];

/* ═════════════════════════════════════════════════════════════════════
   Dashboard Content Components (Nested under Suspense)
   ═════════════════════════════════════════════════════════════════════ */
function DashboardContent() {
  const { user, session } = useAuth(true);
  const router = useRouter();

  // Read Selection from URL params
  const searchParams = useSearchParams();
  const activeRepoId = searchParams.get("repo_id");

  // States
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // GitHub integration & selector states
  const [githubRepos, setGithubRepos] = useState<any[]>([]);
  const [githubLoading, setGithubLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "synced" | "available" | "processing">("all");
  const [selectedRepoForSync, setSelectedRepoForSync] = useState<any | null>(null);
  const [syncBranch, setSyncBranch] = useState("main");
  const [syncError, setSyncError] = useState("");
  const [syncLoading, setSyncLoading] = useState(false);

  // Premium Alert / Confirmation dialog states
  const [customConfirm, setCustomConfirm] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel?: () => void;
  } | null>(null);

  // Left explorer panel width (%)
  const [leftWidth, setLeftWidth] = useState(50);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);

  // Graphs states
  const [activeGraphTab, setActiveGraphTab] = useState<"overview" | "dep" | "call" | "class" | "diagrams" | "metrics">("overview");
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

  // Fetch GitHub Repos
  useEffect(() => {
    if (!user) return;
    const username = user.user_metadata?.preferred_username || user.user_metadata?.user_name;
    if (!username) return;

    async function getGitHub() {
      setGithubLoading(true);
      try {
        const headers: HeadersInit = {};
        if (session?.provider_token) {
          headers["Authorization"] = `token ${session.provider_token}`;
        }
        const res = await fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=100`, { headers });
        if (res.ok) {
          const data = await res.json();
          setGithubRepos(data);
        }
      } catch {
        // ignore
      } finally {
        setGithubLoading(false);
      }
    }
    getGitHub();
  }, [user, session]);

  const handleSyncRepo = async (url: string, branch: string) => {
    setSyncError("");
    setSyncLoading(true);
    try {
      const res = await syncRepo(url.trim(), branch.trim() || "main");
      fetchRepos();
      if (res && res.repo_id) {
        router.push(`/dashboard?repo_id=${res.repo_id}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Sync request failed.";
      setSyncError(errMsg);
      setCustomConfirm({
        isOpen: true,
        title: "Connection Failed",
        message: errMsg,
        confirmText: "Close",
        onConfirm: () => {}
      });
    } finally {
      setSyncLoading(false);
    }
  };

  // Sync polling
  useEffect(() => {
    const hasProcessing = repos.some((r) => r.status === "queued" || r.status === "processing");
    if (!hasProcessing) return;

    const interval = setInterval(fetchRepos, 4000);
    return () => clearInterval(interval);
  }, [repos, fetchRepos]);

  const activeRepoStatus = repos.find(r => r.id === activeRepoId)?.status;

  // Fetch graph details when active repository or tab changes
  useEffect(() => {
    if (!activeRepoId) {
      setGraphData(null);
      setLayoutNodes([]);
      setSummaryData(null);
      return;
    }

    if (activeRepoStatus !== "completed") {
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
  }, [activeRepoId, activeGraphTab, activeRepoStatus]);

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

  const querySessionId = searchParams.get("session_id");

  // Load chat histories
  useEffect(() => {
    if (!activeRepoId) {
      setMessages([]);
      setChatSessionId(null);
      return;
    }
    
    listChatSessions(activeRepoId)
      .then((sessions) => {
        const requestedSessionExists = querySessionId && sessions.some((s) => s.session_id === querySessionId);
        const sid = requestedSessionExists ? querySessionId : (sessions.length > 0 ? sessions[0].session_id : null);
        if (sid) {
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
  }, [activeRepoId, querySessionId]);

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
      setMessages((prev) => [...prev, res]);
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

  const renderCustomConfirm = () => {
    if (!customConfirm || !customConfirm.isOpen) return null;
    return (
      <div className={styles.modalOverlay} onClick={() => {
        if (customConfirm.onCancel) customConfirm.onCancel();
        setCustomConfirm(null);
      }}>
        <div className={styles.confirmModalOuter} onClick={(e) => e.stopPropagation()}>
          <div className={styles.confirmModalInner}>
            <div className={styles.confirmModalHeader}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "#ef4444", marginRight: 8 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <h3 className={styles.confirmModalTitle}>{customConfirm.title}</h3>
            </div>
            
            <p className={styles.confirmModalDesc}>
              {customConfirm.message}
            </p>

            <div className={styles.confirmModalFooter}>
              {customConfirm.cancelText && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    if (customConfirm.onCancel) customConfirm.onCancel();
                    setCustomConfirm(null);
                  }}
                >
                  {customConfirm.cancelText}
                </button>
              )}
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  customConfirm.onConfirm();
                  setCustomConfirm(null);
                }}
              >
                {customConfirm.confirmText || "OK"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Unified Repo Selector Dashboard Renderer ──
  const renderRepoSelectorDashboard = () => {
    const activeSyncsAndCompleted = repos;
    const githubListToUse = githubRepos.length > 0 ? githubRepos : MOCK_REPOS;
    const displayRepos: any[] = [];
    
    // 1. Add all synced repos
    activeSyncsAndCompleted.forEach(sr => {
      const githubMatch = githubListToUse.find(gr => gr.html_url === sr.github_url);
      displayRepos.push({
        id: sr.id,
        name: githubMatch?.name || sr.github_url.split("/").pop() || "repository",
        owner: githubMatch?.owner?.login || sr.github_url.split("/").slice(-2)[0] || "",
        avatar_url: githubMatch?.owner?.avatar_url || null,
        description: githubMatch?.description || (sr.status === "completed" ? "Successfully indexed codebase graph." : "Codebase repository"),
        stargazers_count: githubMatch?.stargazers_count || 0,
        forks_count: githubMatch?.forks_count || 0,
        language: githubMatch?.language || "Markdown",
        github_url: sr.github_url,
        branch: sr.branch,
        status: sr.status,
        detailed_status: sr.detailed_status,
        isSynced: true
      });
    });
    
    // 2. Add GitHub repos that aren't synced yet
    githubListToUse.forEach(gr => {
      const isAlreadySynced = activeSyncsAndCompleted.some(sr => sr.github_url === gr.html_url);
      if (!isAlreadySynced) {
        displayRepos.push({
          id: `github-${gr.id}`,
          name: gr.name,
          owner: gr.owner?.login || "",
          avatar_url: gr.owner?.avatar_url || null,
          description: gr.description || "Public source repository available on GitHub.",
          stargazers_count: gr.stargazers_count || 0,
          forks_count: gr.forks_count || 0,
          language: gr.language || "TypeScript",
          github_url: gr.html_url,
          branch: gr.default_branch || "main",
          status: "not_connected",
          isSynced: false
        });
      }
    });

    // 3. Filter displayRepos based on searchQuery
    const searchedRepos = displayRepos.filter(repo => {
      const matchQuery = repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         repo.owner.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (repo.description && repo.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
                         (repo.language && repo.language.toLowerCase().includes(searchQuery.toLowerCase()));
      
      if (!matchQuery) return false;
      
      if (activeFilter === "synced") {
        return repo.isSynced && repo.status === "completed";
      }
      if (activeFilter === "processing") {
        return repo.isSynced && (repo.status === "processing" || repo.status === "queued");
      }
      if (activeFilter === "available") {
        return !repo.isSynced;
      }
      return true; // "all"
    });

    const getLangColor = (lang: string) => {
      const colors: { [key: string]: string } = {
        TypeScript: "#3178c6",
        JavaScript: "#f1e05a",
        Python: "#3572A5",
        Go: "#00ADD8",
        Rust: "#dea584",
        Java: "#b07219",
        "C++": "#f34b7d",
        HTML: "#e34c26",
        CSS: "#563d7c"
      };
      return colors[lang] || "#888888";
    };

    return (
      <div className={styles.repoDashboardContainer} style={{ padding: "40px 48px", overflowY: "auto", width: "100%", height: "100%", background: "var(--color-bg)", position: "relative" }}>
        {/* Glow Effects in Background */}
        <div style={{ position: "absolute", top: "-10%", left: "30%", width: "400px", height: "400px", background: "radial-gradient(circle, rgba(176, 30, 10, 0.05) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />
        
        {/* Hero Section */}
        <div className={styles.dashboardHero} style={{ zIndex: 1, position: "relative" }}>
          <h1 className={styles.dashboardHeroTitle}>Agent Workspace</h1>
          <p className={styles.dashboardHeroSubtitle}>
            Connect, analyze, and traverse your codebase graphs. Ask context-grounded questions using your workspace repository nodes.
          </p>
        </div>

        {/* Quick Bento Stats Section */}
        <div className={styles.statsRow} style={{ zIndex: 1, position: "relative" }}>
          <div className={styles.dashboardStatCard}>
            <span className={styles.statVal}>{repos.filter(r => r.status === "completed").length}</span>
            <span className={styles.statLabel}>Connected Codebases</span>
          </div>
          <div className={styles.dashboardStatCard}>
            <span className={styles.statVal}>{repos.filter(r => r.status === "processing" || r.status === "queued").length}</span>
            <span className={styles.statLabel}>Ingesting Tasks</span>
          </div>
          <div className={styles.dashboardStatCard}>
            <span className={styles.statVal}>{githubRepos.length || MOCK_REPOS.length}</span>
            <span className={styles.statLabel}>GitHub Repos Available</span>
          </div>
          <div className={styles.dashboardStatCard}>
            <span className={styles.statVal}>
              {repos.filter(r => r.status === "completed").length > 0 ? `${repos.filter(r => r.status === "completed").length * 3 + 2}k Nodes` : "0 Nodes"}
            </span>
            <span className={styles.statLabel}>Total AST Entities</span>
          </div>
        </div>

        {/* Filter and Search controls */}
        <div className={styles.controlsBar} style={{ zIndex: 1, position: "relative" }}>
          <div className={styles.searchContainer}>
            <div className={styles.searchIconWrapper}>
              <SearchIcon />
            </div>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search codebases by name, language..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className={styles.filterTabs}>
            <button
              className={`${styles.filterTabBtn} ${activeFilter === "all" ? styles.filterTabBtnActive : ""}`}
              onClick={() => setActiveFilter("all")}
            >
              All Repos
            </button>
            <button
              className={`${styles.filterTabBtn} ${activeFilter === "synced" ? styles.filterTabBtnActive : ""}`}
              onClick={() => setActiveFilter("synced")}
            >
              Connected
            </button>
            <button
              className={`${styles.filterTabBtn} ${activeFilter === "processing" ? styles.filterTabBtnActive : ""}`}
              onClick={() => setActiveFilter("processing")}
            >
              Ingesting
            </button>
            <button
              className={`${styles.filterTabBtn} ${activeFilter === "available" ? styles.filterTabBtnActive : ""}`}
              onClick={() => setActiveFilter("available")}
            >
              GitHub Available
            </button>
          </div>
        </div>

        {/* Repos Cards Grid */}
        <div className={styles.repoGrid} style={{ zIndex: 1, position: "relative", paddingBottom: "40px" }}>
          {searchedRepos.map((repo) => {
            const firstLetter = repo.name.charAt(0).toUpperCase();
            
            return (
              <div key={repo.id} className={styles.repoCardOuter}>
                <div className={styles.repoCardInner}>
                  {/* Decorative card cover */}
                  <div className={styles.repoCardCover}>
                    <div className={styles.repoCardCoverGrid} />
                    <div className={styles.repoCardCoverOctocat}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                      </svg>
                    </div>
                  </div>

                  {/* Overlapping Avatar */}
                  <div className={styles.repoCardAvatarContainer}>
                    {repo.avatar_url ? (
                      <img src={repo.avatar_url} alt={repo.owner} className={styles.repoCardAvatar} />
                    ) : (
                      <div className={styles.repoCardAvatarPlaceholder}>{firstLetter}</div>
                    )}
                  </div>

                  {/* Body Content */}
                  <div className={styles.repoCardContent}>
                    <div className={styles.repoCardHeaderInfo}>
                      <h3 className={styles.repoCardTitle} title={repo.name}>{repo.name}</h3>
                      <span className={styles.repoCardOwner}>{repo.owner}</span>
                    </div>

                    <p className={styles.repoCardDescription} title={repo.description}>
                      {repo.description}
                    </p>

                    {/* Meta Row: Language, stars, branch */}
                    <div className={styles.repoCardMetaRow}>
                      <span className={styles.repoCardLanguage}>
                        <span className={styles.repoCardLanguageDot} style={{ background: getLangColor(repo.language) }} />
                        {repo.language}
                      </span>
                      {repo.stargazers_count > 0 && (
                        <span className={styles.repoCardMetaItem}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#f59e0b" }}>
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                          {repo.stargazers_count}
                        </span>
                      )}
                      <span className={styles.repoCardMetaItem} style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem" }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
                          <path d="M18 9a9 9 0 0 1-9 9" />
                        </svg>
                        {repo.branch}
                      </span>
                    </div>

                    {/* Footer Actions & Status Badge */}
                    <div className={styles.repoCardFooter}>
                      {repo.status === "completed" && (
                        <>
                          <span className={`${styles.repoCardBadge} ${styles.badgeCompleted}`}>
                            <span className={`${styles.pulseLightDot} ${styles.pulseDotGreen}`} />
                            Active
                          </span>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => router.push(`/dashboard?repo_id=${repo.id}`)}
                            style={{ height: 28, padding: "0 12px", fontSize: "0.75rem" }}
                          >
                            Explore Workspace
                          </button>
                        </>
                      )}

                      {(repo.status === "processing" || repo.status === "queued") && (
                        <>
                          <span className={`${styles.repoCardBadge} ${styles.badgeProcessing}`}>
                            <span className={`${styles.pulseLightDot} ${styles.pulseDotOrange}`} />
                            Ingesting
                          </span>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => router.push(`/dashboard?repo_id=${repo.id}`)}
                            style={{ height: 28, padding: "0 12px", fontSize: "0.75rem" }}
                          >
                            Track Progress
                          </button>
                        </>
                      )}

                      {repo.status === "failed" && (
                        <>
                          <span className={`${styles.repoCardBadge} ${styles.badgeFailed}`}>
                            <span className={`${styles.pulseLightDot} ${styles.pulseDotRed}`} />
                            Failed
                          </span>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              setSelectedRepoForSync({ ...repo, isCustom: false });
                              setSyncBranch(repo.branch || "main");
                            }}
                            style={{ height: 28, padding: "0 12px", fontSize: "0.75rem" }}
                          >
                            Re-Sync
                          </button>
                        </>
                      )}

                      {repo.status === "not_connected" && (
                        <>
                          <span className={`${styles.repoCardBadge} ${styles.badgeNotConnected}`}>
                            <span className={`${styles.pulseLightDot} ${styles.pulseDotGray}`} />
                            Available
                          </span>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              setSelectedRepoForSync({ ...repo, isCustom: false });
                              setSyncBranch(repo.branch || "main");
                            }}
                            style={{ height: 28, padding: "0 12px", fontSize: "0.75rem" }}
                          >
                            Connect
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Plus Custom Connection Card */}
          <div className={styles.customConnectCardOuter}>
            <div
              className={styles.customConnectCardInner}
              onClick={() => {
                setSelectedRepoForSync({ name: "Custom Repository", html_url: "", isCustom: true });
                setSyncBranch("main");
              }}
            >
              <div className={styles.customConnectIconWrapper}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <h3 className={styles.customConnectTitle}>Connect Custom Repository</h3>
              <p className={styles.customConnectDesc}>Import any public Git repository via URL and custom branch.</p>
            </div>
          </div>
        </div>

        {/* Confirmation branch selection modal */}
        {selectedRepoForSync && (
          <div className={styles.modalOverlay} onClick={() => setSelectedRepoForSync(null)}>
            <div className={styles.confirmModalOuter} onClick={(e) => e.stopPropagation()}>
              <div className={styles.confirmModalInner}>
                <div className={styles.confirmModalHeader}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#b01e0a" }}>
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  <h3 className={styles.confirmModalTitle}>Connect Codebase</h3>
                </div>
                
                <p className={styles.confirmModalDesc}>
                  GitMesh will clone, tokenize Abstract Syntax Trees, map class dependencies, and run vector indexings for:
                </p>

                <div style={{ marginBottom: "20px" }}>
                  {selectedRepoForSync.isCustom ? (
                    <div className={styles.confirmModalForm}>
                      <span className={styles.confirmModalLabel}>Git Repository URL</span>
                      <input
                        type="url"
                        className={styles.confirmModalInput}
                        placeholder="https://github.com/owner/repo"
                        value={selectedRepoForSync.html_url}
                        onChange={(e) => setSelectedRepoForSync({ ...selectedRepoForSync, html_url: e.target.value })}
                        autoFocus
                      />
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span className={styles.confirmModalLabel}>Repository Source</span>
                      <span className={styles.confirmModalRepoName}>{selectedRepoForSync.owner}/{selectedRepoForSync.name}</span>
                    </div>
                  )}
                </div>

                <div className={styles.confirmModalForm}>
                  <span className={styles.confirmModalLabel}>Target Branch</span>
                  <input
                    type="text"
                    className={styles.confirmModalInput}
                    placeholder="main"
                    value={syncBranch}
                    onChange={(e) => setSyncBranch(e.target.value)}
                    autoFocus={!selectedRepoForSync.isCustom}
                  />
                </div>

                <div className={styles.confirmModalFooter}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setSelectedRepoForSync(null)}
                    disabled={syncLoading}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      if (selectedRepoForSync.isCustom && !selectedRepoForSync.html_url.trim()) {
                        setCustomConfirm({
                          isOpen: true,
                          title: "Invalid URL",
                          message: "Please enter a valid Git Repository URL to start indexing.",
                          confirmText: "Close",
                          onConfirm: () => {}
                        });
                        return;
                      }
                      const url = selectedRepoForSync.isCustom ? selectedRepoForSync.html_url : selectedRepoForSync.github_url;
                      handleSyncRepo(url, syncBranch);
                      setSelectedRepoForSync(null);
                    }}
                    disabled={syncLoading}
                  >
                    {syncLoading ? "Initiating..." : "Connect & Index"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {renderCustomConfirm()}
      </div>
    );
  };

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingSpinner} />
      </div>
    );
  }

  // Intercept here when no active repository is selected
  if (!activeRepoId) {
    return renderRepoSelectorDashboard();
  }

  const isSyncing = activeRepo && (activeRepo.status === "queued" || activeRepo.status === "processing" || activeRepo.status === "failed");

  if (isSyncing) {
    return (
      <div className={styles.workspace} style={{ padding: "40px", flexDirection: "column", overflowY: "auto", gap: "32px", width: "100%", height: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "0.5px solid var(--color-border)", paddingBottom: "24px", width: "100%" }}>
          <div>
            <h1 className={styles.pageTitle} style={{ fontSize: "1.5rem", display: "flex", alignItems: "center", gap: "10px", color: "var(--color-white)", fontWeight: 600 }}>
              Ingesting Codebase: <code style={{ color: "#ef4444", fontSize: "1.25rem", fontFamily: "var(--font-mono)", background: "rgba(255,255,255,0.03)", padding: "2px 8px", borderRadius: "var(--radius-sm)" }}>{activeRepo.github_url.split("/").pop()}</code>
            </h1>
            <p className={styles.pageSubtitle} style={{ marginTop: "6px", color: "var(--color-text-secondary)", fontSize: "0.875rem" }}>
              {activeRepo.status === "failed" 
                ? `Ingestion failed. Error: ${activeRepo.error_message || "Unknown error."}`
                : "GitMesh AI agents are parsing files, tokenizing Abstract Syntax Trees, mapping dependencies, and generating embeddings in real-time."
              }
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span className={`${styles.statusBadge} ${activeRepo.status === "failed" ? styles.statusFailed : styles.statusProcessing}`}>
              <span className={`${styles.statusDot} ${activeRepo.status === "failed" ? styles.statusDotFailed : styles.statusDotProcessing}`} />
              {activeRepo.status === "failed" ? "Failed" : activeRepo.detailed_status || "Processing"}
            </span>
            <button
              onClick={async () => {
                setCustomConfirm({
                  isOpen: true,
                  title: "Cancel Ingestion",
                  message: `Are you sure you want to cancel and delete ingestion for ${activeRepo.github_url.split("/").pop()}? This will stop indexing and remove all parsed nodes.`,
                  confirmText: "Cancel Ingestion",
                  cancelText: "Keep Ingesting",
                  onConfirm: async () => {
                    try {
                      await deleteRepo(activeRepo.id);
                      router.push("/dashboard");
                    } catch (err) {
                      console.error("Failed to cancel sync", err);
                      setCustomConfirm({
                        isOpen: true,
                        title: "Cancellation Failed",
                        message: err instanceof Error ? err.message : "Failed to cancel sync process.",
                        confirmText: "Close",
                        onConfirm: () => {}
                      });
                    }
                  }
                });
              }}
              style={{
                fontSize: "0.75rem",
                height: 28,
                padding: "0 12px",
                color: "#ef4444",
                background: "rgba(239, 68, 68, 0.05)",
                border: "0.5px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                transition: "all var(--transition-fast)",
              }}
            >
              Cancel Ingestion
            </button>
          </div>
        </div>

        {/* Bento Grid Visualizer */}
        <div style={{ flex: 1, width: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
          <AgentBentoGrid
            detailedStatus={activeRepo.detailed_status || activeRepo.status}
            repoName={activeRepo.github_url.split("/").pop() || "Repository"}
          />
        </div>
        {renderCustomConfirm()}
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
          display: leftCollapsed || (activeRepo && activeRepo.status !== "completed") ? "none" : "flex",
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
                className={`${styles.graphTabButton} ${activeGraphTab === "overview" ? styles.graphTabButtonActive : ""}`}
                onClick={() => setActiveGraphTab("overview")}
              >
                Overview
              </button>
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

            {activeGraphTab === "overview" ? (
              <div className={styles.panelBody} style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%", height: "100%" }}>
                <div style={{ flex: 1, width: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
                  <AgentBentoGrid
                    detailedStatus="completed"
                    repoName={activeRepo.github_url.split("/").pop() || "Repository"}
                  />
                </div>
              </div>
            ) : activeGraphTab !== "metrics" && activeGraphTab !== "diagrams" ? (
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
                            stroke={isHighlighted ? "rgba(176, 30, 10, 0.9)" : isInBlastEdge ? "rgba(239, 68, 68, 0.7)" : "rgba(255, 255, 255, 0.25)"}
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
                  {msg.role === "user" ? (
                    <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
                  ) : (
                    <ChatMarkdown content={msg.content} />
                  )}
                  
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
          /* Empty Workspace Welcome Panel with AgentBentoGrid */
          <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", padding: "40px", gap: "24px", width: "100%" }}>
            <div style={{ textAlign: "center", maxWidth: "600px", margin: "0 auto 12px" }}>
              <h1 style={{ fontFamily: "var(--font-display)", color: "var(--color-white)", fontSize: "1.75rem", fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 8 }}>
                GitMesh Workspace
              </h1>
              <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", lineHeight: 1.6, fontWeight: 300 }}>
                Construct codebase dependency graphs, traverse function calls, analyze blast radiuses, and ask context-grounded questions about your repositories. Select a repository from the sidebar to begin.
              </p>
            </div>
            <div style={{ flex: 1, width: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
              <AgentBentoGrid />
            </div>
          </div>
        )}
      </main>
      {renderCustomConfirm()}
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
