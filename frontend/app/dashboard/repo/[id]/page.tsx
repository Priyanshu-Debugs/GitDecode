"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ChatMarkdown } from "@/components/ui/ChatMarkdown";
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep
} from "@/components/ai-elements/chain-of-thought";
import {
  getRepoStatus,
  getGraphStats,
  getDependencyGraph,
  getFullGraph,
  getBlastRadius,
  streamChatMessage,
  getChatHistory,
  listChatSessions,
  type RepoSyncResponse,
  type GraphStats,
  type DependencyGraph,
  type BlastRadiusResult,
  type ChatMessage,
  submitChatFeedback,
  deleteChatMessage,
  getRepoFileContent,
} from "@/app/lib/api";
import styles from "./repo.module.css";
import dashStyles from "../../dashboard.module.css";
import NvlGraphViewer from "@/components/ui/NvlGraphViewer";
import ChatInput from "@/app/components/ChatInput";

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
  const isSubmittingRef = useRef(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [copiedMsgIds, setCopiedMsgIds] = useState<Set<string>>(new Set());
  const [feedbackState, setFeedbackState] = useState<Record<string, string>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // Thinking panel state
  const [activeThinkingMsgId, setActiveThinkingMsgId] = useState<string | null>(null);
  const isNearBottomRef = useRef(true);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const threshold = 150;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
    isNearBottomRef.current = isAtBottom;
  };
  const [isThinkingPanelOpen, setIsThinkingPanelOpen] = useState(false);

  // Blast radius state
  const [blastFile, setBlastFile] = useState("");
  const [blastResult, setBlastResult] = useState<BlastRadiusResult | null>(null);
  const [blastLoading, setBlastLoading] = useState(false);

  // File viewer state
  const [activeFileContent, setActiveFileContent] = useState<string | null>(null);
  const [activeFileName, setActiveFileName] = useState<string>("");
  const [isFileViewerOpen, setIsFileViewerOpen] = useState(false);
  const [fileViewerLoading, setFileViewerLoading] = useState(false);

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

  // Auto-scroll chat on new messages
  useEffect(() => {
    if (isNearBottomRef.current) {
      chatEndRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [messages]);

  // Force scroll to bottom when explicitly opening the chat tab
  useEffect(() => {
    if (activeTab === "chat") {
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "auto" });
        isNearBottomRef.current = true;
      }, 50);
    }
  }, [activeTab]);

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
    setActiveFileName(filePath);
    setIsFileViewerOpen(true);
    setFileViewerLoading(true);
    try {
       const res = await getRepoFileContent(repoId, filePath);
       setActiveFileContent(res.content);
    } catch(e) {
       setActiveFileContent("Error loading file content.");
    } finally {
       setFileViewerLoading(false);
    }
  };

  const handleSendChat = useCallback(async (queryParam?: string) => {
    const q = queryParam || chatInput;
    if (!q.trim() || chatLoading || isSubmittingRef.current) return;
    
    isSubmittingRef.current = true;
    setChatLoading(true);
    setChatInput("");
    
    isNearBottomRef.current = true;
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);

    const tempId = `temp-${Date.now()}`;
    const tempUserMsg: ChatMessage = {
      message_id: tempId,
      session_id: sessionId || "",
      role: "user",
      content: q,
      created_at: new Date().toISOString(),
      sources: [],
    };
    
    const tempAssistantId = `temp-ast-${Date.now()}`;
    const tempAssistantMsg: ChatMessage = {
      message_id: tempAssistantId,
      session_id: sessionId || "",
      role: "assistant",
      content: "",
      created_at: new Date().toISOString(),
      sources: [],
      thinking: [],
    };
    
    setMessages((prev) => [...prev, tempUserMsg, tempAssistantMsg]);

    let realMessageId = tempAssistantId;

    try {
      await streamChatMessage(repoId, q, sessionId || undefined, (type, content, extra) => {
        if (type === "message_id" && extra?.session_id) {
            setSessionId(extra.session_id);
            realMessageId = content;
            setMessages((prev) => prev.map(m => m.message_id === tempAssistantId ? { ...m, message_id: realMessageId, session_id: extra.session_id } : m));
        } else if (type === "user_message_id") {
            setMessages((prev) => prev.map(m => m.message_id === tempId ? { ...m, message_id: content } : m));
        } else if (type === "sources") {
            setMessages((prev) => prev.map(m => m.message_id === tempAssistantId || m.message_id === realMessageId ? { ...m, sources: content } : m));
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
        } else if (type === "done") {
            setChatLoading(false);
            isSubmittingRef.current = false;
        }
      });
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
      setChatLoading(false);
      isSubmittingRef.current = false;
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
        <div className={styles.mainChatWrapper}>
          <div className={styles.chatMainArea}>
            <div className={styles.chatMessages} onScroll={handleScroll}>
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
              {messages.map((msg, idx) => {
                let mainContent = msg.content || "";
                let thinkContent = "";
                if (mainContent.includes("<think>")) {
                  const parts = mainContent.split("</think>");
                  thinkContent = parts[0].replace("<think>", "").trim();
                  mainContent = parts.length > 1 ? parts.slice(1).join("</think>").trim() : "";
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
                  className={
                    msg.role === "user"
                      ? dashStyles.chatBubbleUser
                      : `${styles.chatMessage} ${styles.chatMessageAssistant}`
                  }
                >
                  {msg.role === "user" ? (
                    msg.content
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
                      
                      {mainContent ? (
                        <ChatMarkdown content={mainContent} />
                      ) : (
                        chatLoading && !isThinking && (
                          <div className={styles.typingDots} style={{ padding: "12px 0" }}>
                            <div className={styles.typingDot} />
                            <div className={styles.typingDot} />
                            <div className={styles.typingDot} />
                          </div>
                        )
                      )}

                      
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
              )})}
              <div ref={chatEndRef} />
            </div>

            <div style={{ width: "100%", maxWidth: "900px", margin: "0 auto", padding: "0 20px 24px 20px" }}>
              <ChatInput
                repoId={repoId}
                onSend={(query) => handleSendChat(query)}
                disabled={chatLoading && messages[messages.length-1]?.role === "user"}
                initialValue={chatInput}
              />
            </div>
          </div>
          
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
                       const lines = thinkText.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
                       lines.forEach((line, idx) => {
                           let text = line;
                           if (line.startsWith('- ') || line.startsWith('* ')) {
                               text = line.substring(2).trim();
                           }
                           
                           if (idx < steps.length) {
                               if (steps[idx].detail) {
                                   steps[idx].detail += `\n${text}`;
                               } else {
                                   steps[idx].detail = text;
                               }
                           } else if (steps.length > 0) {
                               steps[steps.length - 1].detail = steps[steps.length - 1].detail 
                                   ? steps[steps.length - 1].detail + `\n${text}` 
                                   : text;
                           } else {
                               steps.push({ title: "Analysis", detail: text });
                           }
                       });
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
                                    {step.detail}
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
             <div className={styles.thinkingPanelContent}>
                {fileViewerLoading ? (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--color-text-secondary)', padding: '20px' }}>
                       <div className={styles.typingDot} style={{ animationDelay: '0s' }} />
                       <div className={styles.typingDot} style={{ animationDelay: '0.2s' }} />
                       <div className={styles.typingDot} style={{ animationDelay: '0.4s' }} />
                       <span style={{ marginLeft: '8px' }}>Loading file...</span>
                    </div>
                ) : (
                    <ChatMarkdown content={`\`\`\`${activeFileName.split('.').pop() || 'text'}\n${activeFileContent || ''}\n\`\`\``} />
                )}
             </div>
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
