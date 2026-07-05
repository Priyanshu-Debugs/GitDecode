"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/lib/useAuth";
import { listRepos, deleteRepo, syncRepo, type RepoItem } from "@/app/lib/api";
import styles from "./dashboard.module.css";

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

function SignOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
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

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
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

/* ── Sidebar Layout Inner ───────────────────────────────────────────── */
function SidebarContent({ children }: { children: React.ReactNode }) {
  const { user, session, loading, signOut } = useAuth(true);
  const [collapsed, setCollapsed] = useState(false);
  
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [repoUrlInput, setRepoUrlInput] = useState("");
  const [branchInput, setBranchInput] = useState("main");
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState("");

  const [githubRepos, setGithubRepos] = useState<any[]>([]);
  const [githubLoading, setGithubLoading] = useState(false);
  const [showGithubRepos, setShowGithubRepos] = useState(false);

  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeRepoId = searchParams.get("repo_id");

  const fetchLayoutRepos = useCallback(async () => {
    try {
      const data = await listRepos();
      setRepos(data);
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

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Remove repository index?")) return;
    try {
      await deleteRepo(id);
      if (activeRepoId === id) {
        router.push("/dashboard");
      }
      fetchLayoutRepos();
    } catch {
      // ignore
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
        <div className={styles.loadingSpinner} />
      </div>
    );
  }

  if (!user) return null;

  const initials = (user.email || "U")
    .split("@")[0]
    .slice(0, 2)
    .toUpperCase();

  const activeSyncs = repos.filter(
    (r) => r.status === "queued" || r.status === "processing" || r.status === "failed"
  );
  
  const completedRepos = repos.filter((r) => r.status === "completed");

  return (
    <div className={styles.dashboardLayout}>
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside
        className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ""}`}
        style={{ display: "flex", flexDirection: "column" }}
      >
        <div className={styles.sidebarHeader}>
          {!collapsed && (
            <Link href="/">
              <Image
                src="/logo.svg"
                alt="GitMesh"
                width={100}
                height={24}
                className={styles.sidebarLogoImage}
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
          
          <Link
            href="/dashboard"
            className={`${styles.navItem} ${pathname === "/dashboard" && !activeRepoId ? styles.navItemActive : ""}`}
            onClick={() => router.push("/dashboard")}
          >
            <HomeIcon />
            {!collapsed && <span>Overview</span>}
          </Link>

          {/* Sync Ingestion Inputs (Left Sidebar Connection Hub) */}
          {!collapsed && (
            <div className={styles.sidebarQueueSection} style={{ border: "none", padding: 0, background: "transparent" }}>
              <div className={styles.sidebarQueueHeader} onClick={() => setShowGithubRepos(!showGithubRepos)} style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Connect Source</span>
                <span>{showGithubRepos ? "▼" : "▲"}</span>
              </div>

              {showGithubRepos ? (
                /* GitHub repo listing */
                githubLoading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 12 }}>
                    <div className={styles.loadingSpinner} style={{ width: 12, height: 12 }} />
                  </div>
                ) : githubRepos.length > 0 ? (
                  <div style={{ maxHeight: 150, overflowY: "auto", borderBottom: "0.5px solid var(--color-border)", marginBottom: 12 }}>
                    {githubRepos.map((gr) => {
                      const isSynced = repos.some(r => r.github_url === gr.html_url);
                      return (
                        <div
                          key={gr.id}
                          className={styles.userRepoRow}
                          onClick={() => !isSynced && handleSync(gr.html_url, gr.default_branch || "main")}
                          style={{ padding: "6px 8px", opacity: isSynced ? 0.4 : 1, cursor: isSynced ? "default" : "pointer" }}
                        >
                          <div className={styles.userRepoInfo}>
                            <span className={styles.userRepoName} style={{ fontSize: "0.75rem" }}>{gr.name}</span>
                            <span className={styles.userRepoOwner} style={{ fontSize: "0.625rem" }}>{gr.owner?.login}</span>
                          </div>
                          {!isSynced && <PlusIcon />}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ padding: "8px", fontSize: "0.6875rem", color: "var(--color-text-tertiary)", textAlign: "center" }}>
                    Authorize GitHub to import repos.
                  </div>
                )
              ) : null}

              {/* Custom Repo URL input */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 0" }}>
                <input
                  type="url"
                  className={styles.formInput}
                  placeholder="GitHub Repo URL..."
                  value={repoUrlInput}
                  onChange={(e) => setRepoUrlInput(e.target.value)}
                  style={{ fontSize: "0.6875rem", height: 26 }}
                />
                <div style={{ display: "flex", gap: 4 }}>
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder="branch (main)"
                    value={branchInput}
                    onChange={(e) => setBranchInput(e.target.value)}
                    style={{ fontSize: "0.6875rem", flex: 1, height: 26 }}
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleSync(repoUrlInput, branchInput)}
                    disabled={syncLoading || !repoUrlInput.trim()}
                    style={{ fontSize: "0.6875rem", height: 26, padding: "0 8px" }}
                  >
                    {syncLoading ? "..." : "Sync"}
                  </button>
                </div>
                {syncError && <p className={styles.formError} style={{ fontSize: "0.625rem", color: "var(--color-danger)" }}>{syncError}</p>}
              </div>
            </div>
          )}

          {/* Synced repos selector lists (Left Sidebar selection) */}
          {!collapsed && (
            <div className={styles.sidebarQueueSection} style={{ border: "none", padding: 0, background: "transparent" }}>
              <div className={styles.sidebarQueueHeader}>Synced Codebases</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
                {completedRepos.map((repo) => {
                  const parts = repo.github_url.split("/");
                  const name = parts[parts.length - 1] || "repo";
                  const owner = parts[parts.length - 2] || "";
                  const isActive = repo.id === activeRepoId;

                  return (
                    <div
                      key={repo.id}
                      onClick={() => router.push(`/dashboard?repo_id=${repo.id}`)}
                      className={styles.repoCard}
                      style={{
                        padding: 8,
                        gap: 4,
                        borderColor: isActive ? "rgba(176,30,10,0.5)" : "rgba(255,255,255,0.05)",
                        background: isActive ? "rgba(176,30,10,0.02)" : "var(--color-surface)",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--color-white)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {name}
                          </div>
                          <div style={{ fontSize: "0.625rem", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
                            {owner}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 4, marginLeft: 6 }}>
                          <button className={styles.repoAction} onClick={(e) => handleResync(repo, e)} title="Re-sync" style={{ padding: 2 }}>
                            <RefreshIcon />
                          </button>
                          <button className={`${styles.repoAction} ${styles.repoActionDanger}`} onClick={(e) => handleDelete(repo.id, e)} title="Delete" style={{ padding: 2 }}>
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {completedRepos.length === 0 && (
                  <div style={{ padding: "16px 8px", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: "0.6875rem", border: "0.5px dashed var(--color-border)", borderRadius: "var(--radius-sm)" }}>
                    No repositories synced.
                  </div>
                )}
              </div>
            </div>
          )}


        </nav>

        {/* Sidebar Footer User profile */}
        <div className={styles.sidebarFooter}>
          {!collapsed ? (
            <div className={styles.userSection} onClick={signOut}>
              <div className={styles.userAvatar}>{initials}</div>
              <div className={styles.userInfo}>
                <span className={styles.userName}>
                  {user.email?.split("@")[0]}
                </span>
                <span className={styles.userEmail}>{user.email}</span>
              </div>
              <SignOutIcon />
            </div>
          ) : (
            <button
              className={styles.collapseBtn}
              onClick={signOut}
              aria-label="Sign out"
              style={{ margin: "0 auto" }}
            >
              <SignOutIcon />
            </button>
          )}
        </div>
      </aside>

      {/* ── Main Workspace Area ── */}
      <div
        className={styles.mainArea}
        style={{ marginLeft: collapsed ? 72 : 260 }}
      >
        {/* Topbar */}
        <div className={styles.topbar}>
          <div className={styles.breadcrumb}>
            <span className={styles.breadcrumbCurrent}>
              {pathname === "/dashboard"
                ? "Overview"
                : pathname.includes("/repo/")
                  ? "Repository"
                  : "Dashboard"}
            </span>
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
    <Suspense fallback={<div className={styles.loadingScreen}><div className={styles.loadingSpinner} /></div>}>
      <SidebarContent>{children}</SidebarContent>
    </Suspense>
  );
}
