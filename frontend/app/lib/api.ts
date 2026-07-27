/**
 * GitDecode — Typed API Client
 * ===========================
 * Wraps fetch calls to the FastAPI backend with JWT injection from Supabase.
 * In Demo Mode, intercepts requests to serve high-fidelity mock graph data client-side.
 */

import { getSupabase } from "@/app/lib/supabase";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

// Helper to check if currently in Demo Mode
export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem("gitdecode_mock_session");
}

// ── Auth Header ─────────────────────────────────────────────────────

async function getAuthHeaders(): Promise<HeadersInit> {
  try {
    const mockSessionStr = typeof window !== "undefined" ? localStorage.getItem("gitdecode_mock_session") : null;
    if (mockSessionStr) {
      const mockSession = JSON.parse(mockSessionStr);
      if (mockSession?.access_token) {
        return {
          "Content-Type": "application/json",
          Authorization: `Bearer ${mockSession.access_token}`,
        };
      }
    }

    const supabase = getSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.access_token) {
      return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      };
    }
  } catch {
    // Supabase not configured — check if mock token is available as last fallback
    const mockSessionStr = typeof window !== "undefined" ? localStorage.getItem("gitdecode_mock_session") : null;
    if (mockSessionStr) {
      try {
        const mockSession = JSON.parse(mockSessionStr);
        if (mockSession?.access_token) {
          return {
            "Content-Type": "application/json",
            Authorization: `Bearer ${mockSession.access_token}`,
          };
        }
      } catch {}
    }
  }

  return { "Content-Type": "application/json" };
}

// ── Generic Fetcher ─────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `API Error: ${res.status}`);
  }

  return res.json();
}

// ── Types ───────────────────────────────────────────────────────────

export interface RepoItem {
  id: string;
  github_url: string;
  branch: string;
  status: "queued" | "processing" | "completed" | "failed";
  detailed_status?: string;
  error_message?: string;
  created_at: string;
  /** Full git commit SHA from the most recent successful sync */
  last_synced_commit?: string;
  /** Git commit subject message */
  last_synced_commit_msg?: string;
  /** ISO timestamp of the most recent successful sync */
  last_synced_at?: string;
}

export interface RepoSyncResponse {
  repo_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  message: string;
  detailed_status?: string;
  error_message?: string;
  queued_at: string;
}

export interface GraphStats {
  files: number;
  classes: number;
  functions: number;
  routes: number;
  edges: number;
}

export interface GraphNode {
  id: string;
  label: string;
  language: string | null;
  size_bytes: number | null;
  type?: string;
  file_path?: string | null;
  signature?: string | null;
  checksum?: string | null;
  symbols?: any[];
}

export interface GraphEdge {
  source: string;
  target: string;
  type?: string;
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface BlastRadiusNode {
  type: string;
  name: string | null;
  file_path: string | null;
}

export interface BlastRadiusResult {
  target: string;
  affected_files: string[];
  affected_nodes: BlastRadiusNode[];
  depth: number;
}

export interface ChatMessage {
  message_id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  sources: Array<{
    file_path: string;
    start_line?: number;
    end_line?: number;
    snippet?: string;
    node_type?: string;
  }>;
  thinking?: string[]; // Added for thinking process
}

export interface ChatHistory {
  session_id: string;
  repo_id: string;
  messages: ChatMessage[];
}

export interface ChatSession {
  session_id: string;
  latest_at: string;
}

export interface RepoDiagrams {
  architecture: string;
  userFlow: string;
  dataFlow: string;
}

export interface ReportPlanSection {
  id: number;
  title: string;
  goal: string;
  bullets?: string[];
  target_words?: number;
}

export interface ReportPlan {
  report_title: string;
  report_type: string;
  executive_summary_goal?: string;
  sections: ReportPlanSection[];
}

export interface CodebaseReport {
  repo_id: string;
  report_markdown: string;
  plan: ReportPlan | null;
  created_at: string;
}


// ── Mock Data Templates ─────────────────────────────────────────────

const MOCK_REPOS_LIST: RepoItem[] = [
  {
    id: "101",
    github_url: "https://github.com/gitdecode/gitdecode-runtime",
    branch: "main",
    status: "completed",
    detailed_status: "Active workspace indexing verified.",
    created_at: "2026-07-05T12:00:00Z",
    last_synced_commit: "9f3a1b8c2d4e",
    last_synced_commit_msg: "feat: optimize AST graph traversal",
    last_synced_at: "2026-07-27T18:00:00Z"
  },
  {
    id: "102",
    github_url: "https://github.com/gitdecode/ast-lexer-engine",
    branch: "main",
    status: "completed",
    detailed_status: "Active workspace indexing verified.",
    created_at: "2026-07-04T18:30:00Z",
    last_synced_commit: "4e2b8c9f1a3d",
    last_synced_commit_msg: "fix: handle async function AST nodes",
    last_synced_at: "2026-07-27T19:30:00Z"
  },
  {
    id: "103",
    github_url: "https://github.com/gitdecode/neo4j-vector-search",
    branch: "main",
    status: "completed",
    detailed_status: "Active workspace indexing verified.",
    created_at: "2026-07-03T09:15:00Z",
    last_synced_commit: "7c1d4e2b8a9f",
    last_synced_commit_msg: "refactor: optimize pgvector cosine similarity",
    last_synced_at: "2026-07-27T20:15:00Z"
  },
  {
    id: "104",
    github_url: "https://github.com/gitdecode/gitdecode-web-dashboard",
    branch: "main",
    status: "completed",
    detailed_status: "Active workspace indexing verified.",
    created_at: "2026-07-06T05:00:00Z",
    last_synced_commit: "b8a9f7c1d4e2",
    last_synced_commit_msg: "style: polish interactive bento cards",
    last_synced_at: "2026-07-27T21:00:00Z"
  }
];

// Helper to get or set mock repositories list
function getMockRepos(): RepoItem[] {
  if (typeof window === "undefined") return MOCK_REPOS_LIST;
  const cached = localStorage.getItem("gitdecode_mock_repos");
  if (cached) return JSON.parse(cached);
  localStorage.setItem("gitdecode_mock_repos", JSON.stringify(MOCK_REPOS_LIST));
  return MOCK_REPOS_LIST;
}

// ── API Functions ───────────────────────────────────────────────────

/** List all repos for the current user */
export async function listRepos(): Promise<RepoItem[]> {
  if (isDemoMode()) {
    return getMockRepos();
  }
  return apiFetch<RepoItem[]>("/repos");
}


export async function getRateLimitStatus(repoId: string): Promise<{ remaining_daily: number, remaining_monthly: number, is_developer: boolean, is_pro?: boolean, plan?: string }> {
  if (isDemoMode()) {
    return { remaining_daily: 999, remaining_monthly: 999, is_developer: true, is_pro: true, plan: "pro" };
  }
  return apiFetch<{ remaining_daily: number, remaining_monthly: number, is_developer: boolean, is_pro?: boolean, plan?: string }>(`/chat/rate-limit-status?repo_id=${repoId}`);
}

/** Get user's GitHub provider token from active session */
export async function getProviderToken(): Promise<string | undefined> {
  try {
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.provider_token || undefined;
  } catch {
    return undefined;
  }
}

/** Check accessibility of a repository (public or private) */
export async function checkRepoAccess(
  repoUrl: string,
  githubToken?: string
): Promise<{
  accessible: boolean;
  private?: boolean;
  name?: string;
  full_name?: string;
  owner?: string;
  description?: string;
  default_branch?: string;
  stargazers_count?: number;
  language?: string;
  owner_avatar_url?: string;
  html_url?: string;
  error_message?: string;
}> {
  if (isDemoMode()) {
    return {
      accessible: true,
      private: false,
      name: repoUrl.split("/").pop() || "repo",
      full_name: repoUrl.replace("https://github.com/", ""),
      description: "Demo Mode repository check.",
      default_branch: "main",
      language: "TypeScript",
    };
  }
  const token = githubToken || (await getProviderToken());
  return apiFetch("/repos/check-access", {
    method: "POST",
    body: JSON.stringify({ repo_url: repoUrl, github_token: token }),
  });
}

/** Initiate a repo sync */
export async function syncRepo(
  repoUrl: string,
  branch = "main",
  githubToken?: string
): Promise<RepoSyncResponse> {
  if (isDemoMode()) {
    const list = getMockRepos();
    const normalizedUrl = repoUrl.trim();
    let repo = list.find((r) => r.github_url === normalizedUrl);
    const repoId = repo ? repo.id : String(Date.now());

    if (!repo) {
      repo = {
        id: repoId,
        github_url: normalizedUrl,
        branch: branch.trim() || "main",
        status: "queued",
        detailed_status: "Sync queued in Demo Mode...",
        created_at: new Date().toISOString()
      };
      list.push(repo);
      localStorage.setItem("gitdecode_mock_repos", JSON.stringify(list));
    } else {
      repo.status = "queued";
      repo.detailed_status = "Sync queued in Demo Mode...";
      localStorage.setItem("gitdecode_mock_repos", JSON.stringify(list));
    }

    // Trigger state transitions to simulate indexing pipeline
    setTimeout(() => {
      const current = getMockRepos();
      const r = current.find((x) => x.id === repoId);
      if (r) {
        r.status = "processing";
        r.detailed_status = "Cloning codebase structures...";
        localStorage.setItem("gitdecode_mock_repos", JSON.stringify(current));
      }
    }, 1000);

    setTimeout(() => {
      const current = getMockRepos();
      const r = current.find((x) => x.id === repoId);
      if (r) {
        r.status = "processing";
        r.detailed_status = "Tokenizing AST node maps...";
        localStorage.setItem("gitdecode_mock_repos", JSON.stringify(current));
      }
    }, 2800);

    setTimeout(() => {
      const current = getMockRepos();
      const r = current.find((x) => x.id === repoId);
      if (r) {
        r.status = "processing";
        r.detailed_status = "pgvector semantic indexes generating...";
        localStorage.setItem("gitdecode_mock_repos", JSON.stringify(current));
      }
    }, 4500);

    setTimeout(() => {
      const current = getMockRepos();
      const r = current.find((x) => x.id === repoId);
      if (r) {
        r.status = "completed";
        r.detailed_status = "Active workspace indexing verified.";
        r.last_synced_commit = "e5f6a1b2c3d4";
        r.last_synced_commit_msg = "feat: latest commit synced successfully";
        r.last_synced_at = new Date().toISOString();
        localStorage.setItem("gitdecode_mock_repos", JSON.stringify(current));
      }
    }, 6000);

    return {
      repo_id: repoId,
      status: "queued",
      message: "Simulation sync initiated.",
      queued_at: new Date().toISOString()
    };
  }
  const token = githubToken || (await getProviderToken());
  return apiFetch<RepoSyncResponse>("/repos/sync", {
    method: "POST",
    body: JSON.stringify({ repo_url: repoUrl, branch, github_token: token }),
  });
}

/**
 * Trigger a re-sync of an already-connected repository.
 *
 * The backend will detect that `last_synced_commit` is set and perform
 * an incremental diff-based parse — only re-processing files that changed
 * since the last commit. Falls back to a full re-clone if the diff fails.
 */
export async function resyncRepo(
  repoUrl: string,
  branch = "main",
  githubToken?: string
): Promise<RepoSyncResponse> {
  return syncRepo(repoUrl, branch, githubToken);
}

/** Upload a local folder as a zip for ingestion */
export async function uploadLocalRepo(
  zipBlob: Blob,
  folderName: string
): Promise<RepoSyncResponse> {
  if (isDemoMode()) {
    const list = getMockRepos();
    const normalizedUrl = `local://${folderName}-demo`;
    let repo = list.find((r) => r.github_url === normalizedUrl);
    const repoId = repo ? repo.id : String(Date.now());

    if (!repo) {
      repo = {
        id: repoId,
        github_url: normalizedUrl,
        branch: "main",
        status: "queued",
        detailed_status: "Sync queued in Demo Mode...",
        created_at: new Date().toISOString()
      };
      list.push(repo);
      localStorage.setItem("gitdecode_mock_repos", JSON.stringify(list));
    } else {
      repo.status = "queued";
      repo.detailed_status = "Sync queued in Demo Mode...";
      localStorage.setItem("gitdecode_mock_repos", JSON.stringify(list));
    }

    // Trigger state transitions to simulate indexing pipeline
    setTimeout(() => {
      const current = getMockRepos();
      const r = current.find((x) => x.id === repoId);
      if (r) {
        r.status = "processing";
        r.detailed_status = "Extracting local archive...";
        localStorage.setItem("gitdecode_mock_repos", JSON.stringify(current));
      }
    }, 1000);

    setTimeout(() => {
      const current = getMockRepos();
      const r = current.find((x) => x.id === repoId);
      if (r) {
        r.status = "completed";
        r.detailed_status = "Active workspace indexing verified.";
        localStorage.setItem("gitdecode_mock_repos", JSON.stringify(current));
      }
    }, 3000);

    return {
      repo_id: repoId,
      status: "queued",
      message: "Simulation local sync initiated.",
      queued_at: new Date().toISOString()
    };
  }

  const headers = await getAuthHeaders();
  // Remove Content-Type so browser sets it automatically with boundary for FormData
  const { "Content-Type": _, ...restHeaders } = headers as any;
  
  const formData = new FormData();
  formData.append("file", zipBlob, `${folderName}.zip`);
  formData.append("folder_name", folderName);

  const res = await fetch(`${API_BASE}/repos/upload-local`, {
    method: "POST",
    headers: restHeaders,
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `API Error: ${res.status}`);
  }

  return res.json();
}

/** Cancel an active repo sync */
export async function cancelRepoSync(
  repoId: string
): Promise<RepoSyncResponse> {
  if (isDemoMode()) {
    const list = getMockRepos();
    const repo = list.find((r) => r.id === repoId);
    if (repo) {
      repo.status = "failed";
      repo.detailed_status = "cancelled";
      repo.error_message = "Ingestion cancelled by user.";
      localStorage.setItem("gitdecode_mock_repos", JSON.stringify(list));
    }
    return {
      repo_id: repoId,
      status: "failed",
      detailed_status: "cancelled",
      message: "Ingestion cancelled by user.",
      queued_at: new Date().toISOString()
    };
  }
  return apiFetch<RepoSyncResponse>(`/repos/${repoId}/cancel`, {
    method: "POST",
  });
}

/** Get repo sync status */
export async function getRepoStatus(
  repoId: string
): Promise<RepoSyncResponse> {
  if (isDemoMode()) {
    const list = getMockRepos();
    const repo = list.find((r) => r.id === repoId);
    return {
      repo_id: repoId,
      status: repo?.status || "completed",
      message: "Demo Mode status check.",
      detailed_status: repo?.detailed_status || "Completed",
      queued_at: new Date().toISOString()
    };
  }
  return apiFetch<RepoSyncResponse>(`/repos/${repoId}/status`);
}

/**
 * Resolve a repository's UUID from its GitHub username and repo name.
 * Calls GET /repos/by-name/{username}/{repoName} on the backend.
 * In Demo Mode, matches against the mock repo list using the reconstructed URL.
 */
export async function getRepoByName(
  username: string,
  repoName: string
): Promise<RepoSyncResponse> {
  if (isDemoMode()) {
    const list = getMockRepos();
    const githubUrl = `https://github.com/${username}/${repoName}`;
    const repo = list.find((r) => r.github_url === githubUrl);
    if (!repo) throw new Error(`Repository '${username}/${repoName}' not found in Demo Mode.`);
    return {
      repo_id: repo.id,
      status: repo.status,
      message: "Demo Mode lookup.",
      detailed_status: repo.detailed_status || repo.status,
      queued_at: repo.created_at,
    };
  }
  return apiFetch<RepoSyncResponse>(`/repos/by-name/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}`);
}

/** Get graph statistics for a repo */
export async function getGraphStats(repoId: string): Promise<GraphStats> {
  if (isDemoMode()) {
    return {
      files: 28,
      classes: 12,
      functions: 54,
      routes: 5,
      edges: 182
    };
  }
  return apiFetch<GraphStats>(`/repos/${repoId}/graph-stats`);
}

/** Get dependency graph for visualization */
export async function getDependencyGraph(
  repoId: string
): Promise<DependencyGraph> {
  return getFullGraph(repoId);
}

/** Get full repository graph containing all entities and relationships */
export async function getFullGraph(
  repoId: string
): Promise<DependencyGraph> {
  if (isDemoMode()) {
    const list = getMockRepos();
    const repo = list.find((r) => r.id === repoId);
    const repoName = repo?.github_url.split("/").pop() || "workspace";

    // Generate unique nodes based on repository name
    if (repoName.includes("runtime")) {
      return {
        nodes: [
          { id: "1", label: "main.py", language: "Python", size_bytes: 1420, type: "File", file_path: "main.py" },
          { id: "2", label: "worker.py", language: "Python", size_bytes: 4200, type: "File", file_path: "worker.py" },
          { id: "3", label: "tasks.py", language: "Python", size_bytes: 5210, type: "File", file_path: "tasks.py" },
          { id: "4", label: "parser.py", language: "Python", size_bytes: 8430, type: "File", file_path: "parser.py" },
          { id: "5", label: "indexing_agent.py", language: "Python", size_bytes: 12000, type: "File", file_path: "indexing_agent.py" },
          { id: "6", label: "db.py", language: "Python", size_bytes: 2800, type: "File", file_path: "db.py" },
          { id: "7", label: "Neo4jClient", language: "Python", size_bytes: null, type: "Class", file_path: "db.py" },
          { id: "8", label: "ASTParser", language: "Python", size_bytes: null, type: "Class", file_path: "parser.py" },
          { id: "9", label: "parse_ast()", language: "Python", size_bytes: null, type: "Function", file_path: "parser.py" },
          { id: "10", label: "index_codebase()", language: "Python", size_bytes: null, type: "Function", file_path: "tasks.py" }
        ],
        edges: [
          { source: "1", target: "2", type: "Imports" },
          { source: "2", target: "3", type: "Imports" },
          { source: "3", target: "4", type: "Imports" },
          { source: "4", target: "5", type: "Imports" },
          { source: "4", target: "6", type: "Imports" },
          { source: "6", target: "7", type: "Defines" },
          { source: "4", target: "8", type: "Defines" },
          { source: "8", target: "9", type: "Defines" },
          { source: "3", target: "10", type: "Defines" },
          { source: "10", target: "9", type: "Calls" },
          { source: "9", target: "7", type: "Calls" }
        ]
      };
    } else if (repoName.includes("lexer")) {
      return {
        nodes: [
          { id: "1", label: "index.ts", language: "TypeScript", size_bytes: 840, type: "File", file_path: "index.ts" },
          { id: "2", label: "lexer.ts", language: "TypeScript", size_bytes: 9400, type: "File", file_path: "lexer.ts" },
          { id: "3", label: "parser.ts", language: "TypeScript", size_bytes: 12400, type: "File", file_path: "parser.ts" },
          { id: "4", label: "ast.ts", language: "TypeScript", size_bytes: 4200, type: "File", file_path: "ast.ts" },
          { id: "5", label: "Lexer", language: "TypeScript", size_bytes: null, type: "Class", file_path: "lexer.ts" },
          { id: "6", label: "Parser", language: "TypeScript", size_bytes: null, type: "Class", file_path: "parser.ts" },
          { id: "7", label: "AstNode", language: "TypeScript", size_bytes: null, type: "Class", file_path: "ast.ts" },
          { id: "8", label: "tokenize()", language: "TypeScript", size_bytes: null, type: "Method", file_path: "lexer.ts" },
          { id: "9", label: "parse()", language: "TypeScript", size_bytes: null, type: "Method", file_path: "parser.ts" }
        ],
        edges: [
          { source: "1", target: "2", type: "Imports" },
          { source: "1", target: "3", type: "Imports" },
          { source: "2", target: "4", type: "Imports" },
          { source: "3", target: "4", type: "Imports" },
          { source: "2", target: "5", type: "Defines" },
          { source: "3", target: "6", type: "Defines" },
          { source: "4", target: "7", type: "Defines" },
          { source: "5", target: "8", type: "Defines" },
          { source: "6", target: "9", type: "Defines" },
          { source: "9", target: "8", type: "Calls" },
          { source: "8", target: "7", type: "Uses" },
          { source: "9", target: "7", type: "Uses" }
        ]
      };
    } else {
      // General fallbacks for custom repos connected in Demo Mode
      return {
        nodes: [
          { id: "1", label: "index.js", language: "JavaScript", size_bytes: 1800, type: "File", file_path: "index.js" },
          { id: "2", label: "utils.js", language: "JavaScript", size_bytes: 4500, type: "File", file_path: "utils.js" },
          { id: "3", label: "config.js", language: "JavaScript", size_bytes: 1200, type: "File", file_path: "config.js" },
          { id: "4", label: "formatData()", language: "JavaScript", size_bytes: null, type: "Function", file_path: "utils.js" }
        ],
        edges: [
          { source: "1", target: "2", type: "Imports" },
          { source: "1", target: "3", type: "Imports" },
          { source: "2", target: "4", type: "Defines" },
          { source: "1", target: "4", type: "Calls" }
        ]
      };
    }
  }
  return apiFetch<DependencyGraph>(`/repos/${repoId}/full-graph`);
}

/** Get blast radius analysis for a file */
export async function getBlastRadius(
  repoId: string,
  filePath: string
): Promise<BlastRadiusResult> {
  if (isDemoMode()) {
    const list = getMockRepos();
    const repo = list.find((r) => r.id === repoId);
    const repoName = repo?.github_url.split("/").pop() || "workspace";

    if (repoName.includes("runtime")) {
      return {
        target: filePath,
        affected_files: ["main.py", "tasks.py"],
        affected_nodes: [
          { type: "File", name: "main.py", file_path: "main.py" },
          { type: "Function", name: "index_codebase()", file_path: "tasks.py" }
        ],
        depth: 2
      };
    } else {
      return {
        target: filePath,
        affected_files: ["index.ts", "parser.ts"],
        affected_nodes: [
          { type: "File", name: "index.ts", file_path: "index.ts" },
          { type: "Class", name: "Parser", file_path: "parser.ts" }
        ],
        depth: 2
      };
    }
  }
  return apiFetch<BlastRadiusResult>(
    `/repos/${repoId}/blast-radius?file_path=${encodeURIComponent(filePath)}`
  );
}

/** Send a chat message */
export async function sendChatMessage(
  repoId: string,
  message: string,
  sessionId?: string,
  llmConfig?: { provider: string; model: string; api_key: string | null; context_window?: number }
): Promise<ChatMessage> {
  if (isDemoMode()) {
    const list = getMockRepos();
    const repo = list.find((r) => r.id === repoId);
    const repoName = repo?.github_url.split("/").pop() || "workspace";

    const normalizedMsg = message.toLowerCase();
    let reply = "";
    let mockSources: any[] = [];

    if (repoName.includes("runtime")) {
      if (normalizedMsg.includes("explain") || normalizedMsg.includes("how")) {
        reply = "The `gitdecode-runtime` project orchestrates codebase indexing via Python Celery worker engines. The key orchestration task is `index_codebase()` within [tasks.py](file:///tasks.py#L12-L35). This function coordinates cloning the repository structure and passing the folder tree to the Tree-Sitter based `ASTParser` defined in [parser.py](file:///parser.py#L42-L80). Once variables, imports, and calls are resolved, they are stored in the graph database utilizing the `Neo4jClient` wrapper in [db.py](file:///db.py#L10-L24).";
        mockSources = [
          {
            file_path: "tasks.py",
            start_line: 12,
            end_line: 35,
            snippet: "def index_codebase(repo_url, branch):\n    # 1. Clone structures\n    temp_path = git_clone(repo_url, branch)\n    # 2. Parse symbols\n    nodes, edges = ASTParser().parse_dir(temp_path)\n    # 3. Store graph\n    Neo4jClient().write_graph(nodes, edges)",
            node_type: "Function"
          },
          {
            file_path: "parser.py",
            start_line: 42,
            end_line: 80,
            snippet: "class ASTParser:\n    def parse_dir(self, dir_path):\n        # Scans directory and tokenizes files via Tree-Sitter AST\n        ...",
            node_type: "Class"
          }
        ];
      } else if (normalizedMsg.includes("parser") || normalizedMsg.includes("ast")) {
        reply = "AST logic is handled inside [parser.py](file:///parser.py) inside the `ASTParser` class. It walks file trees, determines the language by extension, and extracts class, function, method structures, and reference nodes.";
        mockSources = [
          {
            file_path: "parser.py",
            start_line: 42,
            end_line: 80,
            snippet: "class ASTParser:\n    def parse_file(self, file_path):\n        # Extracts node tokens\n        ...",
            node_type: "Class"
          }
        ];
      } else {
        reply = "I've analyzed the codebase graph. The system contains `worker.py` for task queues, `tasks.py` for Celery routines, `parser.py` for AST parsing, and `db.py` for database operations. How can I help you explore these relationships?";
      }
    } else if (repoName.includes("lexer")) {
      if (normalizedMsg.includes("explain") || normalizedMsg.includes("how")) {
        reply = "The `ast-lexer-engine` uses TypeScript and Tree-Sitter to construct token nodes. The entry point [index.ts](file:///index.ts) loads modules and passes file strings to the `Lexer` class in [lexer.ts](file:///lexer.ts#L20-L55). The parser in [parser.ts](file:///parser.ts#L10-L38) then maps token types to construct `AstNode` representations (located in [ast.ts](file:///ast.ts#L5-L18)) which are exported as JSON structures.";
        mockSources = [
          {
            file_path: "lexer.ts",
            start_line: 20,
            end_line: 55,
            snippet: "export class Lexer {\n  public tokenize(source: string): Token[] {\n    const tree = treeSitter.parse(source);\n    return this.walkTree(tree.rootNode);\n  }\n}",
            node_type: "Class"
          },
          {
            file_path: "parser.ts",
            start_line: 10,
            end_line: 38,
            snippet: "export class Parser {\n  public buildAst(tokens: Token[]): AstNode {\n    // Maps raw token arrays to nested AST branches\n    return new AstNode(tokens);\n  }\n}",
            node_type: "Class"
          }
        ];
      } else {
        reply = "I have indexed the TypeScript Lexer workspace. Core segments include the main tokenization loop in [lexer.ts](file:///lexer.ts) and the node mapping configurations in [ast.ts](file:///ast.ts). Ask me to explain dependencies or list classes!";
      }
    } else {
      reply = `I have loaded your custom codebase. It appears to contain ${repoName} repository trees. Feel free to query file interactions or class declarations, and I will search the indexed graph.`;
    }

    return {
      message_id: String(Date.now()),
      session_id: sessionId || "demo-session-1",
      role: "assistant",
      content: reply,
      created_at: new Date().toISOString(),
      sources: mockSources
    };
  }
  return apiFetch<ChatMessage>("/chat/send", {
    method: "POST",
    body: JSON.stringify({
      repo_id: repoId,
      message,
      session_id: sessionId,
      llm_config: llmConfig || null,
    }),
  });
}

/** Stream a chat message */
export async function streamChatMessage(
  repoId: string,
  message: string,
  sessionId: string | undefined,
  onUpdate: (type: "thought" | "token" | "message_id" | "user_message_id" | "done" | "sources", content: any, extra?: any) => void,
  llmConfig?: { provider: string; model: string; api_key: string | null; context_window?: number }
): Promise<void> {
  if (isDemoMode()) {
    // Simulate streaming for Demo Mode
    onUpdate("thought", "Analyzing query in Demo Mode...");
    await new Promise(r => setTimeout(r, 800));
    onUpdate("thought", "Generating mock response...");
    await new Promise(r => setTimeout(r, 800));
    
    const reply = "I have loaded your custom codebase. Feel free to query file interactions or class declarations, and I will search the indexed graph.";
    
    const words = reply.split(" ");
    for (let i = 0; i < words.length; i++) {
      onUpdate("token", words[i] + (i < words.length - 1 ? " " : ""));
      await new Promise(r => setTimeout(r, 20));
    }
    
    onUpdate("message_id", `demo-${Date.now()}`, { session_id: sessionId || "demo-session-1" });
    onUpdate("done", "");
    return;
  }

  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/chat/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      repo_id: repoId,
      message,
      session_id: sessionId,
      llm_config: llmConfig || null,
    }),
  });


  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errBody.detail || `API Error: ${res.status}`);
  }

  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  let tokenQueue = "";
  let isFlushing = false;

  const flushQueue = async () => {
    if (isFlushing) return;
    isFlushing = true;
    while (tokenQueue.length > 0) {
      // Dynamic speed: dump more chars instantly if falling behind
      const chunkSize = tokenQueue.length > 150 ? 10 : (tokenQueue.length > 50 ? 5 : (tokenQueue.length > 20 ? 2 : 1));
      const chunk = tokenQueue.substring(0, chunkSize);
      tokenQueue = tokenQueue.substring(chunkSize);
      onUpdate("token", chunk);
      await new Promise(r => setTimeout(r, 12));
    }
    isFlushing = false;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    
    // Process SSE line by line
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || ""; // Keep the incomplete line in the buffer

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "message_id") {
            onUpdate(data.type, data.content, { session_id: data.session_id });
          } else if (data.type === "full_text") {
            tokenQueue += (data.content || "");
            flushQueue();
          } else if (data.type === "token") {
            tokenQueue += (data.content || "");
            flushQueue();
          } else {
            onUpdate(data.type, data.content || "");
          }
        } catch (e) {
          console.warn("Failed to parse SSE JSON", e, line);
        }
      }
    }
  }

  // Ensure queue is empty before closing stream
  while (isFlushing) {
    await new Promise(r => setTimeout(r, 50));
  }
}

/** Get chat history for a session */
export async function getChatHistory(
  sessionId: string,
  repoId: string
): Promise<ChatHistory> {
  if (isDemoMode()) {
    return {
      session_id: sessionId,
      repo_id: repoId,
      messages: [
        {
          message_id: "msg-init",
          session_id: sessionId,
          role: "assistant",
          content: "Hello! I am your GitDecode AI assistant. I have mapped the entire dependency structures of this repository. You can ask me how files interact, query functions, or inspect code citations.",
          created_at: new Date().toISOString(),
          sources: []
        }
      ]
    };
  }
  return apiFetch<ChatHistory>(
    `/chat/history?session_id=${sessionId}&repo_id=${repoId}`
  );
}

/** List chat sessions for a repo */
export async function listChatSessions(
  repoId: string
): Promise<ChatSession[]> {
  if (isDemoMode()) {
    return [
      {
        session_id: "demo-session-1",
        latest_at: new Date().toISOString()
      }
    ];
  }
  return apiFetch<ChatSession[]>(`/chat/sessions?repo_id=${repoId}`);
}

/** Delete a chat session */
export async function deleteChatSession(sessionId: string): Promise<void> {
  if (isDemoMode()) {
    return;
  }
  await apiFetch<void>(`/chat/session/${sessionId}`, { method: "DELETE" });
}


/** Get call graph for visualization */
export async function getCallGraph(repoId: string): Promise<DependencyGraph> {
  return getFullGraph(repoId);
}

/** Get class graph for visualization */
export async function getClassGraph(repoId: string): Promise<DependencyGraph> {
  return getFullGraph(repoId);
}

/** Get repository structural summary */
export async function getRepoSummary(repoId: string): Promise<any> {
  if (isDemoMode()) {
    const list = getMockRepos();
    const repo = list.find((r) => r.id === repoId);
    const repoName = repo?.github_url.split("/").pop() || "workspace";

    if (repoName.includes("runtime")) {
      return {
        total_files: 10,
        total_classes: 2,
        total_functions: 14,
        languages: [
          { language: "Python", count: 8 },
          { language: "YAML", count: 2 }
        ]
      };
    } else {
      return {
        total_files: 14,
        total_classes: 3,
        total_functions: 24,
        languages: [
          { language: "TypeScript", count: 12 },
          { language: "JSON", count: 2 }
        ]
      };
    }
  }
  return apiFetch<any>(`/repos/${repoId}/summary`);
}

/** Get generated Mermaid diagrams for a repository */
export async function getRepoDiagrams(repoId: string, forceRefresh = false, diagramType?: string): Promise<RepoDiagrams> {
  if (isDemoMode()) {
    const list = getMockRepos();
    const repo = list.find((r) => r.id === repoId);
    const repoName = repo?.github_url.split("/").pop() || "workspace";

    if (repoName.includes("runtime")) {
      return {
        architecture: `graph TD
  main.py --> worker.py
  worker.py --> tasks.py
  tasks.py --> parser.py
  parser.py --> db.py
  db.py --> Neo4jClient((Neo4j))`,
        userFlow: `sequenceDiagram
  actor Dev as Developer
  actor Celery as Ingestion Engine
  Dev ->> tasks.py: Trigger syncRepo()
  tasks.py ->> Celery: Enqueue job
  Celery ->> parser.py: AST tokenization
  Celery ->> db.py: Write neo4j linkages`,
        dataFlow: `graph LR
  GitSource[Git Source] --> LocalClone[Local Clone]
  LocalClone --> TreeSitter[Tree-Sitter Lexer]
  TreeSitter --> Database[(Neo4j Graph Graph)]`
      };
    } else {
      return {
        architecture: `graph TD
  index.ts --> lexer.ts
  index.ts --> parser.ts
  lexer.ts --> ast.ts
  parser.ts --> ast.ts`,
        userFlow: `sequenceDiagram
  actor API as Client Query
  API ->> index.ts: tokenizeCode()
  index.ts ->> lexer.ts: new Lexer()
  lexer.ts ->> ast.ts: generate AstNode[]`,
        dataFlow: `graph LR
  File[source.ts] --> Tokens[Raw Tokens]
  Tokens --> AST[Nested AST nodes]
  AST --> JSON[AST JSON Output]`
      };
    }
  }
  const query = `force_refresh=${forceRefresh}${diagramType ? `&diagram_type=${diagramType}` : ''}`;
  return apiFetch<RepoDiagrams>(`/repos/${repoId}/diagrams?${query}`);
}

export async function getRepoFileContent(repoId: string, filePath: string): Promise<{ content: string }> {
  if (isDemoMode()) {
    return { content: "// Mock file content for demo mode\nconsole.log('Hello World');" };
  }
  return apiFetch<{ content: string }>(`/repos/${repoId}/file?file_path=${encodeURIComponent(filePath)}`);
}

export async function getSystemHealth(): Promise<{ status: string }> {
  if (isDemoMode()) {
    return { status: "healthy" };
  }
  const rootBase = API_BASE.split("/api/")[0];
  const res = await fetch(`${rootBase}/health`);
  if (!res.ok) throw new Error("Health check failed");
  return res.json();
}

/** Submit chat feedback */
export async function submitChatFeedback(
  messageId: string,
  feedbackType: string
): Promise<void> {
  if (isDemoMode()) return;
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/chat/feedback`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message_id: messageId, feedback_type: feedbackType }),
  });
  if (!res.ok) throw new Error(`Feedback failed: ${res.status}`);
  return res.json();
}

/** Delete a chat message */
export async function deleteChatMessage(messageId: string): Promise<void> {
  if (isDemoMode()) return;
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/chat/message/${messageId}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}

// ── Codebase Report API ─────────────────────────────────────────────

/** Fetch saved report for a repository (returns null if none) */
export async function getReport(repoId: string): Promise<CodebaseReport | null> {
  if (isDemoMode()) return null;
  try {
    return await apiFetch<CodebaseReport>(`/repos/${repoId}/report`);
  } catch {
    return null;
  }
}

/** Generate a report via SSE streaming */
export async function generateReport(
  repoId: string,
  onUpdate: (
    type: "stage" | "report_type" | "plan" | "section_start" | "section_complete" | "report" | "done" | "error",
    content: any
  ) => void,
  signal?: AbortSignal
): Promise<void> {
  if (isDemoMode()) {
    onUpdate("stage", "Demo Mode — Simulating report generation...");
    await new Promise((r) => setTimeout(r, 600));
    onUpdate("stage", "Analyzing repository architecture...");
    await new Promise((r) => setTimeout(r, 800));
    onUpdate("stage", "Planning deep report sections...");
    await new Promise((r) => setTimeout(r, 800));
    onUpdate("report_type", { report_type: "fullstack", key_technologies: ["TypeScript", "Python", "FastAPI"] });
    onUpdate("plan", {
      report_title: "Demo Codebase Deep Analysis",
      report_type: "fullstack",
      sections: [
        { id: 1, title: "Architecture Breakdown", goal: "System modules analysis" },
        { id: 2, title: "API Router & Services", goal: "Endpoints and backend flow" },
        { id: 3, title: "Data Layer & Persistence", goal: "Database models and queries" },
      ],
    });
    onUpdate("section_complete", { completed: 1, total: 3, title: "Architecture Breakdown" });
    await new Promise((r) => setTimeout(r, 800));
    onUpdate("section_complete", { completed: 2, total: 3, title: "API Router & Services" });
    await new Promise((r) => setTimeout(r, 800));
    onUpdate("section_complete", { completed: 3, total: 3, title: "Data Layer & Persistence" });
    await new Promise((r) => setTimeout(r, 800));
    onUpdate("stage", "Polishing final report content...");
    await new Promise((r) => setTimeout(r, 600));
    onUpdate(
      "report",
      "# Demo Codebase Deep Analysis\n\n**Repository**: Demo Project | **Type**: Fullstack\n\n## Executive Summary\n\nThis is a simulated codebase report in Demo Mode.\n\n## Architecture Breakdown\n\nThe repository follows a clean multi-tier architecture separating frontend UI components from backend API routes.\n\n```mermaid\ngraph TD\n  Client[Next.js Client] --> API[FastAPI Router]\n  API --> DB[(Supabase Postgres)]\n```\n\n## API Router & Services\n\nAPI routes are defined under `/app/api/routes` handling authentication, repository management, and chat interactions."
    );
    onUpdate("done", "");
    return;
  }

  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/repos/${repoId}/report/generate`, {
    method: "POST",
    headers,
    signal,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errBody.detail || `API Error: ${res.status}`);
  }

  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          onUpdate(data.type, data.content || "");
        } catch (e) {
          console.warn("Failed to parse SSE JSON", e);
        }
      }
    }
  }
}

/** Delete cached report */
export async function deleteReport(repoId: string): Promise<void> {
  if (isDemoMode()) return;
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/repos/${repoId}/report`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(`Delete report failed: ${res.status}`);
}

/** Check report rate limit status */
export async function getReportRateLimitStatus(
  repoId: string
): Promise<{ can_generate: boolean; next_available: string | null; is_developer?: boolean }> {
  if (isDemoMode()) return { can_generate: true, next_available: null, is_developer: true };
  return apiFetch<{ can_generate: boolean; next_available: string | null; is_developer?: boolean }>(
    `/repos/${repoId}/report/rate-limit`
  );
}

/** Export report as PDF blob */
export async function exportReportPdf(
  repoId: string,
  markdown: string,
  repoName: string,
  createdAt?: string
): Promise<Blob> {
  if (isDemoMode()) {
    throw new Error("PDF export is disabled in Demo Mode.");
  }
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/repos/${repoId}/report/export-pdf`, {
    method: "POST",
    headers,
    body: JSON.stringify({ markdown, repo_name: repoName, created_at: createdAt }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errBody.detail || `Backend PDF generation failed (${res.status})`);
  }

  return await res.blob();
}

/** Get user's subscription details and plan limits */
export async function getUserSubscription(): Promise<any> {
  if (isDemoMode()) {
    return {
      plan: "pro",
      is_pro: true,
      limits: {
        daily_msg_limit: 1000,
        monthly_msg_limit: 5000,
        repo_limit: 999999,
        monthly_report_limit: 999999,
      },
      started_at: new Date().toISOString(),
      expires_at: null,
    };
  }
  return apiFetch<any>("/subscription");
}

/** Upgrade/change user subscription plan */
export async function upgradeUserSubscription(plan: "free" | "pro"): Promise<any> {
  if (isDemoMode()) {
    return { status: "success", plan };
  }
  return apiFetch<any>("/subscription/upgrade", {
    method: "POST",
    body: JSON.stringify({ plan }),
  });
}

// ══════════════════════════════════════════════════════════════════════
//  Pro Upgrade Request APIs
// ══════════════════════════════════════════════════════════════════════

export interface ProRequestData {
  first_name: string;
  last_name: string;
  mobile: string;
  email: string;
  address: string;
  coupon_code: string;
}

/** Submit a Pro upgrade request */
export async function submitProRequest(data: ProRequestData): Promise<any> {
  if (isDemoMode()) {
    return { status: "submitted", message: "Demo Mode — request simulated." };
  }
  return apiFetch<any>("/pro-requests", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** Check the current user's Pro request status */
export async function getProRequestStatus(): Promise<any> {
  if (isDemoMode()) {
    return { has_request: false, status: null, request: null };
  }
  return apiFetch<any>("/pro-requests/status");
}


// ══════════════════════════════════════════════════════════════════════
//  Admin Panel APIs
// ══════════════════════════════════════════════════════════════════════

/** Helper: Get admin auth headers from localStorage */
function getAdminHeaders(): HeadersInit {
  const token = typeof window !== "undefined"
    ? localStorage.getItem("gitdecode_admin_token")
    : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Admin API fetch wrapper */
async function adminApiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = getAdminHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `API Error: ${res.status}`);
  }
  return res.json();
}

/** Admin login — returns JWT token */
export async function adminLogin(password: string): Promise<{ token: string; expires_in: number }> {
  const res = await fetch(`${API_BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "Login failed" }));
    throw new Error(body.detail || "Invalid password");
  }
  return res.json();
}

/** Get all Pro requests (admin only) */
export async function adminListProRequests(statusFilter?: string): Promise<any[]> {
  const query = statusFilter ? `?status_filter=${statusFilter}` : "";
  return adminApiFetch<any[]>(`/admin/pro-requests${query}`);
}

/** Get Pro request statistics (admin only) */
export async function adminGetProRequestStats(): Promise<{
  total: number; pending: number; approved: number; rejected: number;
}> {
  return adminApiFetch<any>("/admin/pro-requests/stats");
}

/** Approve a Pro request (admin only) */
export async function adminApproveProRequest(
  requestId: string,
  adminNotes?: string
): Promise<any> {
  return adminApiFetch<any>(`/admin/pro-requests/${requestId}/approve`, {
    method: "POST",
    body: JSON.stringify({ admin_notes: adminNotes || null }),
  });
}

/** Reject a Pro request (admin only) */
export async function adminRejectProRequest(
  requestId: string,
  adminNotes?: string
): Promise<any> {
  return adminApiFetch<any>(`/admin/pro-requests/${requestId}/reject`, {
    method: "POST",
    body: JSON.stringify({ admin_notes: adminNotes || null }),
  });
}

/** Submit user feedback from website */
export async function submitFeedback(data: {
  name: string;
  email: string;
  message: string;
}): Promise<{ status: string; message: string }> {
  return apiFetch<{ status: string; message: string }>("/feedback", {
    method: "POST",
    body: JSON.stringify(data),
  });
}




