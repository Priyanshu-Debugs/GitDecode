/**
 * GitMesh — Typed API Client
 * ===========================
 * Wraps fetch calls to the FastAPI backend with JWT injection from Supabase.
 */

import { getSupabase } from "@/app/lib/supabase";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

// ── Auth Header ─────────────────────────────────────────────────────

async function getAuthHeaders(): Promise<HeadersInit> {
  try {
    const mockSessionStr = typeof window !== "undefined" ? localStorage.getItem("gitmesh_mock_session") : null;
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
    const mockSessionStr = typeof window !== "undefined" ? localStorage.getItem("gitmesh_mock_session") : null;
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
}

export interface GraphEdge {
  source: string;
  target: string;
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

// ── API Functions ───────────────────────────────────────────────────

/** List all repos for the current user */
export async function listRepos(): Promise<RepoItem[]> {
  return apiFetch<RepoItem[]>("/repos");
}

/** Initiate a repo sync */
export async function syncRepo(
  repoUrl: string,
  branch = "main"
): Promise<RepoSyncResponse> {
  return apiFetch<RepoSyncResponse>("/repos/sync", {
    method: "POST",
    body: JSON.stringify({ repo_url: repoUrl, branch }),
  });
}

/** Get repo sync status */
export async function getRepoStatus(
  repoId: string
): Promise<RepoSyncResponse> {
  return apiFetch<RepoSyncResponse>(`/repos/${repoId}/status`);
}

/** Get graph statistics for a repo */
export async function getGraphStats(repoId: string): Promise<GraphStats> {
  return apiFetch<GraphStats>(`/repos/${repoId}/graph-stats`);
}

/** Get dependency graph for visualization */
export async function getDependencyGraph(
  repoId: string
): Promise<DependencyGraph> {
  return apiFetch<DependencyGraph>(`/repos/${repoId}/dependency-graph`);
}

/** Get blast radius analysis for a file */
export async function getBlastRadius(
  repoId: string,
  filePath: string
): Promise<BlastRadiusResult> {
  return apiFetch<BlastRadiusResult>(
    `/repos/${repoId}/blast-radius?file_path=${encodeURIComponent(filePath)}`
  );
}

/** Send a chat message */
export async function sendChatMessage(
  repoId: string,
  message: string,
  sessionId?: string
): Promise<ChatMessage> {
  return apiFetch<ChatMessage>("/chat/send", {
    method: "POST",
    body: JSON.stringify({
      repo_id: repoId,
      message,
      session_id: sessionId,
    }),
  });
}

/** Get chat history for a session */
export async function getChatHistory(
  sessionId: string,
  repoId: string
): Promise<ChatHistory> {
  return apiFetch<ChatHistory>(
    `/chat/history?session_id=${sessionId}&repo_id=${repoId}`
  );
}

/** List chat sessions for a repo */
export async function listChatSessions(
  repoId: string
): Promise<ChatSession[]> {
  return apiFetch<ChatSession[]>(`/chat/sessions?repo_id=${repoId}`);
}

/** Delete a repo and all its data */
export async function deleteRepo(repoId: string): Promise<void> {
  return apiFetch<void>(`/repos/${repoId}`, { method: "DELETE" });
}

/** Get call graph for visualization */
export async function getCallGraph(repoId: string): Promise<DependencyGraph> {
  return apiFetch<DependencyGraph>(`/repos/${repoId}/call-graph`);
}

/** Get class graph for visualization */
export async function getClassGraph(repoId: string): Promise<DependencyGraph> {
  return apiFetch<DependencyGraph>(`/repos/${repoId}/class-graph`);
}

/** Get repository structural summary */
export async function getRepoSummary(repoId: string): Promise<any> {
  return apiFetch<any>(`/repos/${repoId}/summary`);
}

export interface RepoDiagrams {
  architecture: string;
  userFlow: string;
  dataFlow: string;
}

/** Get generated Mermaid diagrams for a repository */
export async function getRepoDiagrams(repoId: string, forceRefresh = false, diagramType?: string): Promise<RepoDiagrams> {
  const query = `force_refresh=${forceRefresh}${diagramType ? `&diagram_type=${diagramType}` : ''}`;
  return apiFetch<RepoDiagrams>(`/repos/${repoId}/diagrams?${query}`);
}
