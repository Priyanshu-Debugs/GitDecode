"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/lib/useAuth";
import { listRepos, syncRepo, listChatSessions, type RepoItem } from "@/app/lib/api";
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

  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeRepoId = searchParams.get("repo_id");
  const activeRepo = repos.find((r) => r.id === activeRepoId);
  const activeRepoName = activeRepo?.github_url.split("/").pop();
  const activeRepoStatus = activeRepo?.status;
  const currentTab = searchParams.get("tab") || "chat";

  const handleTabChange = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`/dashboard?${params.toString()}`);
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
        router.push(`/dashboard?repo_id=${res.repo_id}`);
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
          
          {/* Active Codebase Shortcut */}
          {!collapsed && activeRepoId && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6, borderBottom: "0.5px solid var(--color-border)", paddingBottom: 12, marginBottom: 12 }}>
              <div className={styles.sidebarQueueHeader} style={{ fontSize: "0.6875rem", letterSpacing: "0.05em", color: "var(--color-text-secondary)" }}>
                Active Codebase
              </div>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-white)", padding: "0 8px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                {repos.find(r => r.id === activeRepoId)?.github_url.split("/").pop() || "Repository"}
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
              <div className={styles.sidebarQueueHeader} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.6875rem", letterSpacing: "0.05em" }}>
                <ChatIcon />
                <span>Recent Conversations</span>
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
                    return (
                      <div
                        key={`${chat.repoId}-${chat.session_id}`}
                        onClick={() => handleNavClick(`/dashboard?repo_id=${chat.repoId}&session_id=${chat.session_id}`)}
                        className={styles.repoCard}
                        style={{
                           padding: 8,
                           cursor: "pointer",
                           background: "rgba(255, 255, 255, 0.01)",
                           border: "0.5px solid rgba(255, 255, 255, 0.03)"
                        }}
                      >
                        <div style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--color-white)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                          {chat.repoName}
                        </div>
                        <div style={{ fontSize: "0.625rem", color: "var(--color-text-secondary)", marginTop: 2, display: "flex", justifyContent: "space-between" }}>
                          <span>id: {chat.session_id.slice(0, 8)}...</span>
                          <span>{formattedDate}</span>
                        </div>
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

            {activeRepoId && (
              <>
                <span className={styles.topbarSeparator}>/</span>
                <div className={styles.topbarActiveRepo}>
                  {activeRepoName || "Repository"}
                </div>
              </>
            )}
          </div>

          {/* Center Navigation Tabs (Only when repo is active and completed) */}
          {activeRepoId && activeRepoStatus === "completed" && (
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

          {/* Right Profile Widget */}
          <div className={styles.topbarRight}>
            <button
              onClick={() => router.push("/dashboard/settings")}
              className={styles.topbarSignOutBtn}
              title="Settings & API Keys"
              style={{ marginRight: 4 }}
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
              <span className={styles.topbarProfileName}>
                {githubName}
              </span>
            </div>

          </div>
        </div>

        {/* Page Content */}
        <div className={pathname === "/dashboard" ? styles.contentWorkspace : styles.content}>{children}</div>
      </div>
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
