"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ChatMarkdown } from "@/components/ui/ChatMarkdown";
import {
  getRepoStatus,
  getGraphStats,
  getDependencyGraph,
  getFullGraph,
  getBlastRadius,
  sendChatMessage,
  getChatHistory,
  listChatSessions,
  type RepoSyncResponse,
  type GraphStats,
  type DependencyGraph,
  type BlastRadiusResult,
  type ChatMessage,
} from "@/app/lib/api";
import styles from "./repo.module.css";
import dashStyles from "../../dashboard.module.css";
import NvlGraphViewer from "@/components/ui/NvlGraphViewer";

/* ── Icons ─────────────────────────────────────────────────────────── */
function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

type Tab = "overview" | "graph" | "chat" | "blast";

function extractRepoName(url: string) {
  const parts = url.replace(/\/$/, "").split("/");
  return parts[parts.length - 1] || "Repository";
}

/* ═══════════════════════════════════════════════════════════════════
   Repo Detail Page
   ═══════════════════════════════════════════════════════════════════ */
export default function RepoDetailPage() {
  const params = useParams();
  const repoId = params.id as string;

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [repo, setRepo] = useState<RepoSyncResponse | null>(null);
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(true);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Blast radius state
  const [blastFile, setBlastFile] = useState("");
  const [blastResult, setBlastResult] = useState<BlastRadiusResult | null>(null);
  const [blastLoading, setBlastLoading] = useState(false);

  // Fetch repo info and stats
  useEffect(() => {
    async function load() {
      try {
        const [repoData, statsData] = await Promise.all([
          getRepoStatus(repoId),
          getGraphStats(repoId).catch(() => null),
        ]);
        setRepo(repoData);
        setStats(statsData);
      } catch {
        // Handle error
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [repoId]);

  // Fetch graph when tab switches
  useEffect(() => {
    if (activeTab === "graph" && !graph) {
      getFullGraph(repoId)
        .then(setGraph)
        .catch(() => {});
    }
  }, [activeTab, graph, repoId]);

  // Load existing chat sessions
  useEffect(() => {
    if (activeTab === "chat" && !sessionId) {
      listChatSessions(repoId).then((sessions) => {
        if (sessions.length > 0) {
          const sid = sessions[0].session_id;
          setSessionId(sid);
          getChatHistory(sid, repoId).then((history) => {
            setMessages(history.messages);
          });
        }
      }).catch(() => {});
    }
  }, [activeTab, sessionId, repoId]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendChat = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatLoading(true);

    // Optimistic user message
    const tempUserMsg: ChatMessage = {
      message_id: `temp-${Date.now()}`,
      session_id: sessionId || "",
      role: "user",
      content: msg,
      created_at: new Date().toISOString(),
      sources: [],
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const response = await sendChatMessage(repoId, msg, sessionId || undefined);
      if (!sessionId) setSessionId(response.session_id);
      setMessages((prev) => [...prev, response]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          message_id: `err-${Date.now()}`,
          session_id: sessionId || "",
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
          created_at: new Date().toISOString(),
          sources: [],
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, repoId, sessionId]);

  const handleBlastRadius = async () => {
    if (!blastFile.trim()) return;
    setBlastLoading(true);
    setBlastResult(null);
    try {
      const result = await getBlastRadius(repoId, blastFile.trim());
      setBlastResult(result);
    } catch {
      setBlastResult(null);
    } finally {
      setBlastLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
        <div className={dashStyles.loadingSpinner} />
      </div>
    );
  }

  const repoName = repo ? extractRepoName(repo.message) : "Repository";

  return (
    <>
      {/* Back Link */}
      <Link href="/dashboard" className={styles.backLink}>
        <BackIcon />
        Back to repositories
      </Link>

      {/* Header */}
      <div className={styles.repoHeader}>
        <div className={styles.repoTitleGroup}>
          <h1 className={styles.repoTitle}>{repoName}</h1>
          {repo && (
            <span
              className={`${dashStyles.statusBadge} ${
                repo.status === "completed"
                  ? dashStyles.statusCompleted
                  : repo.status === "processing"
                    ? dashStyles.statusProcessing
                    : repo.status === "failed"
                      ? dashStyles.statusFailed
                      : dashStyles.statusQueued
              }`}
            >
              <span
                className={`${dashStyles.statusDot} ${
                  repo.status === "completed"
                    ? dashStyles.statusDotCompleted
                    : repo.status === "processing"
                      ? dashStyles.statusDotProcessing
                      : repo.status === "failed"
                        ? dashStyles.statusDotFailed
                        : dashStyles.statusDotQueued
                }`}
              />
              {repo.status}
            </span>
          )}
        </div>
      </div>

      {/* Tab Bar */}
      <div className={styles.tabBar}>
        {(["overview", "graph", "chat", "blast"] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "overview"
              ? "Overview"
              : tab === "graph"
                ? "Graph Explorer"
                : tab === "chat"
                  ? "Chat"
                  : "Blast Radius"}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ───────────────────────────────────────── */}
      {activeTab === "overview" && (
        <>
          {stats && (
            <div className={styles.overviewStats}>
              {[
                { label: "Files", value: stats.files },
                { label: "Classes", value: stats.classes },
                { label: "Functions", value: stats.functions },
                { label: "Routes", value: stats.routes },
                { label: "Edges", value: stats.edges },
              ].map((s) => (
                <div key={s.label} className={styles.overviewStat}>
                  <div className={styles.overviewStatValue}>{s.value}</div>
                  <div className={styles.overviewStatLabel}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {!stats && (
            <div className={dashStyles.emptyState} style={{ padding: 48 }}>
              <h3 className={dashStyles.emptyTitle}>
                {repo?.status === "completed"
                  ? "Graph data loading..."
                  : "Repository is still being processed"}
              </h3>
              <p className={dashStyles.emptyDesc}>
                {repo?.status === "completed"
                  ? "Fetching knowledge graph statistics..."
                  : "Once the sync completes, you'll see file counts, classes, functions, and more."}
              </p>
            </div>
          )}
        </>
      )}

      {/* ── Graph Tab ──────────────────────────────────────────── */}
      {activeTab === "graph" && (
        <div className={styles.graphContainer} style={{ height: "600px" }}>
          {graph && graph.nodes.length > 0 ? (
            <NvlGraphViewer
              nodes={graph.nodes}
              edges={graph.edges}
              graphType="dep"
              repoId={repoId}
            />
          ) : (
            <div className={styles.graphEmptyMsg}>
              {graph ? "No dependency data found." : "Loading graph data..."}
            </div>
          )}
        </div>
      )}

      {/* ── Chat Tab ───────────────────────────────────────────── */}
      {activeTab === "chat" && (
        <div className={styles.chatContainer}>
          <div className={styles.chatMessages}>
            {messages.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--color-text-tertiary)" }}>
                <p style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 8 }}>
                  Ask anything about this codebase
                </p>
                <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.8125rem" }}>
                  Try &quot;How does authentication work?&quot; or &quot;Show me the dependency graph&quot;
                </p>
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.message_id}
                className={`${styles.chatMessage} ${
                  msg.role === "user"
                    ? styles.chatMessageUser
                    : styles.chatMessageAssistant
                }`}
              >
                {msg.role === "user" ? (
                  msg.content
                ) : (
                  <ChatMarkdown content={msg.content} />
                )}
              </div>
            ))}
            {chatLoading && (
              <div className={`${styles.chatMessage} ${styles.chatMessageAssistant}`}>
                <div className={styles.typingDots}>
                  <div className={styles.typingDot} />
                  <div className={styles.typingDot} />
                  <div className={styles.typingDot} />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className={styles.chatInputArea}>
            <input
              className={styles.chatInput}
              type="text"
              placeholder="Ask about this codebase..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
              disabled={chatLoading}
            />
            <button
              className={styles.chatSendBtn}
              onClick={handleSendChat}
              disabled={chatLoading || !chatInput.trim()}
            >
              <SendIcon />
            </button>
          </div>
        </div>
      )}

      {/* ── Blast Radius Tab ───────────────────────────────────── */}
      {activeTab === "blast" && (
        <div className={styles.blastContainer}>
          <div className={styles.sectionTitle}>
            Blast Radius Analysis
          </div>
          <p style={{
            fontFamily: "var(--font-sans)",
            fontSize: "0.8125rem",
            color: "var(--color-text-secondary)",
            marginBottom: 20,
            fontWeight: 300,
          }}>
            Enter a file path to see what would be affected if it changes.
          </p>

          <div className={styles.blastSearchBar}>
            <input
              className={dashStyles.formInput}
              type="text"
              placeholder="e.g. app/core/config.py"
              value={blastFile}
              onChange={(e) => setBlastFile(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleBlastRadius()}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-primary btn-md"
              onClick={handleBlastRadius}
              disabled={blastLoading || !blastFile.trim()}
            >
              {blastLoading ? "Analyzing…" : "Analyze"}
            </button>
          </div>

          {blastResult && (
            <>
              <div className={styles.blastRiskBadge}>
                {blastResult.affected_files.length} files affected
              </div>

              <div className={styles.blastResults}>
                {blastResult.affected_files.map((file) => (
                  <div key={file} className={styles.blastFileItem}>
                    <span className={styles.blastFileIcon}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                        <polyline points="13 2 13 9 20 9" />
                      </svg>
                    </span>
                    {file}
                  </div>
                ))}
                {blastResult.affected_files.length === 0 && (
                  <p style={{ color: "var(--color-text-tertiary)", fontSize: "0.8125rem", padding: 16 }}>
                    No downstream dependencies found for this file.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
