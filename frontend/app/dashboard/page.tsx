"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { listRepos, syncRepo, deleteRepo, type RepoItem } from "@/app/lib/api";
import styles from "./dashboard.module.css";

/* ── Icons ─────────────────────────────────────────────────────────── */
function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function RepoIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function FileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
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
function SyncIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}
function GraphIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="8" y="14" width="7" height="7" rx="1" />
      <line x1="6.5" y1="10" x2="6.5" y2="14" /><line x1="6.5" y1="14" x2="8" y2="14" />
      <line x1="17.5" y1="10" x2="17.5" y2="14" /><line x1="17.5" y1="14" x2="15" y2="14" />
    </svg>
  );
}
function BranchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────── */
function extractRepoInfo(url: string) {
  const parts = url.replace(/\/$/, "").split("/");
  const name = parts[parts.length - 1] || "repo";
  const owner = parts[parts.length - 2] || "";
  return { name, owner };
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ── Add Repo Modal ────────────────────────────────────────────────── */
function AddRepoModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!url.trim()) {
      setError("Please enter a GitHub repository URL.");
      return;
    }

    setLoading(true);
    try {
      await syncRepo(url.trim(), branch.trim() || "main");
      onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync repo");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h2 className={styles.modalTitle}>Add Repository</h2>
          <button className={styles.collapseBtn} onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <p className={styles.modalDesc}>
          Enter a public GitHub repository URL to start analyzing its codebase.
        </p>

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>GitHub URL</label>
            <input
              className={styles.formInput}
              type="url"
              placeholder="https://github.com/owner/repo"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Branch</label>
            <input
              className={styles.formInput}
              type="text"
              placeholder="main"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            />
          </div>

          {error && <p className={styles.formError}>{error}</p>}

          <div className={styles.modalActions}>
            <button
              type="button"
              className="btn btn-ghost btn-md"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-md"
              disabled={loading}
            >
              {loading ? "Syncing…" : "Start Sync"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Dashboard Page ────────────────────────────────────────────────── */
export default function DashboardPage() {
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const fetchRepos = useCallback(async () => {
    try {
      const data = await listRepos();
      setRepos(data);
    } catch {
      // API might not be connected yet — show empty state
      setRepos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  // Auto-refresh repos with processing status
  useEffect(() => {
    const hasProcessing = repos.some(
      (r) => r.status === "queued" || r.status === "processing"
    );
    if (!hasProcessing) return;

    const interval = setInterval(fetchRepos, 5000);
    return () => clearInterval(interval);
  }, [repos, fetchRepos]);

  const handleDelete = async (repoId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this repository and all its data?")) return;
    try {
      await deleteRepo(repoId);
      fetchRepos();
    } catch {
      // Silent fail
    }
  };

  const handleResync = async (repo: RepoItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await syncRepo(repo.github_url, repo.branch);
      fetchRepos();
    } catch {
      // Silent fail
    }
  };

  // Stats
  const totalRepos = repos.length;
  const completedRepos = repos.filter((r) => r.status === "completed").length;
  const processingRepos = repos.filter(
    (r) => r.status === "queued" || r.status === "processing"
  ).length;

  const statusClass = (status: string) => {
    switch (status) {
      case "queued": return styles.statusQueued;
      case "processing": return styles.statusProcessing;
      case "completed": return styles.statusCompleted;
      case "failed": return styles.statusFailed;
      default: return "";
    }
  };

  const statusDotClass = (status: string) => {
    switch (status) {
      case "queued": return styles.statusDotQueued;
      case "processing": return styles.statusDotProcessing;
      case "completed": return styles.statusDotCompleted;
      case "failed": return styles.statusDotFailed;
      default: return "";
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
        <div className={styles.loadingSpinner} />
      </div>
    );
  }

  return (
    <>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Repositories</h1>
          <p className={styles.pageSubtitle}>
            Manage your synced codebases and explore their knowledge graphs.
          </p>
        </div>
        <button
          className="btn btn-primary btn-md"
          onClick={() => setShowModal(true)}
        >
          <PlusIcon />
          Add Repository
        </button>
      </div>

      {/* Stats */}
      {repos.length > 0 && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statIconWrap}>
              <RepoIcon />
            </div>
            <div>
              <div className={styles.statValue}>{totalRepos}</div>
              <div className={styles.statLabel}>Total Repositories</div>
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statIconWrap}>
              <FileIcon />
            </div>
            <div>
              <div className={styles.statValue}>{completedRepos}</div>
              <div className={styles.statLabel}>Analyzed</div>
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statIconWrap}>
              <SyncIcon />
            </div>
            <div>
              <div className={styles.statValue}>{processingRepos}</div>
              <div className={styles.statLabel}>Active Syncs</div>
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statIconWrap}>
              <GraphIcon />
            </div>
            <div>
              <div className={styles.statValue}>{completedRepos}</div>
              <div className={styles.statLabel}>Knowledge Graphs</div>
            </div>
          </div>
        </div>
      )}

      {/* Repo Grid or Empty State */}
      {repos.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <RepoIcon />
          </div>
          <h3 className={styles.emptyTitle}>No repositories yet</h3>
          <p className={styles.emptyDesc}>
            Connect your first GitHub repository to start building its knowledge
            graph. GitMesh will parse the code, extract dependencies, and create
            interactive visualizations.
          </p>
          <button
            className="btn btn-primary btn-lg"
            onClick={() => setShowModal(true)}
          >
            <PlusIcon />
            Connect Your First Repo
          </button>
        </div>
      ) : (
        <div className={styles.repoGrid}>
          {repos.map((repo) => {
            const { name, owner } = extractRepoInfo(repo.github_url);
            return (
              <Link
                key={repo.id}
                href={`/dashboard/repo/${repo.id}`}
                className={styles.repoCard}
              >
                <div className={styles.repoCardHeader}>
                  <div>
                    <div className={styles.repoName}>{name}</div>
                    <div className={styles.repoOwner}>{owner}</div>
                  </div>
                  <span className={`${styles.statusBadge} ${statusClass(repo.status)}`}>
                    <span className={`${styles.statusDot} ${statusDotClass(repo.status)}`} />
                    {repo.status}
                  </span>
                </div>

                <div className={styles.repoBranch}>
                  <BranchIcon />
                  {repo.branch}
                </div>

                <div className={styles.repoCardFooter}>
                  <span className={styles.repoDate}>
                    {formatDate(repo.created_at)}
                  </span>
                  <div className={styles.repoActions}>
                    <button
                      className={styles.repoAction}
                      onClick={(e) => handleResync(repo, e)}
                      title="Re-sync"
                    >
                      <RefreshIcon />
                    </button>
                    <button
                      className={`${styles.repoAction} ${styles.repoActionDanger}`}
                      onClick={(e) => handleDelete(repo.id, e)}
                      title="Delete"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Add Repo Modal */}
      {showModal && (
        <AddRepoModal
          onClose={() => setShowModal(false)}
          onAdded={fetchRepos}
        />
      )}
    </>
  );
}
