"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/lib/useAuth";
import { listRepos, deleteRepo, listChatSessions, getRepoSummary, getSystemHealth, type RepoItem } from "@/app/lib/api";
import { motion } from "framer-motion";
import styles from "../dashboard.module.css";

function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export default function ProfilePage() {
  const { user, loading: authLoading, signOut } = useAuth(true);
  const router = useRouter();
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [recentChats, setRecentChats] = useState<any[]>([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [repoSummaries, setRepoSummaries] = useState<{[key: string]: any}>({});
  const [healthStatus, setHealthStatus] = useState({
    api: "Checking...",
    supabase: "Checking...",
    neo4j: "Checking...",
    pgvector: "Checking..."
  });

  const fetchReposData = async () => {
    try {
      const data = await listRepos();
      setRepos(data);
      setReposLoading(false);
      return data;
    } catch (err) {
      console.error("Failed to load repositories", err);
      setReposLoading(false);
      return [];
    }
  };

  useEffect(() => {
    if (!user) return;

    // Check system health dynamically
    getSystemHealth()
      .then((res) => {
        if (res && res.status === "healthy") {
          setHealthStatus({
            api: "Active",
            supabase: "Connected",
            neo4j: "Linked",
            pgvector: "Enabled"
          });
        } else {
          setHealthStatus({
            api: "Degraded",
            supabase: "Connected",
            neo4j: "Unresolved",
            pgvector: "Degraded"
          });
        }
      })
      .catch((err) => {
        console.error("System health check failed", err);
        setHealthStatus({
          api: "Offline",
          supabase: "Connected", // logged in, meaning supabase auth functions are connected
          neo4j: "Offline",
          pgvector: "Disabled"
        });
      });
    
    fetchReposData().then(async (repoList) => {
      const completed = repoList.filter((r) => r.status === "completed");
      
      // Load summaries for each completed repo to get actual counts
      const summaries: {[key: string]: any} = {};
      await Promise.all(completed.map(async (repo) => {
        try {
          const summary = await getRepoSummary(repo.id);
          summaries[repo.id] = summary;
        } catch (err) {
          console.error("Failed to load summary for repo " + repo.id, err);
        }
      }));
      setRepoSummaries(summaries);

      if (completed.length === 0) {
        setRecentChats([]);
        setChatsLoading(false);
        return;
      }

      try {
        const allSessions: any[] = [];
        const promises = completed.map(async (repo) => {
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

        // Sort by latest_at descending, slice to top 15
        const sorted = allSessions
          .sort((a, b) => new Date(b.latest_at).getTime() - new Date(a.latest_at).getTime())
          .slice(0, 15);

        setRecentChats(sorted);
      } catch (err) {
        console.error("Failed to compile chat sessions history", err);
      } finally {
        setChatsLoading(false);
      }
    });
  }, [user]);

  const handleDeleteRepo = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name} from your indexed workspace?`)) return;
    try {
      await deleteRepo(id);
      fetchReposData();
    } catch (err) {
      console.error("Failed to delete repository", err);
    }
  };

  if (authLoading || !user) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingSpinner} />
      </div>
    );
  }

  const initials = (user.email || "U")
    .split("@")[0]
    .slice(0, 2)
    .toUpperCase();

  const completedCount = repos.filter((r) => r.status === "completed").length;

  // Real computed metrics derived from actual completed codebase summary properties
  const totalFilesIndexed = Object.values(repoSummaries).reduce((acc: number, curr: any) => acc + (curr?.total_files || 0), 0);
  const totalClasses = Object.values(repoSummaries).reduce((acc: number, curr: any) => acc + (curr?.total_classes || 0), 0);
  const totalFunctions = Object.values(repoSummaries).reduce((acc: number, curr: any) => acc + (curr?.total_functions || 0), 0);
  const totalEntities = totalClasses + totalFunctions;

  const getLanguageDistribution = () => {
    const counts: { [key: string]: number } = {};
    let total = 0;
    
    Object.values(repoSummaries).forEach((summary: any) => {
      if (summary?.languages) {
        summary.languages.forEach((lang: any) => {
          const name = lang.language || lang.name;
          const count = lang.count;
          if (name && count) {
            counts[name] = (counts[name] || 0) + count;
            total += count;
          }
        });
      }
    });

    if (total === 0) {
      return [];
    }

    const colorMap: { [key: string]: string } = {
      TypeScript: "#3178c6",
      JavaScript: "#f1e05a",
      Python: "#3572A5",
      Go: "#00ADD8",
      Rust: "#dea584",
      "C++": "#f34b7d",
      HTML: "#e34c26",
      CSS: "#563d7c",
    };

    return Object.entries(counts)
      .map(([name, count]) => ({
        name,
        percentage: Math.round((count / total) * 100),
        color: colorMap[name] || "#b01e0a",
      }))
      .sort((a, b) => b.percentage - a.percentage);
  };

  const languages = getLanguageDistribution();

  return (
    <div className={styles.profileContainer} style={{ position: "relative" }}>
      {/* repeating dot mesh grid background */}
      <div className={styles.dotMeshGrid} />
      {/* Ambient background glows */}
      <div style={{ position: "absolute", top: "-10%", left: "30%", width: "400px", height: "400px", background: "radial-gradient(circle, rgba(176, 30, 10, 0.08) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "absolute", bottom: "10%", right: "10%", width: "300px", height: "300px", background: "radial-gradient(circle, rgba(176, 30, 10, 0.04) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      {/* Header section */}
      <div className={styles.profileHeader} style={{ zIndex: 1, position: "relative" }}>
        <div className={styles.profileUserInfo}>
          <div className="relative flex items-center justify-center shrink-0">
            <motion.div
              className="absolute rounded-full bg-[rgba(176,30,10,0.12)]"
              animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
              style={{ width: 88, height: 88 }}
            />
            <div className={styles.profileAvatar} style={{ zIndex: 1, position: "relative" }}>
              {user.user_metadata?.avatar_url ? (
                <img src={user.user_metadata.avatar_url} alt={user.email} />
              ) : (
                <div className={styles.profileAvatarInitials}>{initials}</div>
              )}
            </div>
          </div>
          <div className={styles.profileDetails}>
            <h2 className={styles.profileEmail} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {user.email}
              <span style={{ fontSize: "0.6875rem", background: "rgba(176, 30, 10, 0.1)", border: "0.5px solid rgba(176, 30, 10, 0.3)", color: "#b01e0a", padding: "2px 8px", borderRadius: 4, fontFamily: "var(--font-mono)", fontWeight: 500 }}>
                CORE MEMBER
              </span>
            </h2>
            <span className={styles.profileMeta}>
              Connected via {user.app_metadata?.provider || "GitHub"} • ID: <code style={{ fontSize: "0.75rem", opacity: 0.7 }}>{user.id}</code>
            </span>
          </div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={signOut}
          style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--color-danger)", background: "rgba(239, 68, 68, 0.05)", border: "0.5px solid rgba(239, 68, 68, 0.2)", zIndex: 1 }}
        >
          <SignOutIcon />
          <span>Log Out</span>
        </button>
      </div>

      {/* Stats Bento Overview */}
      <div className={styles.profileStatsGrid} style={{ zIndex: 1, position: "relative" }}>
        {[
          { label: "Synced Codebases", value: completedCount, desc: "Successfully indexed dependency graphs" },
          { label: "AST Files Parsed", value: totalFilesIndexed, desc: "Abstract Syntax Trees tokenized" },
          { label: "AST Entities Mapped", value: totalEntities, desc: "Classes and functions linkage nodes resolved" },
          { label: "Active Chats", value: recentChats.length, desc: "Active conversation thread logs" }
        ].map((stat, idx) => (
          <motion.div
            key={stat.label}
            className={styles.profileStatCard}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: idx * 0.05, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className={styles.profileStatLabel}>{stat.label}</span>
            <span className={styles.profileStatValue}>{stat.value}</span>
            <span className={styles.profileStatDesc}>{stat.desc}</span>
          </motion.div>
        ))}
      </div>

      {/* Bento content details */}
      <div className={styles.profileBentoRow} style={{ zIndex: 1, position: "relative" }}>
        
        {/* Left Column Bento Panels */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          {/* Bento Card: Global Language Distribution */}
          <div className={styles.profileBentoCard} style={{ padding: "28px" }}>
            <h3 className={styles.profileCardTitle}>
              <CodeIcon />
              <span>Workspace Language distribution</span>
            </h3>
            <div className={styles.languageBarContainer}>
              {languages.length > 0 ? (
                languages.map((lang) => (
                  <div key={lang.name} className={styles.languageBarItem}>
                    <div className={styles.languageInfoRow}>
                      <span className={styles.languageLabel}>{lang.name}</span>
                      <span className={styles.languagePercent}>{lang.percentage}%</span>
                    </div>
                    <div className={styles.languageTrack}>
                      <motion.div
                        className={styles.languageFill}
                        style={{ background: lang.color }}
                        initial={{ width: "0%" }}
                        animate={{ width: `${lang.percentage}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: "20px", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: "0.75rem", border: "0.5px dashed var(--color-border)", borderRadius: "var(--radius-lg)" }}>
                  No language statistics available. Sync a repository to view analysis breakdown.
                </div>
              )}
            </div>
          </div>

          {/* Bento Card: API & Live Nodes Status */}
          <div className={styles.profileBentoCard} style={{ padding: "28px" }}>
            <h3 className={styles.profileCardTitle}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="2" width="20" height="8" rx="2" />
                <rect x="2" y="14" width="20" height="8" rx="2" />
                <line x1="6" y1="6" x2="6.01" y2="6" strokeWidth="3" />
                <line x1="6" y1="18" x2="6.01" y2="18" strokeWidth="3" />
              </svg>
              <span>System Node Health Monitor</span>
            </h3>
            <div className={styles.healthStatusGrid}>
              {[
                { name: "FastAPI Engine", status: healthStatus.api },
                { name: "Supabase Client", status: healthStatus.supabase },
                { name: "Neo4j Graph Store", status: healthStatus.neo4j },
                { name: "pgvector Vector DB", status: healthStatus.pgvector }
              ].map((node) => {
                const isActive = node.status === "Active" || node.status === "Connected" || node.status === "Linked" || node.status === "Enabled";
                const isChecking = node.status === "Checking...";
                const color = isActive ? "var(--color-success)" : isChecking ? "var(--color-warning)" : "var(--color-danger)";
                return (
                  <div key={node.name} className={styles.healthNodeCard}>
                    <span className={styles.healthNodeLabel}>{node.name}</span>
                    <div className={styles.healthNodeIndicator}>
                      <span className={styles.healthNodeStatusText} style={{ color }}>{node.status}</span>
                      <div className={styles.healthNodeDot} style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Right Column Bento Panels */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          {/* Bento Card: Recent chat sessions */}
          <div className={styles.profileBentoCard} style={{ padding: "28px" }}>
            <h3 className={styles.profileCardTitle}>
              <ChatIcon />
              <span>Recent Workspace Conversations</span>
            </h3>
            <div className={styles.profileRecentChatList}>
              {chatsLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}>
                  <div className={styles.loadingSpinner} />
                </div>
              ) : recentChats.length > 0 ? (
                recentChats.map((chat) => {
                  const formattedDate = new Date(chat.latest_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  return (
                    <div
                      key={`${chat.repoId}-${chat.session_id}`}
                      onClick={() => router.push(`/dashboard?repo_id=${chat.repoId}&session_id=${chat.session_id}`)}
                      className={styles.profileRecentChatItem}
                    >
                      <div>
                        <div className={styles.profileChatRepo}>{chat.repoName}</div>
                        <div className={styles.profileChatId}>Session ID: {chat.session_id}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span className={styles.profileChatTime}>{formattedDate}</span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ padding: "32px", textAlign: "center", color: "var(--color-text-tertiary)", border: "0.5px dashed var(--color-border)", borderRadius: "var(--radius-lg)" }}>
                  No active conversations found. Choose a codebase from the workspace home page to start.
                </div>
              )}
            </div>
          </div>

          {/* Bento Card: Connected repositories list */}
          <div className={styles.profileBentoCard} style={{ padding: "28px" }}>
            <h3 className={styles.profileCardTitle}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span>Workspace Codebases</span>
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "400px", overflowY: "auto" }}>
              {reposLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}>
                  <div className={styles.loadingSpinner} />
                </div>
              ) : repos.length > 0 ? (
                repos.map((repo) => {
                  const repoName = repo.github_url.split("/").pop() || "repo";
                  return (
                    <div
                      key={repo.id}
                      className={styles.profileRecentChatItem}
                      onClick={() => router.push(`/dashboard?repo_id=${repo.id}`)}
                      style={{ padding: "12px 16px" }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-white)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {repoName}
                        </div>
                        <div style={{ fontSize: "0.6875rem", color: "var(--color-text-secondary)", marginTop: 2 }}>
                          branch: {repo.branch}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRepo(repo.id, repoName);
                        }}
                        className={styles.repoAction}
                        style={{ padding: 6, color: "var(--color-danger)", background: "rgba(239, 68, 68, 0.05)", border: "0.5px solid rgba(239, 68, 68, 0.2)" }}
                        title="Delete"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  );
                })
              ) : (
                <div style={{ padding: "24px", textAlign: "center", color: "var(--color-text-tertiary)", border: "0.5px dashed var(--color-border)", borderRadius: "var(--radius-lg)", fontSize: "0.75rem" }}>
                  No synced repositories.
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
