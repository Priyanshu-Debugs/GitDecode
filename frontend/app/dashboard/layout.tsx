"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/lib/useAuth";
import { listRepos, syncRepo, listChatSessions, deleteChatSession, type RepoItem } from "@/app/lib/api";
import { isDeveloperAccount } from "@/app/lib/developers";
import styles from "./dashboard.module.css";
import DashboardLoader from "@/app/components/DashboardLoader";

/* ── Icons ─────────────────────────────────────────────────────────── */
function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}


function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}



function RefreshIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      <line x1="10" y1="11" x2="10" y2="17"></line>
      <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

/* ── Sidebar Layout Inner ───────────────────────────────────────────── */
function SidebarContent({ children }: { children: React.ReactNode }) {
  const { user, session, loading } = useAuth(true);
  const [collapsed, setCollapsed] = useState(false);
  
  const [repos, setRepos] = useState<RepoItem[]>(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("gitmesh_cached_repos");
      return cached ? JSON.parse(cached) : [];
    }
    return [];
  });
  const [repoUrlInput, setRepoUrlInput] = useState("");
  const [branchInput, setBranchInput] = useState("main");
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState("");

  const [githubRepos, setGithubRepos] = useState<any[]>([]);
  const [githubLoading, setGithubLoading] = useState(false);
  const [showGithubRepos, setShowGithubRepos] = useState(false);

  // Recent chats states
  const [recentChats, setRecentChats] = useState<any[]>([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);

  // Auto-collapse sidebar on mobile sizes
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setCollapsed(true);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleNavClick = (path: string) => {
    router.push(path);
    if (window.innerWidth < 768) {
      setCollapsed(true);
    }
  };

  /**
   * Extracts `username/repoName` from a GitHub URL for use in clean routes.
   * e.g. "https://github.com/Priyanshu/GitMesh" -> "/dashboard/repo/Priyanshu/GitMesh"
   */
  function githubUrlToRepoPath(githubUrl: string): string {
    try {
      const clean = githubUrl.replace(/\.git$/, "").replace(/\/$/, "");
      const parts = clean.split("/");
      const repoName = parts[parts.length - 1];
      const owner = parts[parts.length - 2];
      if (owner && repoName) return `/dashboard/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`;
    } catch {
      // fall through to fallback
    }
    return "/dashboard";
  }

  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeRepoId = searchParams.get("repo_id");
  const activeRepo = repos.find((r) => r.id === activeRepoId);
  const activeRepoStatus = activeRepo?.status;
  const currentTab = searchParams.get("tab") || "chat";

  // Detect the new /dashboard/repo/[username]/[repoName] path pattern
  const isRepoDetailPath = pathname.startsWith("/dashboard/repo/");
  const pathParts = pathname.split("/").filter(Boolean); // ['dashboard','repo','username','repoName']
  const pathUsername = isRepoDetailPath && pathParts.length >= 4 ? decodeURIComponent(pathParts[2]) : null;
  const pathRepoName = isRepoDetailPath && pathParts.length >= 4 ? decodeURIComponent(pathParts[3]) : null;

  // Find repo from path when on the new route (no repo_id in URL)
  const pathActiveRepo = isRepoDetailPath && pathUsername && pathRepoName
    ? repos.find((r) => {
        const parts = r.github_url.replace(/\.git$/, "").replace(/\/$/, "").split("/");
        return (
          parts[parts.length - 1] === pathRepoName &&
          parts[parts.length - 2] === pathUsername
        );
      })
    : null;

  // Unified display name: repo name only without username prefix
  const activeRepoDisplayName =
    isRepoDetailPath && pathRepoName
      ? pathRepoName
      : activeRepo?.github_url.split("/").pop();

  // Unified status: use path-resolved repo if on new route
  const effectiveRepoStatus = isRepoDetailPath ? pathActiveRepo?.status : activeRepoStatus;

  // Show tabs when: old route (repo_id in URL + completed) OR new route (repo found + completed)
  const showRepoTabs =
    (activeRepoId && activeRepoStatus === "completed") ||
    (isRepoDetailPath && effectiveRepoStatus === "completed");

  // Show breadcrumb when: old route has repo_id OR on new route with valid path segments
  const showBreadcrumb = !!activeRepoId || isRepoDetailPath;

  const handleTabChange = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    if (isRepoDetailPath && pathUsername && pathRepoName) {
      // Stay on the clean URL, just change the tab query param
      router.push(`/dashboard/repo/${encodeURIComponent(pathUsername)}/${encodeURIComponent(pathRepoName)}?${params.toString()}`);
    } else {
      router.push(`/dashboard?${params.toString()}`);
    }
  };

  const completedRepos = repos.filter((r) => r.status === "completed");

  // Load recent chat sessions across all completed repos (max 5)
  useEffect(() => {
    if (completedRepos.length === 0) {
      setRecentChats([]);
      return;
    }

    let active = true;
    async function loadAllSessions() {
      setChatsLoading(true);
      try {
        const allSessions: any[] = [];
        const promises = completedRepos.map(async (repo) => {
          try {
            const sessions = await listChatSessions(repo.id);
            return sessions.map((s) => ({
              ...s,
              repoId: repo.id,
              repoName: repo.github_url.split("/").pop() || "repository",
              repoUrl: repo.github_url,
            }));
          } catch {
            return [];
          }
        });

        const results = await Promise.all(promises);
        results.forEach((res) => {
          allSessions.push(...res);
        });

        // Sort by latest_at descending, slice to top 5
        const sorted = allSessions
          .sort((a, b) => new Date(b.latest_at).getTime() - new Date(a.latest_at).getTime())
          .slice(0, 5);

        if (active) {
          setRecentChats(sorted);
        }
      } catch (err) {
        console.error("Failed to load chat sessions", err);
      } finally {
        if (active) setChatsLoading(false);
      }
    }

    loadAllSessions();
    return () => {
      active = false;
    };
  }, [repos]);

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      setDeletingId(sessionId);
      await deleteChatSession(sessionId);
      
      // Remove from list optimistically
      setRecentChats((prev) => prev.filter((c) => c.session_id !== sessionId));
      
      // If deleting the active session, navigate away (reset view for the active repo)
      const currentSessionId = searchParams?.get("session_id");
      if (currentSessionId === sessionId) {
        const activeRepoId = searchParams?.get("repo_id");
        if (activeRepoId) {
          handleNavClick(`/dashboard?repo_id=${activeRepoId}&tab=chat`);
        } else {
          // If we are on a clean path /dashboard/repo/owner/name
          const pathSegments = pathname?.split("/").filter(Boolean);
          if (pathSegments && pathSegments.length >= 3 && pathSegments[0] === "dashboard" && pathSegments[1] === "repo") {
            handleNavClick(pathname!);
          } else {
             handleNavClick(`/dashboard`);
          }
        }
      }
    } catch (err) {
      console.error("Failed to delete session", err);
    } finally {
      setDeletingId(null);
    }
  };

  const fetchLayoutRepos = useCallback(async () => {
    try {
      const data = await listRepos();
      setRepos(data);
      if (typeof window !== "undefined") {
        localStorage.setItem("gitmesh_cached_repos", JSON.stringify(data));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchLayoutRepos();
    const interval = setInterval(fetchLayoutRepos, 5000);
    return () => clearInterval(interval);
  }, [fetchLayoutRepos]);

  // Load user public GitHub repos
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
  }, [user]);

  const handleSync = async (url: string, branch: string) => {
    setSyncError("");
    setSyncLoading(true);
    try {
      const res = await syncRepo(url.trim(), branch.trim() || "main");
      setRepoUrlInput("");
      fetchLayoutRepos();
      if (res && res.repo_id) {
        router.push(githubUrlToRepoPath(url.trim()));
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync requested failed.");
    } finally {
      setSyncLoading(false);
    }
  };


  const handleResync = async (repo: RepoItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await syncRepo(repo.github_url, repo.branch);
      fetchLayoutRepos();
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <DashboardLoader />
      </div>
    );
  }

  if (!user) return null;

  const githubName = user.user_metadata?.preferred_username || user.user_metadata?.user_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Developer";
  const initials = githubName.slice(0, 2).toUpperCase();
  const isMasterDeveloper = isDeveloperAccount(user);

  const activeSyncs = repos.filter(
    (r) => r.status === "queued" || r.status === "processing" || r.status === "failed"
  );

  return (
    <div className={styles.dashboardLayout}>
      {/* Mobile Sidebar Backdrop */}
      {!collapsed && (
        <div
          className={styles.sidebarOverlay}
          onClick={() => setCollapsed(true)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside
        className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : styles.sidebarOpen}`}
        style={{ display: "flex", flexDirection: "column" }}
      >
        <div className={styles.sidebarHeader}>
          {!collapsed && (
            <Link href="/" style={{ display: "flex", alignItems: "center" }}>
              <Image
                src="/gitmesh-logo-vector.svg"
                alt="GitMesh"
                width={120}
                height={32}
                className={styles.sidebarLogoImage}
                style={{ objectFit: "contain" }}
                priority
              />
            </Link>
          )}
          <button
            className={styles.collapseBtn}
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </button>
        </div>

        {/* Scrollable Sidebar Nav Container */}
        <nav className={styles.sidebarNav} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, padding: "16px 12px" }}>
          
          {/* Active Codebase Shortcut — old route: ?repo_id=, new route: /repo/username/name */}
          {!collapsed && (activeRepoId || isRepoDetailPath) && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6, borderBottom: "0.5px solid var(--color-border)", paddingBottom: 12, marginBottom: 12 }}>
              <div className={styles.sidebarQueueHeader} style={{ fontSize: "0.6875rem", letterSpacing: "0.05em", color: "var(--color-text-secondary)" }}>
                Active Codebase
              </div>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-white)", padding: "0 8px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                {isRepoDetailPath && pathRepoName
                  ? `${pathUsername}/${pathRepoName}`
                  : (repos.find(r => r.id === activeRepoId)?.github_url.split("/").pop() || "Repository")}
              </div>
              <div style={{ padding: "0 8px" }}>
                <span className={`${styles.statusBadge} ${styles.statusProcessing}`} style={{ fontSize: "0.65rem", padding: "2px 8px" }}>
                  <span className={`${styles.statusDot} ${styles.statusDotProcessing}`} />
                  Active Workspace
                </span>
              </div>
            </div>
          )}

          {/* Recent chats section */}
          {!collapsed && (
            <div className={styles.sidebarQueueSection} style={{ border: "none", padding: 0, background: "transparent", marginTop: 8 }}>
              <div className={styles.sidebarQueueHeader} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.6875rem", letterSpacing: "0.05em" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ChatIcon />
                  <span>Recent Conversations</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsNewChatModalOpen(true);
                  }}
                  className={styles.iconBtn}
                  style={{ opacity: 0.7, padding: 4 }}
                  title="New Chat"
                >
                  <PlusIcon />
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6, maxHeight: "300px", overflowY: "auto" }}>
                {chatsLoading && recentChats.length === 0 ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 12 }}>
                    <div className={styles.loadingSpinner} style={{ width: 12, height: 12 }} />
                  </div>
                ) : recentChats.length > 0 ? (
                  recentChats.map((chat) => {
                    const formattedDate = new Date(chat.latest_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    });
                    const isDeleting = deletingId === chat.session_id;
                    return (
                      <div
                        key={`${chat.repoId}-${chat.session_id}`}
                        onClick={() => {
                          if (isDeleting) return;
                          let navUrl = `/dashboard?repo_id=${chat.repoId}&session_id=${chat.session_id}&tab=chat`;
                          if (chat.repoUrl) {
                            const basePath = githubUrlToRepoPath(chat.repoUrl);
                            if (basePath !== "/dashboard") {
                              navUrl = `${basePath}?session_id=${chat.session_id}&tab=chat`;
                            }
                          }
                          handleNavClick(navUrl);
                        }}
                        className={`${styles.repoCard} ${styles.recentChatItem}`}
                        style={{
                           padding: 8,
                           cursor: isDeleting ? "default" : "pointer",
                           background: "rgba(255, 255, 255, 0.01)",
                           border: "0.5px solid rgba(255, 255, 255, 0.03)",
                           opacity: isDeleting ? 0.5 : 1,
                           position: "relative"
                        }}
                      >
                        <div style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--color-white)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", paddingRight: 24 }}>
                          {chat.repoName}
                        </div>
                        <div style={{ fontSize: "0.625rem", color: "var(--color-text-secondary)", marginTop: 2, display: "flex", justifyContent: "space-between" }}>
                          <span>id: {chat.session_id.slice(0, 8)}...</span>
                          <span>{formattedDate}</span>
                        </div>
                        <button
                          className={styles.deleteChatBtn}
                          onClick={(e) => handleDeleteSession(e, chat.session_id)}
                          style={{
                            position: "absolute",
                            top: 8,
                            right: 8,
                            padding: 4,
                            background: "transparent",
                            border: "none",
                            color: "var(--color-text-tertiary)",
                            cursor: "pointer",
                            display: isDeleting ? "none" : undefined
                          }}
                          title="Delete Session"
                        >
                          <TrashIcon />
                        </button>
                        {isDeleting && (
                          <div style={{ position: "absolute", top: 8, right: 8 }}>
                            <div className={styles.loadingSpinner} style={{ width: 12, height: 12 }} />
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div style={{ padding: "16px 8px", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: "0.6875rem", border: "0.5px dashed var(--color-border)", borderRadius: "var(--radius-sm)" }}>
                    No recent conversations.
                  </div>
                )}
              </div>
            </div>
          )}

        </nav>

        {/* Sidebar Footer empty */}
      </aside>

      {/* ── Main Workspace Area ── */}
      <div
        className={`${styles.mainArea} ${collapsed ? styles.mainAreaCollapsed : ""}`}
      >
        {/* Topbar */}
        <div className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button
              className={styles.mobileMenuBtn}
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Open menu" : "Close menu"}
            >
              <MenuIcon />
            </button>
            
            {/* Workspace Home Link */}
            <Link
              href="/dashboard"
              className={`${styles.topbarHomeLink} ${pathname === "/dashboard" && !activeRepoId ? styles.topbarHomeLinkActive : ""}`}
              title="Workspace Home"
            >
              <HomeIcon />
              <span className={styles.topbarHomeLabel}>Workspace Home</span>
            </Link>

            {showBreadcrumb && (
              <>
                <span className={styles.topbarSeparator}>/</span>
                <div className={styles.topbarActiveRepo}>
                  {activeRepoDisplayName || "Repository"}
                </div>
              </>
            )}
          </div>

          {/* Right Navigation & Profile Area */}
          <div className={styles.topbarRight}>
            {showRepoTabs && (
              <div className={styles.topbarNav}>
                <button
                  className={`${styles.topbarTab} ${currentTab === "chat" ? styles.topbarTabActive : ""}`}
                  onClick={() => handleTabChange("chat")}
                >
                  Chat
                </button>
                <button
                  className={`${styles.topbarTab} ${currentTab === "report" ? styles.topbarTabActive : ""}`}
                  onClick={() => handleTabChange("report")}
                >
                  Report
                </button>
                <button
                  className={`${styles.topbarTab} ${currentTab === "graph" ? styles.topbarTabActive : ""}`}
                  onClick={() => handleTabChange("graph")}
                >
                  Knowledge Graph
                </button>
                <button
                  className={`${styles.topbarTab} ${currentTab === "diagrams" ? styles.topbarTabActive : ""}`}
                  onClick={() => handleTabChange("diagrams")}
                >
                  Diagrams
                </button>
                <button
                  className={`${styles.topbarTab} ${currentTab === "insights" ? styles.topbarTabActive : ""}`}
                  onClick={() => handleTabChange("insights")}
                >
                  Insights
                </button>
              </div>
            )}

            <button
              onClick={() => router.push("/dashboard/settings")}
              className={styles.topbarSignOutBtn}
              title="Settings & API Keys"
            >
              <SettingsIcon />
            </button>

            <div 
              className={styles.topbarProfileWidget} 
              onClick={() => router.push("/dashboard/profile")}
              title="Developer Profile"
            >
              {user.user_metadata?.avatar_url ? (
                <div className={styles.topbarAvatar} style={{ overflow: "hidden", padding: 0 }}>
                  <img src={user.user_metadata.avatar_url} alt={githubName || "Profile"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              ) : (
                <div className={styles.topbarAvatar}>{initials}</div>
              )}
              <span className={styles.topbarProfileName} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {githubName}
                {isMasterDeveloper && (
                  <span style={{ 
                    fontSize: "0.6rem", 
                    background: "rgba(224, 138, 74, 0.12)", 
                    border: "1px solid #e08a4a", 
                    color: "#e08a4a", 
                    padding: "1px 6px", 
                    borderRadius: 4, 
                    fontFamily: "var(--font-mono)", 
                    fontWeight: 700,
                    letterSpacing: "0.02em"
                  }}>
                    Dev
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Page Content */}
        <div className={pathname === "/dashboard" ? styles.contentWorkspace : styles.content}>{children}</div>
      </div>

      {/* New Chat Modal */}
      {isNewChatModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
          onClick={() => setIsNewChatModalOpen(false)}
        >
          <div
            style={{
              background: "#0d0f12",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "400px",
              padding: "24px",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
              position: "relative"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px 0", fontSize: "1.125rem", color: "#fff", fontWeight: 600 }}>Start New Conversation</h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>Select a connected repository to begin a fresh chat.</p>
            
            <div className={styles.hideScrollbar} style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "300px", overflowY: "auto", paddingRight: 4 }}>
              {completedRepos.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "var(--color-text-tertiary)", fontSize: "0.875rem" }}>
                  No connected repositories found.
                </div>
              ) : (
                completedRepos.map(repo => {
                  const repoName = repo.github_url.split("/").pop() || "repository";
                  return (
                    <button
                      key={repo.id}
                      onClick={() => {
                        setIsNewChatModalOpen(false);
                        const basePath = githubUrlToRepoPath(repo.github_url);
                        if (basePath !== "/dashboard") {
                          handleNavClick(`${basePath}?tab=chat`);
                        } else {
                          handleNavClick(`/dashboard?repo_id=${repo.id}&tab=chat`);
                        }
                      }}
                      className={styles.repoCard}
                      style={{
                        padding: "12px",
                        textAlign: "left",
                        cursor: "pointer",
                        background: "rgba(255, 255, 255, 0.02)",
                        border: "1px solid rgba(255, 255, 255, 0.04)",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center",
                        gap: 12
                      }}
                    >
                      <GithubIcon />
                      <span style={{ fontSize: "0.875rem", color: "#fff", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {repoName}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <button
              onClick={() => setIsNewChatModalOpen(false)}
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                background: "transparent",
                border: "none",
                color: "var(--color-text-tertiary)",
                cursor: "pointer",
                padding: 4
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className={styles.loadingScreen}><DashboardLoader /></div>}>
      <SidebarContent>{children}</SidebarContent>
    </Suspense>
  );
}
