/**
 * GitDecode — Typed API Client
 * ===========================
 * Wraps fetch calls to the FastAPI backend with JWT injection from Supabase.
 */

import { getSupabase } from "@/app/lib/supabase";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

// ── Auth Header ─────────────────────────────────────────────────────

async function getAuthHeaders(): Promise<HeadersInit> {
  try {
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
    // Supabase not configured
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


// ── API Functions ───────────────────────────────────────────────────

/** List all repos for the current user */
export async function listRepos(): Promise<RepoItem[]> {
  return apiFetch<RepoItem[]>("/repos");
}


export async function getRateLimitStatus(repoId: string): Promise<{ remaining_daily: number, remaining_monthly: number, is_developer: boolean, is_pro?: boolean, plan?: string }> {
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
  return apiFetch<RepoSyncResponse>(`/repos/${repoId}/cancel`, {
    method: "POST",
  });
}

export async function getRepoStatus(
  repoId: string
): Promise<RepoSyncResponse> {
  return apiFetch<RepoSyncResponse>(`/repos/${repoId}/status`);
}

/**
 * Resolve a repository's UUID from its GitHub username and repo name.
 * Calls GET /repos/by-name/{username}/{repoName} on the backend.
 */
export async function getRepoByName(
  username: string,
  repoName: string
): Promise<RepoSyncResponse> {
  return apiFetch<RepoSyncResponse>(`/repos/by-name/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}`);
}

/** Get graph statistics for a repo */
export async function getGraphStats(repoId: string): Promise<GraphStats> {
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
  return apiFetch<DependencyGraph>(`/repos/${repoId}/full-graph`);
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
  sessionId?: string,
  llmConfig?: { provider: string; model: string; api_key: string | null; context_window?: number }
): Promise<ChatMessage> {
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

/** Delete a chat session */
export async function deleteChatSession(sessionId: string): Promise<void> {
  await apiFetch<void>(`/chat/session/${sessionId}`, { method: "DELETE" });
}

export interface UserActivityItem {
  id: string;
  created_at: string;
  type: "chat" | "repo";
  title: string;
  subtitle?: string;
  repo_id?: string;
  repo_name?: string;
  session_id?: string;
}

/** Get all user activity items for activity heatmap */
export async function getUserActivity(): Promise<UserActivityItem[]> {
  return apiFetch<UserActivityItem[]>("/chat/activity");
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
  return apiFetch<any>(`/repos/${repoId}/summary`);
}

/** Get generated Mermaid diagrams for a repository */
export async function getRepoDiagrams(repoId: string, forceRefresh = false, diagramType?: string): Promise<RepoDiagrams> {
  const query = `force_refresh=${forceRefresh}${diagramType ? `&diagram_type=${diagramType}` : ''}`;
  return apiFetch<RepoDiagrams>(`/repos/${repoId}/diagrams?${query}`);
}

export async function getRepoFileContent(repoId: string, filePath: string): Promise<{ content: string }> {
  return apiFetch<{ content: string }>(`/repos/${repoId}/file?file_path=${encodeURIComponent(filePath)}`);
}

export async function getSystemHealth(): Promise<{ status: string }> {
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
  return apiFetch<any>("/subscription");
}

/** Upgrade/change user subscription plan */
export async function upgradeUserSubscription(plan: "free" | "pro"): Promise<any> {
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
  return apiFetch<any>("/pro-requests", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** Check the current user's Pro request status */
export async function getProRequestStatus(): Promise<any> {
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
  adminNotes?: string,
  durationDays?: number
): Promise<any> {
  return adminApiFetch<any>(`/admin/pro-requests/${requestId}/approve`, {
    method: "POST",
    body: JSON.stringify({
      admin_notes: adminNotes || null,
      duration_days: durationDays !== undefined ? durationDays : 365,
    }),
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

/** Delete a Pro request (admin only) */
export async function adminDeleteProRequest(requestId: string): Promise<any> {
  return adminApiFetch<any>(`/admin/pro-requests/${requestId}`, {
    method: "DELETE",
  });
}

/** List all users (admin only) */
export async function adminListUsers(): Promise<any[]> {
  return adminApiFetch<any[]>("/admin/users");
}

/** Get user details (admin only) */
export async function adminGetUserDetail(userId: string): Promise<any> {
  return adminApiFetch<any>(`/admin/users/${userId}`);
}

/** List all subscriptions (admin only) */
export async function adminListSubscriptions(): Promise<any[]> {
  return adminApiFetch<any[]>("/admin/subscriptions");
}

/** Update user subscription (admin only) */
export async function adminUpdateSubscription(
  userId: string,
  data: { plan: string; duration_days?: number | null; expires_at?: string | null }
): Promise<any> {
  return adminApiFetch<any>(`/admin/subscriptions/${userId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/** Revoke user subscription (admin only) */
export async function adminRevokeSubscription(userId: string): Promise<any> {
  return adminApiFetch<any>(`/admin/subscriptions/${userId}`, {
    method: "DELETE",
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

/** Record non-blocking anonymous page view */
export async function trackPageView(path: string, referrer?: string): Promise<void> {
  try {
    fetch(`${API_BASE}/analytics/pageview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, referrer: referrer || document.referrer || null }),
    }).catch(() => {});
  } catch {}
}

/** Fetch admin analytics summary & graph timeline */
export async function adminGetAnalytics(): Promise<any> {
  return adminApiFetch<any>("/admin/analytics");
}





