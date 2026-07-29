"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/app/lib/useAuth";
import { listRepos, listChatSessions, getRepoSummary, getUserActivity, type RepoItem, type UserActivityItem } from "@/app/lib/api";
import { useSubscription } from "@/app/lib/useSubscription";
import { motion } from "framer-motion";
import styles from "../dashboard.module.css";

interface HeatmapDay {
  dateStr: string;
  key: string;
  dayNumber: number;
  count: number;
  level: number;
}

interface MonthBlockData {
  monthName: string;
  year: number;
  weeks: (HeatmapDay | null)[][];
}

function formatLocalDateKey(d: Date): string {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
}

function computeActivityHeatmap(activityLogs: any[], recentChats: any[], repos: any[]) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const activityMap: { [key: string]: number } = {};

  if (Array.isArray(activityLogs)) {
    activityLogs.forEach((item) => {
      if (item?.created_at) {
        const k = formatLocalDateKey(new Date(item.created_at));
        activityMap[k] = (activityMap[k] || 0) + 1;
      }
    });
  }

  recentChats.forEach((chat) => {
    if (chat.latest_at) {
      const k = formatLocalDateKey(new Date(chat.latest_at));
      activityMap[k] = (activityMap[k] || 0) + 1;
    }
  });

  repos.forEach((repo) => {
    if (repo.created_at) {
      const k = formatLocalDateKey(new Date(repo.created_at));
      activityMap[k] = (activityMap[k] || 0) + 1;
    }
  });

  let totalSessions = 0;
  let peakCount = 0;
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  const monthBlocks: MonthBlockData[] = [];
  const startMonthDate = new Date(today.getFullYear(), today.getMonth() - 11, 1);
  const chronologicalDays: HeatmapDay[] = [];

  for (let m = 0; m < 12; m++) {
    const mDate = new Date(startMonthDate.getFullYear(), startMonthDate.getMonth() + m, 1);
    const yr = mDate.getFullYear();
    const mo = mDate.getMonth();
    const monthName = mDate.toLocaleDateString("en-US", { month: "short" });
    const daysInMonth = new Date(yr, mo + 1, 0).getDate();
    const firstDayOfWeek = new Date(yr, mo, 1).getDay(); // 0=Sun .. 6=Sat

    const weeks: (HeatmapDay | null)[][] = [];
    let currentWeekColumn: (HeatmapDay | null)[] = new Array(7).fill(null);

    let dayCounter = 1;
    let slot = firstDayOfWeek;

    while (dayCounter <= daysInMonth) {
      const dObj = new Date(yr, mo, dayCounter);
      const key = formatLocalDateKey(dObj);
      const dateStr = dObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

      // Strict real count & future date protection
      const isFuture = dObj.getTime() > today.getTime();
      const count = isFuture ? 0 : (activityMap[key] || 0);

      totalSessions += count;
      if (count > peakCount) peakCount = count;

      let level = 0;
      if (count === 1) level = 1;
      else if (count >= 2 && count <= 3) level = 2;
      else if (count >= 4 && count <= 6) level = 3;
      else if (count >= 7) level = 4;

      const dayItem: HeatmapDay = {
        dateStr,
        key,
        dayNumber: dayCounter,
        count,
        level,
      };

      chronologicalDays.push(dayItem);
      currentWeekColumn[slot] = dayItem;

      slot++;
      if (slot === 7 || dayCounter === daysInMonth) {
        weeks.push(currentWeekColumn);
        currentWeekColumn = new Array(7).fill(null);
        slot = 0;
      }
      dayCounter++;
    }

    monthBlocks.push({
      monthName: monthName,
      year: yr,
      weeks,
    });
  }

  // Filter past and today's days (exclude future days)
  const todayKey = formatLocalDateKey(new Date());
  const pastAndToday = chronologicalDays.filter((day) => {
    const dayDate = new Date(day.key + "T00:00:00");
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return dayDate.getTime() <= todayStart.getTime() + 86400000;
  });

  // Calculate Longest Streak
  pastAndToday.forEach((day) => {
    if (day.count > 0) {
      tempStreak++;
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
      }
    } else {
      tempStreak = 0;
    }
  });

  // Calculate Current Streak starting from Today or Yesterday
  let todayIndex = pastAndToday.findIndex((d) => d.key === todayKey);
  if (todayIndex === -1) {
    todayIndex = pastAndToday.length - 1;
  }

  if (todayIndex >= 0 && pastAndToday[todayIndex].count > 0) {
    for (let i = todayIndex; i >= 0; i--) {
      if (pastAndToday[i].count > 0) {
        currentStreak++;
      } else {
        break;
      }
    }
  } else if (todayIndex > 0 && pastAndToday[todayIndex - 1].count > 0) {
    for (let i = todayIndex - 1; i >= 0; i--) {
      if (pastAndToday[i].count > 0) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  return { monthBlocks, totalSessions, currentStreak, longestStreak, peakCount };
}

function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ChatQueryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function RepoSyncIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
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

function SignOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function getRelativeTimeString(dateInput: string | Date): string {
  const date = new Date(dateInput);
  const now = new Date();
  const diffSec = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));

  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  const diffYear = Math.floor(diffMonth / 12);
  return `${diffYear}y ago`;
}

export default function ProfilePage() {
  const { user, loading: authLoading, signOut } = useAuth(true);
  const { subscription, isPro } = useSubscription();
  const router = useRouter();
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [recentChats, setRecentChats] = useState<any[]>([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [repoSummaries, setRepoSummaries] = useState<{ [key: string]: any }>({});

  const [activityLogs, setActivityLogs] = useState<{ created_at: string; type: string }[]>([]);
  const [activityFilter, setActivityFilter] = useState<"all" | "chat" | "repo">("all");

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

    // Fetch real-time activity logs for heatmap
    getUserActivity().then((logs) => {
      if (Array.isArray(logs)) {
        setActivityLogs(logs);
      }
    }).catch((err) => {
      console.error("Failed to load activity logs", err);
    });

    fetchReposData().then(async (repoList) => {
      const completed = repoList.filter((r) => r.status === "completed");

      // Load summaries for each completed repo to get actual counts
      const summaries: { [key: string]: any } = {};
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

  if (authLoading || !user) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingSpinner} />
      </div>
    );
  }

  const githubName = user.user_metadata?.preferred_username || user.user_metadata?.user_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Developer";
  const initials = githubName.slice(0, 2).toUpperCase();


  const completedCount = repos.filter((r) => r.status === "completed").length;

  // Real computed metrics derived from actual completed codebase summary properties
  const totalFilesIndexed = Object.values(repoSummaries).reduce((acc: number, curr: any) => acc + (curr?.total_files || 0), 0);
  const totalClasses = Object.values(repoSummaries).reduce((acc: number, curr: any) => acc + (curr?.total_classes || 0), 0);
  const totalFunctions = Object.values(repoSummaries).reduce((acc: number, curr: any) => acc + (curr?.total_functions || 0), 0);
  const totalEntities = totalClasses + totalFunctions;

  const getLanguageDistribution = () => {
    const counts: { [key: string]: number } = {};
    let total = 0;

    const blacklist = new Set([
      "example", "examples", "test", "tests", "docs", "doc", "vendor",
      "node_modules", "config", "json", "yaml", "yml", "toml", "env",
      "gitignore", "md", "markdown", "txt", "lock", "svg", "png", "jpg",
      "jpeg", "gif", "ico", "woff", "woff2", "ttf", "eot", "pdf", "zip",
      "tar", "gz", "unknown", "build", "dist", "out", "temp", "tmp"
    ]);

    const aliasMap: { [key: string]: string } = {
      ts: "TypeScript",
      tsx: "TypeScript",
      typescript: "TypeScript",
      js: "JavaScript",
      jsx: "JavaScript",
      javascript: "JavaScript",
      py: "Python",
      python: "Python",
      go: "Go",
      golang: "Go",
      rs: "Rust",
      rust: "Rust",
      cpp: "C++",
      "c++": "C++",
      cc: "C++",
      cxx: "C++",
      c: "C",
      cs: "C#",
      "c#": "C#",
      csharp: "C#",
      java: "Java",
      kt: "Kotlin",
      kotlin: "Kotlin",
      swift: "Swift",
      php: "PHP",
      rb: "Ruby",
      ruby: "Ruby",
      sh: "Shell",
      bash: "Shell",
      shell: "Shell",
      sql: "SQL",
      html: "HTML",
      css: "CSS",
      scss: "CSS",
      less: "CSS",
      ipynb: "Jupyter Notebook",
      jupyter: "Jupyter Notebook",
      "jupyter notebook": "Jupyter Notebook",
    };

    Object.values(repoSummaries).forEach((summary: any) => {
      if (summary?.languages) {
        summary.languages.forEach((lang: any) => {
          const rawName = (lang.language || lang.name || "").toString().trim();
          const count = Number(lang.count) || 0;
          if (!rawName || count <= 0) return;

          const clean = rawName.toLowerCase();
          if (blacklist.has(clean)) return;

          const canonicalName = aliasMap[clean] || (rawName.charAt(0).toUpperCase() + rawName.slice(1));
          counts[canonicalName] = (counts[canonicalName] || 0) + count;
          total += count;
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
      C: "#555555",
      "C#": "#178600",
      Java: "#b07219",
      Kotlin: "#A97BFF",
      Swift: "#F05138",
      PHP: "#4F5D95",
      Ruby: "#701516",
      Shell: "#89e051",
      SQL: "#e38c00",
      HTML: "#e34c26",
      CSS: "#563d7c",
      "Jupyter Notebook": "#DA5B0B",
      Ipynb: "#DA5B0B",
      ipynb: "#DA5B0B",
    };

    return Object.entries(counts)
      .map(([name, count]) => ({
        name,
        percentage: Math.round((count / total) * 100),
        color: colorMap[name] || "#88a954",
      }))
      .filter((lang) => lang.percentage > 0)
      .sort((a, b) => b.percentage - a.percentage);
  };

  const languages = getLanguageDistribution();
  const heatmapData = computeActivityHeatmap(activityLogs, recentChats, repos);

  const recentActivityItems = (activityLogs as UserActivityItem[]).filter((item) => {
    if (activityFilter === "all") return true;
    return item.type === activityFilter;
  }).slice(0, 15);

  return (
    <div className={styles.profileContainer} style={{ position: "relative" }}>
      {/* repeating dot mesh grid background */}
      <div className={styles.dotMeshGrid} />
      {/* Ambient background glows */}
      <div style={{ position: "absolute", top: "-10%", left: "30%", width: "400px", height: "400px", background: "radial-gradient(circle, rgba(200, 204, 212, 0.08) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "absolute", bottom: "10%", right: "10%", width: "300px", height: "300px", background: "radial-gradient(circle, rgba(200, 204, 212, 0.04) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      {/* Header section */}
      <div className={styles.profileHeader} style={{ zIndex: 1, position: "relative" }}>
        <div className={styles.profileUserInfo}>
          <div className="relative flex items-center justify-center shrink-0">
            <motion.div
              className="absolute rounded-full"
              animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0, 0.4] }}
              transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
              style={{ width: 88, height: 88, background: "rgba(131, 193, 103, 0.15)" }}
            />
            <div className={styles.profileAvatar} style={{ zIndex: 1, position: "relative" }}>
              {user.user_metadata?.avatar_url ? (
                <img src={user.user_metadata.avatar_url} alt={githubName} />
              ) : (
                <div className={styles.profileAvatarInitials}>{initials}</div>
              )}
            </div>
          </div>
          <div className={styles.profileDetails}>
            <h2 className={styles.profileEmail} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {githubName}
              {isPro ? (
                <span style={{
                  fontSize: "0.7rem",
                  background: "rgba(212, 175, 55, 0.12)",
                  border: "1px solid #d4af37",
                  color: "#d4af37",
                  padding: "3px 10px",
                  borderRadius: 6,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  letterSpacing: "0.03em",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px"
                }}>
                  Pro Plan
                </span>
              ) : (
                <span style={{ fontSize: "0.6875rem", background: "rgba(136, 136, 136, 0.08)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)", padding: "2px 8px", borderRadius: 4, fontFamily: "var(--font-mono)", fontWeight: 500 }}>
                  Free Plan
                </span>
              )}
            </h2>
            <span className={styles.profileMeta}>
              Connected via {user.app_metadata?.provider || "GitHub"} • Email: <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--color-white)" }}>{user.email}</span>
              {isPro ? (
                <span style={{ marginLeft: 10, color: "#d4af37", fontWeight: 600 }}>
                  • Pro Access (Unlimited Repos, Chat, Reports)
                </span>
              ) : (
                <span style={{ marginLeft: 10, color: "var(--color-text-secondary)", fontWeight: 500 }}>
                  • Free Access (Limit: 2 Repos, 3 Daily Msg)
                </span>
              )}
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

      {/* TOP SECTION: Developer Activity & Query Streak */}
      <div className={styles.profileBentoCard} style={{ padding: "28px", zIndex: 1, position: "relative", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <h3 className={styles.profileCardTitle} style={{ margin: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>Developer Activity</span>
          </h3>
          
        </div>

        {/* Heatmap Header Metrics Bar */}
          <div className={styles.heatmapHeaderStats}>
            <div className={styles.heatmapStatItem}>
              <span className={styles.heatmapStatValue}>{heatmapData.currentStreak} Days</span>
              <span className={styles.heatmapStatLabel}>Current Streak</span>
            </div>
            <div className={styles.heatmapStatItem}>
              <span className={styles.heatmapStatValue}>{heatmapData.longestStreak} Days</span>
              <span className={styles.heatmapStatLabel}>Longest Streak</span>
            </div>
            <div className={styles.heatmapStatItem}>
              <span className={styles.heatmapStatValue}>{heatmapData.totalSessions}</span>
              <span className={styles.heatmapStatLabel}>Total Sessions</span>
            </div>
            <div className={styles.heatmapStatItem}>
              <span className={styles.heatmapStatValue}>{heatmapData.peakCount} / day</span>
              <span className={styles.heatmapStatLabel}>Peak Activity</span>
            </div>
          </div>

          {/* Heatmap Month-by-Month LeetCode Matrix */}
          <div className={styles.heatmapGridWrap}>
            <div className={styles.leetcodeHeatmapWrap}>
              {/* Day of Week Labels (Mon, Wed, Fri) */}
              <div className={styles.dayLabelsCol}>
                <span className={styles.dayLabelSpacer} />
                <span className={styles.dayLabel}>Mon</span>
                <span className={styles.dayLabelSpacer} />
                <span className={styles.dayLabel}>Wed</span>
                <span className={styles.dayLabelSpacer} />
              </div>

              {/* Scrollable Month Blocks (LeetCode Style) */}
              <div className={styles.leetcodeMonthsScroll}>
                {heatmapData.monthBlocks.map((block) => (
                  <div key={`${block.monthName}-${block.year}`} className={styles.leetcodeMonthBlock}>
                    {/* Grid of Weeks First */}
                    <div className={styles.leetcodeMonthWeeks}>
                      {block.weeks.map((weekCol, wIdx) => (
                        <div key={wIdx} className={styles.weekColumn}>
                          {weekCol.map((day, dIdx) =>
                            day ? (
                              <div
                                key={day.key}
                                className={`${styles.heatmapCell} ${styles[`heatmapLevel${day.level}`]}`}
                                title={`${day.count} activity session${day.count === 1 ? "" : "s"} on ${day.dateStr}`}
                              />
                            ) : (
                              <div key={dIdx} className={styles.heatmapCellHidden} />
                            )
                          )}
                        </div>
                      ))}
                    </div>
                    {/* Month Label at Bottom */}
                    <span className={styles.leetcodeMonthTitle}>{block.monthName}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.heatmapFooter}>
              <span style={{ fontSize: "0.6875rem", color: "var(--color-text-secondary)" }}>Past 12 Months</span>
              <div className={styles.heatmapLegend}>
                <span style={{ fontSize: "0.6875rem", color: "var(--color-text-secondary)", marginRight: 4 }}>Less</span>
                <div className={`${styles.heatmapCell} ${styles.heatmapLevel0}`} />
                <div className={`${styles.heatmapCell} ${styles.heatmapLevel1}`} />
                <div className={`${styles.heatmapCell} ${styles.heatmapLevel2}`} />
                <div className={`${styles.heatmapCell} ${styles.heatmapLevel3}`} />
                <div className={`${styles.heatmapCell} ${styles.heatmapLevel4}`} />
                <span style={{ fontSize: "0.6875rem", color: "var(--color-text-secondary)", marginLeft: 4 }}>More</span>
              </div>
            </div>
          </div>

          {/* Activity Breakdown Panel */}
          <div className={styles.activityPanel}>
            <div className={styles.activityHeader}>
              <div className={styles.activityTitleGroup}>
                <span className={styles.activityDateTitle}>Recent Activity Feed (Last 15 Logs)</span>
                <span className={styles.activityCountBadge}>
                  {recentActivityItems.length} {recentActivityItems.length === 1 ? "Log" : "Logs"}
                </span>
              </div>

              <div className={styles.activityFilterTabs}>
                <button
                  className={`${styles.activityFilterPill} ${activityFilter === "all" ? styles.activityFilterPillActive : ""}`}
                  onClick={() => setActivityFilter("all")}
                >
                  All
                </button>
                <button
                  className={`${styles.activityFilterPill} ${activityFilter === "chat" ? styles.activityFilterPillActive : ""}`}
                  onClick={() => setActivityFilter("chat")}
                >
                  Queries
                </button>
                <button
                  className={`${styles.activityFilterPill} ${activityFilter === "repo" ? styles.activityFilterPillActive : ""}`}
                  onClick={() => setActivityFilter("repo")}
                >
                  Syncs
                </button>
              </div>
            </div>

            <div className={styles.activityTimeline}>
              {recentActivityItems.length > 0 ? (
                recentActivityItems.map((item) => {
                  const relTime = getRelativeTimeString(item.created_at);
                  const exactTime = new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                  const realRepoName = (item.repo_name && item.repo_name !== "Repository" && item.repo_name !== "Codebase")
                    ? item.repo_name
                    : (repos.length > 0 ? (repos[0].github_url.split("/").pop() || "GitDecode") : "GitDecode");
                  const displaySubtitle = item.type === "chat" ? `Codebase: ${realRepoName}` : item.subtitle;

                  return (
                    <div key={item.id} className={styles.activityCard}>
                      <div className={styles.activityCardLeft}>
                        <div className={`${styles.activityTypeIcon} ${item.type === "chat" ? styles.activityTypeIconChat : styles.activityTypeIconRepo}`}>
                          {item.type === "chat" ? <ChatQueryIcon /> : <RepoSyncIcon />}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className={styles.activityCardTitle}>{item.title}</div>
                          {displaySubtitle && <div className={styles.activityCardSubtitle}>{displaySubtitle}</div>}
                        </div>
                      </div>

                      <div className={styles.activityCardRight}>
                        <span className={styles.activityTimeTag} title={exactTime}>{relTime}</span>
                        {item.type === "chat" && item.repo_id ? (
                          <button
                            className={styles.activityActionBtn}
                            onClick={() => router.push(`/dashboard?repo_id=${item.repo_id}${item.session_id ? `&session_id=${item.session_id}` : ""}`)}
                          >
                            Open Session →
                          </button>
                        ) : item.type === "repo" && item.repo_id ? (
                          <button
                            className={styles.activityActionBtn}
                            onClick={() => router.push(`/dashboard?repo_id=${item.repo_id}`)}
                          >
                            Open Codebase →
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className={styles.activityEmptyState}>
                  No recent activity logs recorded yet.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Bento content details */}
        <div className={styles.profileBentoRow} style={{ zIndex: 1, position: "relative" }}>

          {/* Left Column: Formatted Language Distribution Grid */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "24px" }}>
            <div className={styles.profileBentoCard} style={{ padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <h3 className={styles.profileCardTitle} style={{ margin: 0 }}>
                  <CodeIcon />
                  <span>Workspace Language Distribution</span>
                </h3>
                <span style={{ fontSize: "0.6875rem", color: "var(--color-green)", background: "rgba(131, 193, 103, 0.1)", border: "1px solid rgba(131, 193, 103, 0.2)", padding: "3px 10px", borderRadius: "12px", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                  {languages.length} {languages.length === 1 ? "Language" : "Languages"}
                </span>
              </div>

              {languages.length > 0 ? (
                <div className={styles.langGridFormatted}>
                  {languages.map((lang) => (
                    <div key={lang.name} className={styles.langGridCard}>
                      <div className={styles.langCardHeader}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className={styles.langCardDot} style={{ background: lang.color }} />
                          <span className={styles.langCardName}>{lang.name}</span>
                        </div>
                        <span className={styles.langCardBadge} style={{ color: lang.color, background: `${lang.color}15`, border: `1px solid ${lang.color}33` }}>
                          {lang.percentage}%
                        </span>
                      </div>

                      <div className={styles.langCardTrack}>
                        <motion.div
                          className={styles.langCardFill}
                          style={{ background: lang.color }}
                          initial={{ width: "0%" }}
                          animate={{ width: `${lang.percentage}%` }}
                          transition={{ duration: 0.7, ease: "easeOut" }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: "20px", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: "0.75rem", border: "0.5px dashed var(--color-border)", borderRadius: "var(--radius-lg)" }}>
                  No language statistics available. Sync a repository to view analysis breakdown.
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Connected Repositories */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "24px" }}>
            <div className={styles.profileBentoCard} style={{ padding: "24px" }}>
              <h3 className={styles.profileCardTitle} style={{ marginBottom: "16px" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span>Workspace Codebases</span>
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "300px", overflowY: "auto" }}>
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
                        style={{ padding: "10px 14px" }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-white)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {repoName}
                          </div>
                          <div style={{ fontSize: "0.6875rem", color: "var(--color-text-secondary)", marginTop: 2 }}>
                            branch: {repo.branch}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ padding: "20px", textAlign: "center", color: "var(--color-text-tertiary)", border: "0.5px dashed var(--color-border)", borderRadius: "var(--radius-lg)", fontSize: "0.75rem" }}>
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
