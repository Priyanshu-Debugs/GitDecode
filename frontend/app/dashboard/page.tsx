"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { MermaidDiagram } from "@/components/ui/MermaidDiagram";
import { ChatMarkdown } from "@/components/ui/ChatMarkdown";
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep
} from "@/components/ai-elements/chain-of-thought";
import { useAuth } from "@/app/lib/useAuth";
import { useSubscription } from "@/app/lib/useSubscription";
import {
  listRepos,
  syncRepo,
  cancelRepoSync,
  checkRepoAccess,
  getProviderToken,
  getDependencyGraph,
  getCallGraph,
  getClassGraph,
  getFullGraph,
  getRepoSummary,
  getBlastRadius,
  getRepoDiagrams,
  streamChatMessage,
  getChatHistory,
  listChatSessions,
  type RepoItem,
  type DependencyGraph,
  type ChatMessage,
  type RepoDiagrams,
  type GraphNode,
  submitChatFeedback,
  deleteChatMessage,
  getRepoFileContent,
  getReport,
  generateReport,
  deleteReport,
  getReportRateLimitStatus,
  exportReportPdf,
  type CodebaseReport,
  type ReportPlan,
  uploadLocalRepo,
} from "@/app/lib/api";
import JSZip from "jszip";
import styles from "./dashboard.module.css";


import { motion } from "framer-motion";
import { AgentBentoGrid } from "@/components/ui/agent-bento-grid";
import ModelSelector from "@/app/components/ModelSelector";
import { useLocalKeys } from "@/app/lib/useLocalKeys";
import NvlGraphViewer from "@/components/ui/NvlGraphViewer";
import DashboardLoader from "@/app/components/DashboardLoader";
import ChatInput from "@/app/components/ChatInput";

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

/**
 * Extracts `username/repoName` from a GitHub URL for use in clean routes.
 * Handles URLs with or without .git suffix, trailing slashes, or deep paths.
 * e.g. "https://github.com/Priyanshu/GitDecode" → "/dashboard/repo/Priyanshu/GitDecode"
 */
function githubUrlToRepoPath(githubUrl: string): string {
  try {
    if (githubUrl.startsWith("local://")) {
      const name = githubUrl.replace("local://", "");
      return `/dashboard/repo/local/${encodeURIComponent(name)}`;
    }
    const clean = githubUrl.replace(/\.git$/, "").replace(/\/$/, "");
    const parts = clean.split("/");
    // Last two segments are owner and repo
    const repoName = parts[parts.length - 1];
    const owner = parts[parts.length - 2];
    if (owner && repoName) return `/dashboard/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`;
  } catch {
    // fall through to fallback
  }
  return "/dashboard";
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
    name: "gitdecode-runtime",
    description: "Distributed orchestration engine for indexing code ASTs and resolving reference linkages asynchronously using Python and Celery.",
    html_url: "https://github.com/gitdecode/gitdecode-runtime",
    stargazers_count: 142,
    forks_count: 18,
    language: "Python",
    default_branch: "main",
    owner: {
      login: "gitdecode",
      avatar_url: "https://avatars.githubusercontent.com/u/9919?v=4"
    },
    updated_at: "2026-07-05T12:00:00Z"
  },
  {
    id: 102,
    name: "ast-lexer-engine",
    description: "High-performance tree-sitter based lexing backend that tokenizes structures, classes, and scopes for vector indexing.",
    html_url: "https://github.com/gitdecode/ast-lexer-engine",
    stargazers_count: 98,
    forks_count: 12,
    language: "TypeScript",
    default_branch: "main",
    owner: {
      login: "gitdecode",
      avatar_url: "https://avatars.githubusercontent.com/u/9919?v=4"
    },
    updated_at: "2026-07-04T18:30:00Z"
  },
  {
    id: 103,
    name: "neo4j-vector-search",
    description: "Surgical context retrieval service linking code dependency graphs in Neo4j with pgvector-based dense semantic searches.",
    html_url: "https://github.com/gitdecode/neo4j-vector-search",
    stargazers_count: 256,
    forks_count: 34,
    language: "Go",
    default_branch: "main",
    owner: {
      login: "gitdecode",
      avatar_url: "https://avatars.githubusercontent.com/u/9919?v=4"
    },
    updated_at: "2026-07-03T09:15:00Z"
  },
  {
    id: 104,
    name: "gitdecode-web-dashboard",
    description: "Premium Awwwards-tier visual interface for analyzing codebase topologies, user action timelines, and vector queries.",
    html_url: "https://github.com/gitdecode/gitdecode-web-dashboard",
    stargazers_count: 64,
    forks_count: 6,
    language: "TypeScript",
    default_branch: "main",
    owner: {
      login: "gitdecode",
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
  const { subscription, isPro, loading: subscriptionLoading } = useSubscription();
  const router = useRouter();

  // Read Selection from URL params
  const searchParams = useSearchParams();
  const pathname = usePathname();
  let activeRepoId = searchParams.get("repo_id");

  // States
  const [repos, setRepos] = useState<RepoItem[]>(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("gitdecode_cached_repos");
      return cached ? JSON.parse(cached) : [];
    }
    return [];
  });

  // Infer activeRepoId from URL path if it is the clean URL pattern
  const isRepoDetailPath = pathname.startsWith("/dashboard/repo/");
  const pathParts = pathname.split("/").filter(Boolean);
  const pathUsername = isRepoDetailPath && pathParts.length >= 4 ? decodeURIComponent(pathParts[2]) : null;
  const pathRepoName = isRepoDetailPath && pathParts.length >= 4 ? decodeURIComponent(pathParts[3]) : null;

  if (!activeRepoId && pathUsername && pathRepoName && repos.length > 0) {
    const matched = repos.find((r) => {
      if (r.github_url.startsWith("local://")) {
        const name = r.github_url.replace("local://", "");
        return pathUsername === "local" && pathRepoName === name;
      }
      const parts = r.github_url.replace(/\.git$/, "").replace(/\/$/, "").split("/");
      return (
        parts[parts.length - 1] === pathRepoName &&
        parts[parts.length - 2] === pathUsername
      );
    });
    if (matched) {
      activeRepoId = matched.id;
    }
  }
  const [loading, setLoading] = useState(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("gitdecode_cached_repos");
      return !cached;
    }
    return true;
  });

  // Terminal URL Bar states
  const [terminalUrlInput, setTerminalUrlInput] = useState("");
  const [urlChecking, setUrlChecking] = useState(false);
  const [urlCheckResult, setUrlCheckResult] = useState<any | null>(null);
  const [urlCheckError, setUrlCheckError] = useState<string | null>(null);
  const [urlPreviewBranch, setUrlPreviewBranch] = useState("main");

  // GitHub integration & selector states
  const [githubRepos, setGithubRepos] = useState<any[]>([]);
  const [githubLoading, setGithubLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "synced" | "processing" | "available">("all");
  const [selectedRepoForSync, setSelectedRepoForSync] = useState<any | null>(null);
  const [syncBranch, setSyncBranch] = useState("main");
  const [syncError, setSyncError] = useState("");
  const [syncLoading, setSyncLoading] = useState(false);
  const [cancellingRepoId, setCancellingRepoId] = useState<string | null>(null);
  const { getActiveLLMConfig } = useLocalKeys();

  const handleCancelSync = async (repoId: string) => {
    setCancellingRepoId(repoId);
    try {
      await cancelRepoSync(repoId);
      fetchRepos();
    } catch (err) {
      setCustomConfirm({
        isOpen: true,
        title: "Cancellation Error",
        message: err instanceof Error ? err.message : "Failed to Cancel.",
        confirmText: "Close",
        onConfirm: () => {},
      });
    } finally {
      setCancellingRepoId(null);
    }
  };

  const handleTerminalUrlCheck = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const url = terminalUrlInput.trim();
    if (!url) return;

    setUrlChecking(true);
    setUrlCheckError(null);
    setUrlCheckResult(null);

    try {
      const res = await checkRepoAccess(url);
      if (res.accessible) {
        setUrlCheckResult(res);
        setUrlPreviewBranch(res.default_branch || "main");
      } else {
        setUrlCheckError(res.error_message || "Repository not found or access denied.");
      }
    } catch (err) {
      setUrlCheckError(err instanceof Error ? err.message : "Failed to verify repository access.");
    } finally {
      setUrlChecking(false);
    }
  };

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

  // Graphs states
  const activeGraphTab = (searchParams.get("tab") as "graph" | "chat" | "report" | "diagrams" | "insights") || "chat";

  // Codebase Report state
  const [report, setReport] = useState<CodebaseReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportGenerating, setReportGenerating] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [reportStages, setReportStages] = useState<string[]>([]);
  const [reportPlan, setReportPlan] = useState<ReportPlan | null>(null);
  const [reportSectionProgress, setReportSectionProgress] = useState<{ completed: number; total: number; title?: string } | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportRateLimit, setReportRateLimit] = useState<{ can_generate: boolean; next_available: string | null; is_developer?: boolean } | null>(null);
  const hasUnlimitedReports = isPro || Boolean(reportRateLimit?.is_developer);

  const handleGenerateReport = async () => {
    if (!activeRepoId || reportGenerating) return;
    setReportGenerating(true);
    setReportStages([]);
    setReportPlan(null);
    setReportSectionProgress(null);
    setReportError(null);
    setReport(null);

    try {
      await generateReport(activeRepoId, (type, content) => {
        if (type === "stage") setReportStages((prev) => [...prev, content]);
        else if (type === "plan") setReportPlan(content);
        else if (type === "section_complete") setReportSectionProgress(content);
        else if (type === "report") setReport({ repo_id: activeRepoId, report_markdown: content, plan: reportPlan, created_at: new Date().toISOString() });
        else if (type === "error") setReportError(content);
        else if (type === "done") {
          setReportGenerating(false);
          getReportRateLimitStatus(activeRepoId)
            .then((res) => setReportRateLimit(res))
            .catch(() => {});
        }
      });
    } catch (e: any) {
      setReportError(e.message || "Failed to generate report");
      setReportGenerating(false);
      getReportRateLimitStatus(activeRepoId)
        .then((res) => setReportRateLimit(res))
        .catch(() => {});
    }
  };

  const handleDownloadPdf = async () => {
    if (!report || !activeRepoId || pdfDownloading) return;
    setPdfDownloading(true);
    try {
      const activeRepo = repos.find((r) => r.id === activeRepoId);
      const repoName = activeRepo?.github_url?.split("/").pop() || "codebase";
      
      const blob = await exportReportPdf(activeRepoId, report.report_markdown, repoName, report.created_at);

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${repoName}_codebase_report.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF download failed:", err);
      setCustomConfirm({
        isOpen: true,
        title: "Download Failed",
        message: err instanceof Error ? err.message : "Failed to generate PDF download.",
        confirmText: "Close",
        onConfirm: () => {},
      });
    } finally {
      setPdfDownloading(false);
    }
  };

  const handleDownloadMarkdown = () => {
    if (!report) return;
    const blob = new Blob([report.report_markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeRepo?.github_url?.split("/").pop() || "codebase"}_report.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };


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
  const [graphData, setGraphData] = useState<DependencyGraph | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Blast Radius interactive highlighting
  const [blastRadiusFiles, setBlastRadiusFiles] = useState<string[]>([]);
  const [activeBlastFilePath, setActiveBlastFilePath] = useState<string | null>(null);
  const [blastRadiusLoading, setBlastRadiusLoading] = useState(false);

  const [activeThinkingMsgId, setActiveThinkingMsgId] = useState<string | null>(null);
  const isNearBottomRef = useRef(true);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const threshold = 150;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
    isNearBottomRef.current = isAtBottom;
  };
  const [isThinkingPanelOpen, setIsThinkingPanelOpen] = useState(false);

  // Summary & Diagrams Metrics
  const [summaryData, setSummaryData] = useState<any | null>(null);
  const [diagrams, setDiagrams] = useState<RepoDiagrams | null>(null);
  const [diagramsLoading, setDiagramsLoading] = useState<Record<string, boolean>>({});
  const [activeDiagramSubTab, setActiveDiagramSubTab] = useState<"arch" | "flow" | "data">("arch");

  // Chat states
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const isSubmittingRef = useRef(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [copiedMsgIds, setCopiedMsgIds] = useState<Set<string>>(new Set());
  const [feedbackState, setFeedbackState] = useState<Record<string, string>>({});
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [chatHistoryLoading, setChatHistoryLoading] = useState(true);
  const [selectedCitation, setSelectedCitation] = useState<any | null>(null);

  // File viewer state
  const [activeFileContent, setActiveFileContent] = useState<string | null>(null);
  const [activeFileName, setActiveFileName] = useState<string>("");
  const [isFileViewerOpen, setIsFileViewerOpen] = useState(false);
  const [fileViewerLoading, setFileViewerLoading] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Database & State Queries ─────────────────────────────────────────

  const fetchRepos = useCallback(async () => {
    try {
      const data = await listRepos();
      setRepos(data);
      if (typeof window !== "undefined") {
        localStorage.setItem("gitdecode_cached_repos", JSON.stringify(data));
      }
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
        // Navigate to human-readable URL; the bridge page will resolve it
        const repoPath = githubUrlToRepoPath(url.trim());
        router.push(repoPath);
      }
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : "Sync request failed.";
      const displayMsg =
        rawMsg === "Failed to fetch" || rawMsg.includes("Failed to fetch")
          ? "Unable to reach GitDecode backend API server. Please verify that the backend service is running and accessible."
          : rawMsg;
      setSyncError(displayMsg);
      setCustomConfirm({
        isOpen: true,
        title: displayMsg.includes("Free plan") ? "Plan Limit Reached" : "Connection Failed",
        message: displayMsg,
        confirmText: "Close",
        onConfirm: () => {}
      });
    } finally {
      setSyncLoading(false);
    }
  };

  const [localFolderUploading, setLocalFolderUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute("webkitdirectory", "true");
      fileInputRef.current.setAttribute("directory", "true");
    }
  }, []);

  const handleLocalFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLocalFolderUploading(true);
    setSyncError("");

    try {
      const zip = new JSZip();
      
      const ignoredPaths = ['.git', '.venv', 'node_modules', '.next', '__pycache__'];
      let totalSize = 0;
      let folderName = "local-folder";

      if (files[0].webkitRelativePath) {
        folderName = files[0].webkitRelativePath.split('/')[0];
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const path = file.webkitRelativePath || file.name;
        
        // Check ignored paths
        if (ignoredPaths.some(ignored => path.includes(`/${ignored}/`) || path.startsWith(`${ignored}/`))) {
          continue;
        }

        totalSize += file.size;
        // Limit total uncompressed size to 50MB
        if (totalSize > 50 * 1024 * 1024) {
          throw new Error("Local folder exceeds the 50MB upload size limit.");
        }

        zip.file(path, file);
      }

      const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 5 } });
      
      const res = await uploadLocalRepo(zipBlob, folderName);
      
      if (res && res.repo_id) {
         // Re-fetch instantly so we can resolve the full local:// URL
         const { listRepos } = await import("@/app/lib/api");
         const latestRepos = await listRepos();
         setRepos(latestRepos);
         
         const newRepo = latestRepos.find(r => r.id === res.repo_id);
         if (newRepo && newRepo.github_url) {
            router.push(githubUrlToRepoPath(newRepo.github_url));
         } else {
            router.push(`/dashboard?repo_id=${res.repo_id}`);
         }
      } else {
         fetchRepos();
         router.push(`/dashboard`);
      }
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : "Local folder sync failed.";
      setSyncError(rawMsg);
      setCustomConfirm({
        isOpen: true,
        title: rawMsg.includes("limit") ? "Limit Reached" : "Sync Failed",
        message: rawMsg,
        confirmText: "Close",
        onConfirm: () => {}
      });
    } finally {
      setLocalFolderUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
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

  // Fetch graph details when active repository changes

  useEffect(() => {
    if (!activeRepoId || activeRepoStatus !== "completed") {
      setGraphData(null);
      setSummaryData(null);
      return;
    }

    // Load Summary stats
    getRepoSummary(activeRepoId).then(setSummaryData).catch(() => {});

    // Clear blast radius active scans
    setBlastRadiusFiles([]);
    setActiveBlastFilePath(null);

    // Load Full Graph for NVL exploration ONCE
    getFullGraph(activeRepoId)
      .then((data) => {
        setGraphData(data);
      })
      .catch((err) => {
        console.error("Failed to load graph data:", err);
        setGraphData(null);
      });
  }, [activeRepoId, activeRepoStatus]);

  // Fetch Diagrams
  useEffect(() => {
    if (!activeRepoId || activeGraphTab !== "diagrams") {
      setDiagrams(null);
      return;
    }

    setDiagramsLoading({ arch: true, flow: true, data: true });
    getRepoDiagrams(activeRepoId)
      .then((data) => {
        setDiagrams(data);
      })
      .catch((err) => {
        console.error("Error loading diagrams:", err);
        setDiagrams(null);
      })
      .finally(() => {
        setDiagramsLoading({});
      });
  }, [activeRepoId, activeGraphTab]);

  const querySessionId = searchParams.get("session_id");

  // Load chat histories
  useEffect(() => {
    if (!activeRepoId) {
      setMessages([]);
      setChatSessionId(null);
      setChatHistoryLoading(false);
      return;
    }
    
    // Guard against wiping active stream/chat state when URL sync triggers a re-render
    if (querySessionId && chatSessionId === querySessionId && messages.length > 0) {
        return;
    }
    
    setChatHistoryLoading(true);
    listChatSessions(activeRepoId)
      .then((sessions) => {
        const requestedSessionExists = querySessionId && sessions.some((s) => s.session_id === querySessionId);
        const sid = requestedSessionExists ? querySessionId : (sessions.length > 0 ? sessions[0].session_id : null);
        
        if (sid !== querySessionId) {
            const newParams = new URLSearchParams(searchParams.toString());
            if (sid) {
                newParams.set("session_id", sid);
            } else {
                newParams.delete("session_id");
            }
            router.replace(`${pathname}?${newParams.toString()}`, { scroll: false });
            return;
        }

        if (sid) {
          setChatSessionId(sid);
          getChatHistory(sid, activeRepoId).then((history) => {
            setMessages(history.messages);
            setChatHistoryLoading(false);
          }).catch(() => {
            setChatHistoryLoading(false);
          });
        } else {
          setMessages([]);
          setChatSessionId(null);
          setChatHistoryLoading(false);
        }
      })
      .catch(() => {
        setMessages([]);
        setChatSessionId(null);
        setChatHistoryLoading(false);
      });
  }, [activeRepoId, querySessionId]);

  // Scroll chat
  useEffect(() => {
    if (isNearBottomRef.current) {
      chatEndRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [messages]);

  // Node selection triggers Blast Radius scan
  const handleNodeSelect = async (node: GraphNode) => {
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

  const handleFeedback = async (msgId: string, type: string) => {
    if (type === "copy") {
      const msg = messages.find(m => m.message_id === msgId);
      if (msg) {
        let textToCopy = msg.content;
        if (textToCopy.includes("</think>")) {
           const parts = textToCopy.split("</think>");
           textToCopy = parts.length > 1 ? parts.slice(1).join("</think>").trim() : "";
        }
        navigator.clipboard.writeText(textToCopy);
        setCopiedMsgIds(prev => {
          const next = new Set(prev);
          next.add(msgId);
          return next;
        });
        setTimeout(() => {
          setCopiedMsgIds(prev => {
            const next = new Set(prev);
            next.delete(msgId);
            return next;
          });
        }, 2000);
      }
      return;
    }

    try {
        await submitChatFeedback(msgId, type);
        setFeedbackState(prev => ({ ...prev, [msgId]: type }));
    } catch (e) {
        console.error("Failed to submit feedback", e);
    }
  };

  const openSourceFile = async (filePath: string) => {
    if (!activeRepoId) return;
    setActiveFileName(filePath);
    setIsFileViewerOpen(true);
    setFileViewerLoading(true);
    try {
       const res = await getRepoFileContent(activeRepoId, filePath);
       setActiveFileContent(res.content);
    } catch(e) {
       setActiveFileContent("Error loading file content.");
    } finally {
       setFileViewerLoading(false);
    }
  };

  const handleSendChat = useCallback(async (queryParam?: string) => {
    const query = queryParam || chatInput;
    if (!query.trim() || chatLoading || !activeRepoId || isSubmittingRef.current) return;
    
    isSubmittingRef.current = true;
    setChatLoading(true);
    setChatInput("");
    
    // Smooth scroll to bottom on new message submission
    isNearBottomRef.current = true;
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);

    const tempMsgId = `temp-${Date.now()}`;
    const tempMsg: ChatMessage = {
      message_id: tempMsgId,
      session_id: chatSessionId || "",
      role: "user",
      content: query,
      created_at: new Date().toISOString(),
      sources: [],
    };
    
    const tempAssistantId = `temp-ast-${Date.now()}`;
    const tempAssistantMsg: ChatMessage = {
      message_id: tempAssistantId,
      session_id: chatSessionId || "",
      role: "assistant",
      content: "",
      created_at: new Date().toISOString(),
      sources: [],
      thinking: [],
    };
    
    setMessages((prev) => [...prev, tempMsg, tempAssistantMsg]);

    let realMessageId = tempAssistantId;
    const llmConfig = getActiveLLMConfig();

    try {
      await streamChatMessage(activeRepoId, query, chatSessionId || undefined, (type, content, extra) => {
        if (type === "message_id" && extra?.session_id) {
            setChatSessionId(extra.session_id);
            realMessageId = content;
            setMessages((prev) => prev.map(m => m.message_id === tempAssistantId ? { ...m, message_id: realMessageId, session_id: extra.session_id } : m));
            
            if (!querySessionId || extra.session_id !== querySessionId) {
                const newParams = new URLSearchParams(searchParams.toString());
                newParams.set("session_id", extra.session_id);
                router.replace(`${pathname}?${newParams.toString()}`, { scroll: false });
            }
        } else if (type === "thought") {
            setMessages((prev) => prev.map(m => {
                if (m.message_id === tempAssistantId || m.message_id === realMessageId) {
                    const currentThinking = m.thinking || [];
                    return { ...m, thinking: [...currentThinking, content] };
                }
                return m;
            }));
        } else if (type === "token") {
            setMessages((prev) => prev.map(m => {
                if (m.message_id === tempAssistantId || m.message_id === realMessageId) {
                    return { ...m, content: m.content + content };
                }
                return m;
            }));
        } else if (type === "sources") {
            setMessages((prev) => prev.map(m => {
                if (m.message_id === tempAssistantId || m.message_id === realMessageId) {
                    return { ...m, sources: content };
                }
                return m;
            }));
        } else if (type === "done") {
            setChatLoading(false);
            isSubmittingRef.current = false;
        }
      }, llmConfig);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          message_id: `err-${Date.now()}`,
          session_id: chatSessionId || "",
          role: "assistant",
          content: "Sorry, I encountered an issue. Please try resubmitting your request.",
          created_at: new Date().toISOString(),
          sources: [],
        },
      ]);
      setChatLoading(false);
      isSubmittingRef.current = false;
    }
  }, [activeRepoId, chatInput, chatLoading, chatSessionId]);

  const activeRepo = repos.find((r) => r.id === activeRepoId);

  // Fetch cached report when entering report tab
  useEffect(() => {
    if (activeGraphTab === "report" && activeRepoId && activeRepo?.status === "completed") {
      setReportLoading(true);
      getReport(activeRepoId)
        .then((data) => setReport(data))
        .catch(() => setReport(null))
        .finally(() => setReportLoading(false));

      getReportRateLimitStatus(activeRepoId)
        .then((res) => setReportRateLimit(res))
        .catch(() => setReportRateLimit({ can_generate: true, next_available: null }));
    }
  }, [activeGraphTab, activeRepoId, activeRepo?.status]);




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
                  className={styles.confirmActionBtnGhost}
                  onClick={() => {
                    if (customConfirm.onCancel) customConfirm.onCancel();
                    setCustomConfirm(null);
                  }}
                >
                  {customConfirm.cancelText}
                </button>
              )}
              <button
                className={styles.confirmActionBtnPrimary}
                onClick={() => {
                  customConfirm.onConfirm();
                  setCustomConfirm(null);
                }}
              >
                {customConfirm.confirmText || "Close"}
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
    const githubListToUse = githubRepos;
    const displayRepos: any[] = [];

    // 1. Add all synced repos
    activeSyncsAndCompleted.forEach((sr) => {
      const githubMatch = githubListToUse.find((gr) => gr.html_url === sr.github_url);
      const parts = sr.github_url.replace(/\.git$/, "").replace(/\/$/, "").split("/");
      const owner = githubMatch?.owner?.login || parts[parts.length - 2] || "";
      const avatarUrl = githubMatch?.owner?.avatar_url || (owner ? `https://github.com/${owner}.png` : null);
      displayRepos.push({
        id: sr.id,
        name: githubMatch?.name || parts[parts.length - 1] || "repository",
        owner,
        avatar_url: avatarUrl,
        description:
          githubMatch?.description ||
          (sr.status === "completed"
            ? "Successfully indexed codebase graph."
            : "Codebase repository"),
        stargazers_count: githubMatch?.stargazers_count || 0,
        forks_count: githubMatch?.forks_count || 0,
        language: githubMatch?.language || "TypeScript",
        github_url: sr.github_url,
        branch: sr.branch,
        status: sr.status,
        detailed_status: sr.detailed_status,
        isSynced: true,
        private: githubMatch?.private ?? false,
      });
    });

    // 2. Add public GitHub repos that aren't synced yet
    githubListToUse.forEach((gr) => {
      const isAlreadySynced = activeSyncsAndCompleted.some(
        (sr) => sr.github_url === gr.html_url
      );
      if (!isAlreadySynced) {
        const owner = gr.owner?.login || "";
        const avatarUrl = gr.owner?.avatar_url || (owner ? `https://github.com/${owner}.png` : null);
        displayRepos.push({
          id: `github-${gr.id}`,
          name: gr.name,
          owner,
          avatar_url: avatarUrl,
          description: gr.description || "Public source repository available on GitHub.",
          stargazers_count: gr.stargazers_count || 0,
          forks_count: gr.forks_count || 0,
          language: gr.language || "TypeScript",
          github_url: gr.html_url,
          branch: gr.default_branch || "main",
          status: "not_connected",
          isSynced: false,
          private: gr.private ?? false,
        });
      }
    });

    // Filter displayRepos based on searchQuery & activeFilter
    const searchedRepos = displayRepos.filter((repo) => {
      const matchQuery =
        repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        repo.owner.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (repo.description &&
          repo.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (repo.language &&
          repo.language.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchQuery) return false;

      if (activeFilter === "synced") {
        return repo.isSynced && repo.status === "completed";
      }
      if (activeFilter === "processing") {
        return (
          repo.isSynced && (repo.status === "processing" || repo.status === "queued")
        );
      }
      if (activeFilter === "available") {
        return !repo.isSynced;
      }
      return true; // "all"
    });

    const getLangColor = (lang?: string) => {
      const colors: { [key: string]: string } = {
        TypeScript: "#3178c6",
        JavaScript: "#f1e05a",
        Python: "#3572A5",
        Go: "#00ADD8",
        Rust: "#dea584",
        Java: "#b07219",
        "C++": "#f34b7d",
        HTML: "#e34c26",
        CSS: "#563d7c",
      };
      return colors[lang || "TypeScript"] || "#888888";
    };

    const activeReposCount = repos.length;
    const isAtLimit = !subscriptionLoading && !isPro && activeReposCount >= 2;

    return (
      <div
        className={styles.repoDashboardContainer}
        style={{
          padding: "40px 48px",
          overflowY: "auto",
          width: "100%",
          height: "100%",
          background: "var(--color-bg)",
          position: "relative",
        }}
      >
        {/* repeating dot mesh grid background */}
        <div className={styles.dotMeshGrid} />
        {/* Glow Effects in Background */}
        <div
          style={{
            position: "absolute",
            top: "-10%",
            left: "30%",
            width: "450px",
            height: "450px",
            background:
              "radial-gradient(circle, rgba(200, 204, 212, 0.08) 0%, transparent 70%)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "10%",
            right: "10%",
            width: "350px",
            height: "350px",
            background:
              "radial-gradient(circle, rgba(200, 204, 212, 0.04) 0%, transparent 70%)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        {/* Hero Section */}
        <div className={styles.dashboardHero} style={{ zIndex: 1, position: "relative" }}>
          <h1 className={styles.dashboardHeroTitle}>Agent Workspace</h1>
          <p className={styles.dashboardHeroSubtitle}>
            Connect, analyze, and traverse your codebase graphs. Ask context-grounded questions using your workspace repository nodes.
          </p>
        </div>

        {/* ── Terminal-Style URL Bar ── */}
        <div className={styles.dashboardUrlContainer}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", justifyContent: "center", maxWidth: "800px", margin: "0 auto" }}>
            <form onSubmit={handleTerminalUrlCheck} className={styles.dashboardUrlForm} style={{ flex: 1, margin: 0 }}>
              <div className={styles.dashboardUrlInputWrap}>
                <span className={styles.dashboardUrlPrompt}>$</span>
                <input
                  type="text"
                  value={terminalUrlInput}
                  onChange={(e) => {
                    setTerminalUrlInput(e.target.value);
                    if (urlCheckResult || urlCheckError) {
                      setUrlCheckResult(null);
                      setUrlCheckError(null);
                    }
                  }}
                  placeholder="https://github.com/owner/repository"
                  className={styles.dashboardUrlInput}
                  disabled={urlChecking || syncLoading}
                  aria-label="GitHub repository URL"
                />
                <button
                  type="submit"
                  className={styles.dashboardUrlSubmit}
                  disabled={urlChecking || !terminalUrlInput.trim() || syncLoading}
                  title="Verify Repository Access"
                >
                  {urlChecking ? "..." : "→"}
                </button>
              </div>
            </form>

            <span style={{ fontSize: "0.75rem", letterSpacing: "0.05em", color: "var(--color-text-tertiary)", textTransform: "uppercase", fontFamily: "var(--font-mono)", flexShrink: 0 }}>OR</span>

            {/* @ts-ignore: webkitdirectory is non-standard but works in all modern browsers */}
            <input type="file" ref={fileInputRef} onChange={handleLocalFolderUpload} style={{ display: "none" }} webkitdirectory="true" directory="true" />
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={localFolderUploading || syncLoading || isAtLimit}
              style={{ 
                height: "100%",
                minHeight: "44px",
                padding: "0 18px",
                display: "flex", 
                alignItems: "center", 
                gap: "8px", 
                background: "rgba(18, 16, 14, 0.85)", 
                border: "1px solid var(--color-border)", 
                boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
                color: "var(--color-text-secondary)",
                borderRadius: "var(--radius-md, 8px)",
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
                transition: "all 0.2s ease",
                flexShrink: 0
              }}
              onMouseOver={(e) => {
                if (!localFolderUploading && !syncLoading && !isAtLimit) {
                  e.currentTarget.style.borderColor = "var(--color-green)";
                  e.currentTarget.style.boxShadow = "0 0 0 2px rgba(16, 185, 129, 0.15), 0 8px 24px rgba(0, 0, 0, 0.5)";
                  e.currentTarget.style.color = "var(--color-white)";
                }
              }}
              onMouseOut={(e) => {
                if (!localFolderUploading && !syncLoading && !isAtLimit) {
                  e.currentTarget.style.borderColor = "var(--color-border)";
                  e.currentTarget.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.04)";
                  e.currentTarget.style.color = "var(--color-text-secondary)";
                }
              }}
            >
              {localFolderUploading ? (
                <span className={styles.spinner} style={{ width: 14, height: 14, border: "2px solid currentColor", borderRightColor: "transparent", borderRadius: "50%", animation: "spin 0.75s linear infinite" }} />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-text-tertiary)" }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              )}
              {localFolderUploading ? "Syncing..." : "Local Folder"}
            </button>
          </div>


          {/* Verification Error */}
          {urlCheckError && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                marginTop: "10px",
                padding: "10px 14px",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "var(--radius-md, 8px)",
                color: "#f87171",
                fontSize: "0.8125rem",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{urlCheckError}</span>
            </motion.div>
          )}

          {/* Repo Preview Card */}
          {urlCheckResult && (
            <motion.div
              className={styles.repoPreviewCard}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <div className={styles.repoPreviewHeader}>
                <div className={styles.repoPreviewTitleRow}>
                  {urlCheckResult.owner_avatar_url ? (
                    <img
                      src={urlCheckResult.owner_avatar_url}
                      alt={urlCheckResult.owner || "Owner"}
                      className={styles.repoPreviewAvatar}
                    />
                  ) : (
                    <div
                      className={styles.repoPreviewAvatar}
                      style={{
                        background: "rgba(255,255,255,0.1)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                      }}
                    >
                      {(urlCheckResult.name || "R").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className={styles.repoPreviewTitle}>{urlCheckResult.full_name || urlCheckResult.name}</div>
                  </div>
                </div>

                <span
                  className={`${styles.tagBadge} ${
                    urlCheckResult.private ? styles.tagPrivate : styles.tagPublic
                  }`}
                >
                  {urlCheckResult.private ? "Private" : "Public"}
                </span>
              </div>

              {urlCheckResult.description && (
                <p className={styles.repoPreviewDesc}>{urlCheckResult.description}</p>
              )}

              <div className={styles.repoPreviewMeta}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>Branch:</span>
                  <input
                    type="text"
                    value={urlPreviewBranch}
                    onChange={(e) => setUrlPreviewBranch(e.target.value)}
                    className={styles.repoPreviewBranchInput}
                    placeholder="main"
                  />
                </div>

                {urlCheckResult.language && (
                  <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: getLangColor(urlCheckResult.language) }} />
                    {urlCheckResult.language}
                  </span>
                )}

                <div style={{ marginLeft: "auto", display: "flex", gap: "10px" }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setUrlCheckResult(null);
                      setTerminalUrlInput("");
                    }}
                    style={{ height: 32, fontSize: "0.75rem" }}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={syncLoading || isAtLimit}
                    onClick={() => {
                      const urlToSync = urlCheckResult.html_url || terminalUrlInput.trim();
                      handleSyncRepo(urlToSync, urlPreviewBranch);
                      setUrlCheckResult(null);
                      setTerminalUrlInput("");
                    }}
                    style={{ height: 32, fontSize: "0.75rem" }}
                  >
                    {syncLoading ? "Initiating..." : "Connect & Index"}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {isAtLimit && (
          <motion.div
            className={styles.limitBanner}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className={styles.limitBannerContent}>
              <h3 className={styles.limitBannerTitle}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  style={{ color: "var(--color-secondary-accent, #d8a657)" }}
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Free Plan Limit Reached
              </h3>
              <p className={styles.limitBannerText}>
                You can only connect 2 repositories on the Free Plan. Upgrade your subscription to connect unlimited repositories.
              </p>
            </div>
            <button className={styles.limitBannerBtn} onClick={() => router.push("/pricing")}>
              <span>View Pricing & Upgrade</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </motion.div>
        )}

        {/* Quick Bento Stats Section */}
        <div className={styles.statsRow} style={{ zIndex: 1, position: "relative" }}>
          {[
            { value: repos.filter((r) => r.status === "completed").length, label: "Connected Codebases" },
            { value: repos.filter((r) => r.status === "processing" || r.status === "queued").length, label: "Ingesting Tasks" },
            { value: githubRepos.length, label: "GitHub Repos Available" },
            { value: repos.filter((r) => r.status === "completed").length > 0 ? `${repos.filter((r) => r.status === "completed").length * 3 + 2}k Nodes` : "0 Nodes", label: "Total AST Entities" },
          ].map((stat, idx) => (
            <motion.div
              key={idx}
              className={styles.dashboardStatCard}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: idx * 0.05, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className={styles.statVal}>{stat.value}</span>
              <span className={styles.statLabel}>{stat.label}</span>
            </motion.div>
          ))}
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
              Public Available
            </button>
          </div>
        </div>

        {/* Repos Cards Grid */}
        <div className={styles.repoGrid} style={{ zIndex: 1, position: "relative", paddingBottom: "40px" }}>
          {searchedRepos.length > 0 ? (
            searchedRepos.map((repo, idx) => {
              const firstLetter = repo.name.charAt(0).toUpperCase();

              return (
                <motion.div
                  key={repo.id}
                  className={styles.repoCardOuter}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -6, scale: 1.01 }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 18,
                    opacity: { duration: 0.35, delay: idx * 0.04 },
                  }}
                >
                  <div className={styles.repoCardInner}>
                    {/* Decorative card cover */}
                    <div className={styles.repoCardCover}>
                      <div className={styles.repoCardCoverGrid} />
                      <div className={styles.repoCardCoverOctocat}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
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
                        <h3 className={styles.repoCardTitle} title={repo.name}>
                          {repo.name}
                        </h3>
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
                        <span className={styles.repoCardMetaItem} style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem" }}>
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
                              Connected
                            </span>

                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => router.push(githubUrlToRepoPath(repo.github_url))}
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
                            <div style={{ display: "flex", gap: "6px" }}>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => router.push(githubUrlToRepoPath(repo.github_url))}
                                style={{ height: 28, padding: "0 10px", fontSize: "0.75rem" }}
                              >
                                Track
                              </button>
                              <button
                                className={`${styles.cancelIngestionBtn} ${styles.cancelIngestionBtnSmall}`}
                                disabled={cancellingRepoId === repo.id}
                                onClick={() => handleCancelSync(repo.id)}
                                title="Cancel"
                              >
                                {cancellingRepoId === repo.id ? "..." : "Cancel"}
                              </button>
                            </div>
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
                              onClick={() => handleSyncRepo(repo.github_url, repo.branch)}
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
                              onClick={() => handleSyncRepo(repo.github_url, repo.branch)}
                              disabled={isAtLimit}
                              title={isAtLimit ? "Free plan limited to 2 repos. Upgrade to Pro for unlimited." : ""}
                              style={{
                                height: 28,
                                padding: "0 12px",
                                fontSize: "0.75rem",
                                opacity: isAtLimit ? 0.5 : 1,
                                cursor: isAtLimit ? "not-allowed" : "pointer",
                              }}
                            >
                              Connect
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })
          ) : (
            <div
              style={{
                gridColumn: "1 / -1",
                padding: "48px 24px",
                textAlign: "center",
                background: "rgba(22, 20, 16, 0.5)",
                border: "1px dashed var(--color-border)",
                borderRadius: "var(--radius-lg, 10px)",
              }}
            >
              <p style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem", marginBottom: "8px" }}>
                No repositories found.
              </p>
              <p style={{ color: "var(--color-text-tertiary)", fontSize: "0.75rem" }}>
                Paste any Public or Private GitHub URL into the terminal bar above to connect a repository.
              </p>
            </div>
          )}
        </div>

        {renderCustomConfirm()}
      </div>
    );
  };

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <DashboardLoader />
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
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          border: activeRepo.status === "failed" ? "1px solid rgba(224, 138, 74, 0.3)" : "1px solid rgba(255, 255, 255, 0.08)",
          background: "rgba(22, 20, 16, 0.75)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          padding: "24px 32px",
          borderRadius: "var(--radius-lg, 12px)",
          boxShadow: "0 16px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
          width: "100%"
        }}>
          <div>
            <h1 className={styles.pageTitle} style={{ fontSize: "1.35rem", display: "flex", alignItems: "center", gap: "10px", color: "var(--color-white)", fontWeight: 600 }}>
              {activeRepo.status === "failed" ? "Ingestion Failed:" : "Ingesting Codebase:"}{" "}
              <span style={{ color: activeRepo.status === "failed" ? "var(--color-orange)" : "var(--color-green)", fontSize: "1.35rem", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                {activeRepo.github_url.split("/").pop()}
              </span>
            </h1>
            <p className={styles.pageSubtitle} style={{ marginTop: "8px", color: "var(--color-text-secondary)", fontSize: "0.875rem" }}>
              {activeRepo.status === "failed" 
                ? `Ingestion failed: ${activeRepo.error_message || "Unable to parse repository files."}`
                : "GitDecode AI agents are parsing files, tokenizing Abstract Syntax Trees, mapping dependencies, and generating embeddings in real-time."
              }
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span className={`${styles.statusBadge} ${activeRepo.status === "failed" ? styles.statusFailed : styles.statusProcessing}`}>
              <span className={`${styles.statusDot} ${activeRepo.status === "failed" ? styles.statusDotFailed : styles.statusDotProcessing}`} />
              {activeRepo.status === "failed" ? (activeRepo.detailed_status === "cancelled" ? "Ingestion Cancelled" : "Failed") : activeRepo.detailed_status || "Processing"}
            </span>

            {(activeRepo.status === "queued" || activeRepo.status === "processing") && (
              <button
                className={styles.cancelIngestionBtn}
                disabled={cancellingRepoId === activeRepo.id}
                onClick={() => handleCancelSync(activeRepo.id)}
                title="Cancel"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                {cancellingRepoId === activeRepo.id ? "Cancelling..." : "Cancel"}
              </button>
            )}

            {activeRepo.status === "failed" && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => handleSyncRepo(activeRepo.github_url, activeRepo.branch)}
                style={{ height: 34, padding: "0 16px", fontSize: "0.8125rem" }}
              >
                Re-Sync Repo
              </button>
            )}
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
    <div className={styles.workspace} style={{ position: "relative" }}>
      {/* ═════════════════════════════════════════════════════════════════
         MAIN WORKSPACE: Knowledge Graph, Chat, Diagrams & Insights
         ═════════════════════════════════════════════════════════════════ */}
      {activeRepo && activeRepo.status === "completed" && (
        <>
          {activeGraphTab === "chat" && (
            <div className={styles.chatFullSpace}>
              {/* Chat Messages */}
              <div className={styles.chatMessageListFull} onScroll={handleScroll}>
                {chatHistoryLoading ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%", padding: "16px 0" }}>
                      <div className={`${styles.chatSkeletonBubble} ${styles.user}`} style={{ width: "35%", height: 60 }} />
                      <div className={`${styles.chatSkeletonBubble} ${styles.assistant}`} style={{ width: "85%", height: 140 }} />
                      <div className={`${styles.chatSkeletonBubble} ${styles.user}`} style={{ width: "45%", height: 80 }} />
                      <div className={`${styles.chatSkeletonBubble} ${styles.assistant}`} style={{ width: "75%", height: 110 }} />
                    </div>
                ) : messages.length === 0 && (
                  <div className={styles.chatEmptyState}>
                    <h3 className={styles.chatEmptyTitle}>
                      Let&apos;s Explore The Codebase 
                    </h3>
                    
                    {/* Repo Context Card */}
                    <div className={styles.chatRepoCard}>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.625rem" }}>
                        {(activeRepo.github_url.split("/").pop() || "RM").slice(0, 2).toUpperCase()}
                      </div>
                      <span>
                        {activeRepo.github_url.replace("https://github.com/", "")} [{activeRepo.branch}]
                      </span>
                      {summaryData?.languages?.[0] && (
                        <span style={{ color: getLangColor(summaryData.languages[0].language) }}>
                          ● {summaryData.languages[0].language.toUpperCase()}
                        </span>
                      )}
                    </div>

                    {/* Suggested Prompt Cards */}
                    <div className={styles.chatPromptGrid}>
                      <button className={styles.chatPromptCard} onClick={() => setChatInput("What is the project structure?")}>
                        What is the project structure?
                      </button>
                      <button className={styles.chatPromptCard} onClick={() => setChatInput("How does the main entry point work?")}>
                        How does the main entry point work?
                      </button>
                      <button className={styles.chatPromptCard} onClick={() => setChatInput("What are the key abstractions?")}>
                        What are the key abstractions?
                      </button>
                      <button className={styles.chatPromptCard} onClick={() => setChatInput("Show me the testing patterns")}>
                        Show me the testing patterns
                      </button>
                    </div>
                  </div>
                )}

                {messages.map((msg, idx) => {
                  let mainContent = msg.content || "";
                  let thinkContent = "";
                  
                  const thinkMatch = mainContent.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
                  if (thinkMatch) {
                    thinkContent = thinkMatch[1].trim();
                    mainContent = mainContent.replace(/<think>[\s\S]*?(?:<\/think>|$)/, "").trim();
                  } else {
                    const partialMatch = mainContent.match(/<t(?:h(?:i(?:n(?:k(?:>)?)?)?)?)?$/);
                    if (partialMatch) {
                        mainContent = mainContent.substring(0, partialMatch.index);
                    }
                  }

                  const isThinking = chatLoading && idx === messages.length - 1 && (!msg.content || (msg.content.includes("<think>") && !msg.content.includes("</think>")));
                  const hasThoughtProcess = thinkContent.length > 0 || (msg.thinking && msg.thinking.length > 0);

                  // Setup ChainOfThought Steps
                  let steps: { title: string; detail?: string }[] = [];
                  if (hasThoughtProcess) {
                    const baseThinking = msg.thinking || [];
                    baseThinking.forEach(t => {
                      steps.push({ title: t });
                    });

                    if (thinkContent) {
                      const paragraphs = thinkContent.split(/\n\s*\n/).map(l => l.trim()).filter(l => l.length > 0);
                      paragraphs.forEach((p, idx2) => {
                        let text = p;
                        if (p.startsWith('- ') || p.startsWith('* ')) {
                          text = p.substring(2).trim();
                        }
                        
                        if (idx2 < steps.length) {
                          steps[idx2].detail = text;
                        } else if (steps.length > 0) {
                          if (steps[steps.length - 1].detail) {
                            steps[steps.length - 1].detail += `\n\n${text}`;
                          } else {
                            steps[steps.length - 1].detail = text;
                          }
                        } else {
                          steps.push({ title: "Analysis Step", detail: text });
                        }
                      });
                    }
                  }

                  return (
                    <div
                      key={msg.message_id}
                      className={msg.role === "user" ? styles.chatBubbleUser : styles.chatBubbleAssistant}
                    >
                      {msg.role === "user" ? (
                        mainContent
                      ) : (
                        <>
                          {isThinking && (
                            <div className={styles.shiningTextContainer}>
                              <span className={styles.shiningText}>Thinking...</span>
                            </div>
                          )}
                          
                          {!isThinking && hasThoughtProcess && (
                            <div style={{ marginBottom: 14 }}>
                              <button 
                                onClick={() => {
                                  setActiveThinkingMsgId(msg.message_id);
                                  setIsThinkingPanelOpen(true);
                                }}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  padding: 0,
                                  fontSize: "0.75rem",
                                  fontFamily: "var(--font-sans)",
                                  color: "var(--color-text-secondary)",
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  transition: "color var(--transition-fast)",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = "var(--color-white)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = "var(--color-text-secondary)";
                                }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
                                  <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
                                  <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
                                  <path d="M17.599 6.5A3 3 0 0 0 14 6" />
                                  <path d="M6.401 6.5A3 3 0 0 1 10 6" />
                                  <path d="M3.4 10.5A3 3 0 0 0 5 11" />
                                  <path d="M20.6 10.5A3 3 0 0 1 19 11" />
                                </svg>
                                View Thought Process
                              </button>
                            </div>
                          )}

                          <ChatMarkdown content={mainContent} />

                          {/* Feedback Buttons */}
                          {mainContent && (!chatLoading || idx !== messages.length - 1) && (
                             <div className={styles.feedbackBar}>
                                 <button className={styles.feedbackBtn} onClick={() => handleFeedback(msg.message_id, "copy")} title="Copy">
                                   {copiedMsgIds.has(msg.message_id) ? (
                                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                   ) : (
                                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                   )}
                                 </button>

                                 <button className={`${styles.feedbackBtn} ${feedbackState[msg.message_id] === 'thumbs_up' ? styles.feedbackBtnActive : ''}`} onClick={() => handleFeedback(msg.message_id, "thumbs_up")} title="Helpful">
                                   <svg width="14" height="14" viewBox="0 0 24 24" fill={feedbackState[msg.message_id] === 'thumbs_up' ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
                                 </button>
                                 <button className={`${styles.feedbackBtn} ${feedbackState[msg.message_id] === 'thumbs_down' ? styles.feedbackBtnActive : ''}`} onClick={() => handleFeedback(msg.message_id, "thumbs_down")} title="Not Helpful">
                                   <svg width="14" height="14" viewBox="0 0 24 24" fill={feedbackState[msg.message_id] === 'thumbs_down' ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-2"></path></svg>
                                 </button>

                                 <div className={styles.moreOptionsContainer}>
                                   <button className={styles.moreOptionsBtn} title="View Sources">
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="1"></circle>
                                        <circle cx="19" cy="12" r="1"></circle>
                                        <circle cx="5" cy="12" r="1"></circle>
                                      </svg>
                                   </button>
                                   <div className={styles.moreOptionsDropdown}>
                                      <div className={styles.moreOptionsTitle}>Sources Used</div>
                                      {msg.sources && msg.sources.length > 0 ? (
                                         msg.sources.map((src: any, i: number) => (
                                            <button key={i} className={styles.sourceChip} onClick={() => openSourceFile(src.file_path)} title={src.file_path}>
                                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                                              {src.file_path.split('/').pop()}
                                            </button>
                                         ))
                                      ) : (
                                         <div style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                                            No sources used
                                         </div>
                                      )}
                                   </div>
                                 </div>
                             </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {/* Sticky bottom input */}
              <div style={{ width: "100%", maxWidth: "900px", margin: "0 auto", padding: "0 20px 24px 20px" }}>
                <ChatInput
                  repoId={activeRepoId}
                  onSend={(query) => handleSendChat(query)}
                  disabled={chatLoading}
                  initialValue={chatInput}
                />
              </div>
            </div>
          )}

          {activeGraphTab === "report" && (
            <div className={styles.reportFullSpace}>
              {reportLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 64 }}>
                  <div className={styles.loadingSpinner} />
                </div>
              ) : reportGenerating ? (
                /* LIVE GENERATION PROGRESS VIEW */
                <div className={styles.reportProgressCard}>
                  <div className={styles.reportProgressTitle}>
                    <div className={styles.loadingSpinner} style={{ width: 20, height: 20 }} />
                    <span>Generating Codebase Deep Analysis Report...</span>
                  </div>

                  <div className={styles.reportStageList}>
                    {reportStages.map((stg, i) => (
                      <div key={i} className={styles.reportStageItem}>
                        <div className={styles.reportStageDot} />
                        <span>{stg}</span>
                      </div>
                    ))}
                  </div>

                  {reportSectionProgress && (
                    <div style={{ marginTop: 12, fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
                      Writing section {reportSectionProgress.completed} of {reportSectionProgress.total}...
                    </div>
                  )}

                  {reportPlan && (
                    <div style={{ marginTop: 16 }}>
                      <h4 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--color-white)", marginBottom: 8 }}>
                        {reportPlan.report_title}
                      </h4>
                      <div className={styles.reportPlanGrid}>
                        {reportPlan.sections.map((sec) => (
                          <div key={sec.id} className={styles.reportPlanItem}>
                            <span className={styles.reportPlanItemTitle}>
                              {sec.id}. {sec.title}
                            </span>
                            <span className={styles.reportPlanItemGoal}>{sec.goal}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : report ? (
                /* RENDERED REPORT VIEW */
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <div className={styles.reportHeaderCard}>
                    <div className={styles.reportHeaderInfo}>
                      <h2 className={styles.reportTitleText}>
                        {report.plan?.report_title || `Codebase Report: ${activeRepo?.github_url?.split("/").pop()}`}
                      </h2>
                      <div className={styles.reportMetaBadges}>
                        {report.plan?.report_type && (
                          <span className={styles.reportBadge}>{report.plan.report_type}</span>
                        )}
                        <span className={styles.reportMetaText}>
                          Generated on {(() => {
                            const d = new Date(report.created_at);
                            const pad = (n: number) => n.toString().padStart(2, "0");
                            return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                          })()}
                        </span>
                      </div>
                    </div>

                    <div className={styles.reportActionGroup}>
                      <button
                        className={styles.reportActionBtn}
                        onClick={handleDownloadPdf}
                        disabled={pdfDownloading}
                      >
                        {pdfDownloading ? (
                          <>
                            <svg className={styles.spinIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                              <path d="M12 2a10 10 0 0 1 10 10" />
                            </svg>
                            Preparing PDF download...
                          </>
                        ) : (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            Download PDF
                          </>
                        )}
                      </button>
                      <button className={styles.reportActionBtn} onClick={handleDownloadMarkdown}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        Download MD
                      </button>
                      <button
                        className={styles.reportActionBtn}
                        onClick={handleGenerateReport}
                        disabled={!hasUnlimitedReports && reportRateLimit?.can_generate === false}
                      >
                        Regenerate
                      </button>
                    </div>
                  </div>

                  {!hasUnlimitedReports && reportRateLimit?.can_generate === false && (
                    <div className={styles.upgradeNoticeBox}>
                      <span className={styles.upgradeNoticeText}>
                        Monthly report limit reached (2 generations per repository per month). Upgrade your plan for unlimited deep analysis.
                      </span>
                      <button className={styles.upgradeNoticeBtn} onClick={() => router.push("/pricing")}>
                        Upgrade Plan
                      </button>
                    </div>
                  )}

                  {/* ── REPORT CONTENT CONTAINER ── */}
                  <div id="codebase-report-content" className={styles.reportContentPaper}>
                    <div className={styles.reportPdfHeader}>
                      <div className={styles.reportPdfHeaderTitle} style={{ paddingLeft: 0 }}>
                        Repository Analysis Report
                      </div>
                    </div>

                    <ChatMarkdown content={report.report_markdown} />
                    
                    <div className={styles.reportPdfFooter}>
                      Created by GitDecode
                    </div>
                  </div>
                </div>
              ) : (
                /* EMPTY STATE — NO REPORT YET */
                <div className={styles.reportEmptyState}>
                  <div className={styles.reportEmptyIcon}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                  </div>
                  <h3 className={styles.reportEmptyTitle}>Generate Codebase Deep Report</h3>
                  <p className={styles.reportEmptyDesc}>
                    Run a multi-agent LangGraph analysis pipeline that inspects your AST graph, directory hierarchy,
                    and source files to compile a comprehensive architectural report with inline diagrams.
                  </p>
                  {reportError && (
                    <div style={{ color: "var(--color-danger, #e0705f)", fontSize: "0.875rem", marginBottom: 16 }}>
                      {reportError}
                    </div>
                  )}

                  <button
                    className={styles.reportGenerateBtn}
                    onClick={handleGenerateReport}
                    disabled={!hasUnlimitedReports && reportRateLimit?.can_generate === false}
                  >
                    Generate Deep Analysis Report
                  </button>
                  <span className={styles.reportRateNotice}>
                    {hasUnlimitedReports
                      ? "Pro Plan Access — Unlimited Report Generations"
                      : reportRateLimit?.can_generate === false
                      ? "Monthly report limit reached (2 generations per repository per month)."
                      : "Limit: 2 generations (1 initial + 1 regeneration) per repository per month"}
                  </span>

                  {!hasUnlimitedReports && reportRateLimit?.can_generate === false && (
                    <div className={styles.upgradeNoticeBox}>
                      <span className={styles.upgradeNoticeText}>
                        Monthly report limit reached (2 generations per repository per month). Upgrade your plan for unlimited deep analysis.
                      </span>
                      <button className={styles.upgradeNoticeBtn} onClick={() => router.push("/pricing")}>
                        Upgrade Plan
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeGraphTab === "graph" && (

            <div className={styles.graphFullSpace}>
              {graphData ? (
                <NvlGraphViewer
                  nodes={graphData.nodes}
                  edges={graphData.edges}
                  graphType="overview"
                  repoId={activeRepoId}
                  blastRadiusFiles={blastRadiusFiles}
                  searchQuery={searchQuery}
                  onNodeSelect={handleNodeSelect}
                />
              ) : (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", color: "var(--color-text-tertiary)", fontSize: "0.8125rem" }}>
                  Loading graph visualization...
                </div>
              )}
            </div>
          )}

          {activeGraphTab === "diagrams" && (
            <div className={styles.diagramFullSpace}>
              <div className={styles.diagramTabContainer} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
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
                    const currentTab = activeDiagramSubTab;
                    setDiagramsLoading(prev => ({ ...prev, [currentTab]: true }));
                    try {
                      let diagramType = "architecture";
                      if (currentTab === "flow") diagramType = "userFlow";
                      if (currentTab === "data") diagramType = "dataFlow";
                      const data = await getRepoDiagrams(activeRepoId, true, diagramType);
                      setDiagrams(data);
                    } catch (err) {
                      console.error("Error regenerating diagrams:", err);
                    } finally {
                      setDiagramsLoading(prev => ({ ...prev, [currentTab]: false }));
                    }
                  }}
                  disabled={diagramsLoading[activeDiagramSubTab] || false}
                  style={{ fontSize: "0.6875rem", height: 26, padding: "0 8px" }}
                >
                  {diagramsLoading[activeDiagramSubTab] ? "Generating..." : "Regenerate"}
                </button>
              </div>

              {diagramsLoading[activeDiagramSubTab] && !diagrams ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                  <div className={styles.loadingSpinner} />
                </div>
              ) : diagrams ? (
                <div style={{ border: "none", background: "transparent", minHeight: "auto", display: "block", width: "100%" }}>
                  {activeDiagramSubTab === "arch" && <MermaidDiagram chart={diagrams.architecture} isDedicatedView={true} />}
                  {activeDiagramSubTab === "flow" && <MermaidDiagram chart={diagrams.userFlow} isDedicatedView={true} />}
                  {activeDiagramSubTab === "data" && <MermaidDiagram chart={diagrams.dataFlow} isDedicatedView={true} />}
                </div>
              ) : (
                <div style={{ color: "var(--color-text-tertiary)", fontSize: "0.8125rem", textAlign: "center" }}>
                  No visual models found for this repository.
                </div>
              )}
            </div>
          )}

          {activeGraphTab === "insights" && (
            <div className={styles.insightsFullSpace}>
              {summaryData ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
                  
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
                        
                        const colors = ["#c8ccd4", "#a0a8b8", "#7a8292", "#5b6370"];
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
          {/* Right Sliding Panel for Thinking Process */}
          <div className={`${styles.thoughtOverlay} ${isThinkingPanelOpen ? styles.thoughtOverlayOpen : ""}`}>
             <div className={styles.thoughtOverlayHeader}>
                <div>
                  Thought Process
                </div>
                <button 
                  className={styles.thoughtOverlayClose}
                  onClick={() => setIsThinkingPanelOpen(false)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
             </div>
             <div className={styles.thoughtOverlayContent}>
                {(() => {
                   const activeMsg = messages.find(m => m.message_id === activeThinkingMsgId);
                   if (!activeMsg) return null;
                   
                   let thinkText = "";
                   if (activeMsg.content && activeMsg.content.includes("<think>")) {
                       const parts = activeMsg.content.split("</think>");
                       thinkText = parts[0].replace("<think>", "").trim();
                   }
                   
                   let steps: { title: string; detail?: string }[] = [];
                   const baseThinking = activeMsg.thinking || [];
                   
                   baseThinking.forEach(t => {
                       steps.push({ title: t });
                   });

                   if (thinkText) {
                       const lines = thinkText.split('\n');
                       let currentStep = "";
                       const extractedSteps: string[] = [];
                       
                       lines.forEach(line => {
                           const trimmed = line.trim();
                           if (!trimmed) return;
                           
                           if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
                               if (currentStep) extractedSteps.push(currentStep);
                               currentStep = trimmed.replace(/^[-*]\s|^\d+\.\s/, '').trim();
                           } else {
                               if (currentStep) currentStep += " " + trimmed;
                               else currentStep = trimmed;
                           }
                       });
                       if (currentStep) extractedSteps.push(currentStep);
                       
                       if (extractedSteps.length <= 1) {
                           steps.push({ title: "Agent Reasoning", detail: thinkText.trim() });
                       } else {
                           extractedSteps.forEach((stepText, idx) => {
                               steps.push({ title: `Reasoning Step ${idx + 1}`, detail: stepText });
                           });
                       }
                   }
                   
                   return (
                       <>
                          {steps.map((step, i) => (
                             <div key={i} className={styles.thoughtStage}>
                                <div className={styles.thoughtStageTitle}>
                                  <div className={styles.thoughtStageIcon} />
                                  {step.title}
                                </div>
                                {step.detail && (
                                  <div className={styles.thoughtRawBlock}>
                                    <ChatMarkdown content={step.detail} />
                                  </div>
                                )}
                             </div>
                          ))}
                       </>
                   );
                })()}
             </div>
          </div>

          {/* Right Sliding Panel for File Viewer */}
          <div className={`${styles.thinkingPanelOverlay} ${isFileViewerOpen ? styles.thinkingPanelOverlayOpen : ""}`}>
             <div className={styles.thinkingPanelHeader}>
                <div className={styles.thinkingPanelTitle} style={{ wordBreak: 'break-all', fontSize: '0.9rem' }}>
                  {activeFileName}
                </div>
                <button 
                  className={styles.thinkingPanelCloseBtn}
                  onClick={() => setIsFileViewerOpen(false)}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
             </div>
             <div className={styles.thinkingPanelContent} style={{ padding: 0 }}>
                {fileViewerLoading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                     <div className={styles.loadingSpinner} />
                  </div>
                ) : (
                  <pre style={{
                     margin: 0,
                     padding: 20,
                     overflow: "auto",
                     fontSize: "0.75rem",
                     fontFamily: "var(--font-mono)",
                     color: "var(--color-text)",
                     lineHeight: 1.5,
                     background: "transparent"
                  }}>
                     {activeFileContent}
                  </pre>
                )}
             </div>
          </div>

      {renderCustomConfirm()}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className={styles.loadingScreen}><DashboardLoader /></div>}>
      <DashboardContent />
    </Suspense>
  );
}
