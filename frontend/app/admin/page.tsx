"use client";

import { useState, useEffect, useCallback } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  adminLogin,
  adminListProRequests,
  adminGetProRequestStats,
  adminApproveProRequest,
  adminRejectProRequest,
} from "@/app/lib/api";
import styles from "./page.module.css";

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);


  const [requests, setRequests] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Check for stored token on mount
  useEffect(() => {
    const token = localStorage.getItem("gitmesh_admin_token");
    if (token) {
      setIsAuthenticated(true);
    }
  }, []);

  const fetchRequests = useCallback(async (filter?: string) => {
    setLoadingRequests(true);
    try {
      const [listData, statsData] = await Promise.all([
        adminListProRequests(filter === "all" ? undefined : filter),
        adminGetProRequestStats(),
      ]);
      setRequests(listData);
      setStats(statsData);
    } catch (err: any) {
      if (err.message?.includes("401") || err.message?.includes("expired") || err.message?.includes("token")) {
        localStorage.removeItem("gitmesh_admin_token");
        setIsAuthenticated(false);
      }
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchRequests(activeFilter);
    }
  }, [isAuthenticated, activeFilter, fetchRequests]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);

    try {
      const res = await adminLogin(password);
      localStorage.setItem("gitmesh_admin_token", res.token);
      setIsAuthenticated(true);
      setPassword("");
    } catch (err: any) {
      setLoginError(err.message || "Invalid password.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("gitmesh_admin_token");
    setIsAuthenticated(false);
  };

  const handleApprove = async (requestId: string) => {
    setActionLoading(requestId);
    try {
      await adminApproveProRequest(requestId);
      await fetchRequests(activeFilter);
    } catch (err: any) {
      alert("Failed to approve request: " + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!confirm("Are you sure you want to reject this request? An email will be sent to the user.")) {
      return;
    }
    setActionLoading(requestId);
    try {
      await adminRejectProRequest(requestId);
      await fetchRequests(activeFilter);
    } catch (err: any) {
      alert("Failed to reject request: " + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // ── 1. LOGIN SCREEN ──────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className={styles.loginWrap}>
        <div className={styles.loginTerminal}>
          <div className={styles.terminalHeader}>
            <span>admin_access.sh</span>
            <span className={styles.terminalTitle}>authentication</span>
          </div>
          <div className={styles.terminalBody}>
            <p className={styles.terminalPrompt}>$ GitMesh Admin Terminal</p>
            <p className={styles.terminalLog}>
              Enter admin password to access the Pro request management dashboard.
            </p>
            {loginError && <p className={styles.terminalError}>[!] {loginError}</p>}
            
            <form onSubmit={handleLogin}>
              <div className={styles.loginInputRow}>
                <span className={styles.terminalPrompt}>password:</span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoFocus
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={styles.togglePasswordBtn}
                  title={showPassword ? "Hide password" : "Show password"}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button

                type="submit"
                disabled={loginLoading || !password}
                className={styles.loginBtn}
              >
                {loginLoading ? "authenticating..." : "authenticate"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ── 2. ADMIN DASHBOARD SCREEN ─────────────────────────────────────
  return (
    <div className={styles.adminWrap}>
      {/* Top Bar */}
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <h1 className={styles.adminTitle}>
            <span style={{ color: "var(--color-green)" }}>Git</span>Mesh Admin
          </h1>
          <span className={styles.adminLabel}>admin_dashboard.py</span>
        </div>
        <button onClick={handleLogout} className={styles.logoutBtn}>
          logout
        </button>
      </div>

      {/* Stats Cards Row */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats.total}</span>
          <span className={styles.statLabel}>Total Requests</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue} style={{ color: "var(--color-secondary-accent)" }}>
            {stats.pending}
          </span>
          <span className={styles.statLabel}>Pending</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue} style={{ color: "var(--color-green)" }}>
            {stats.approved}
          </span>
          <span className={styles.statLabel}>Approved</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue} style={{ color: "var(--color-danger)" }}>
            {stats.rejected}
          </span>
          <span className={styles.statLabel}>Rejected</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className={styles.filterTabs}>
        {["all", "pending", "approved", "rejected"].map((f) => (
          <button
            key={f}
            className={`${styles.filterTab} ${activeFilter === f ? styles.filterTabActive : ""}`}
            onClick={() => setActiveFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Request List */}
      <div className={styles.requestList}>
        {loadingRequests ? (
          <div className={styles.emptyState}>
            <p>// Fetching requests from database...</p>
          </div>
        ) : requests.length === 0 ? (
          <div className={styles.emptyState}>
            <p>// No requests found matching filter '{activeFilter}'.</p>
          </div>
        ) : (
          requests.map((req) => (
            <div key={req.id} className={styles.requestCard}>
              {/* Card Header */}
              <div className={styles.requestHeader}>
                <span className={styles.requestId}>#{req.id.slice(0, 8)}</span>
                <span className={`${styles.statusBadge} ${styles[`status_${req.status}`]}`}>
                  {req.status.toUpperCase()}
                </span>
              </div>

              {/* User Info Grid */}
              <div className={styles.infoGrid}>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>github_username</span>
                  <span className={styles.infoValue}>@{req.github_username || "N/A"}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>user_id</span>
                  <span className={styles.infoValue}>{req.user_id}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>github_email</span>
                  <span className={styles.infoValue}>{req.github_email || "N/A"}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>full_name</span>
                  <span className={styles.infoValue}>
                    {req.first_name} {req.last_name}
                  </span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>contact_email</span>
                  <span className={styles.infoValue}>{req.email}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>mobile</span>
                  <span className={styles.infoValue}>{req.mobile}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>address</span>
                  <span className={styles.infoValue}>{req.address}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>coupon_code</span>
                  <span className={styles.infoValue} style={{ color: "var(--color-green)" }}>
                    {req.coupon_code}
                  </span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>submitted_at</span>
                  <span className={styles.infoValue}>
                    {new Date(req.created_at).toLocaleString()}
                  </span>
                </div>
                {req.reviewed_at && (
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>reviewed_at</span>
                    <span className={styles.infoValue}>
                      {new Date(req.reviewed_at).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons — only for pending */}
              {req.status === "pending" && (
                <div className={styles.actionButtons}>
                  <button
                    className={styles.approveBtn}
                    onClick={() => handleApprove(req.id)}
                    disabled={actionLoading === req.id}
                  >
                    {actionLoading === req.id ? "processing..." : "✓ Approve"}
                  </button>
                  <button
                    className={styles.rejectBtn}
                    onClick={() => handleReject(req.id)}
                    disabled={actionLoading === req.id}
                  >
                    ✗ Reject
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
