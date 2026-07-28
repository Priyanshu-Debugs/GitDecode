"use client";

import { useState, useEffect, useCallback } from "react";
import { Eye, EyeOff, RefreshCw, Search, Users, Activity, Layers, MessageSquare, FileText, CheckCircle2, XCircle, Clock } from "lucide-react";
import {
  adminLogin,
  adminListProRequests,
  adminGetProRequestStats,
  adminApproveProRequest,
  adminRejectProRequest,
  adminGetAnalytics,
} from "@/app/lib/api";
import AdminCharts from "@/app/components/AdminCharts";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Analytics & Graph Data State
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Check for stored token on mount
  useEffect(() => {
    const token = localStorage.getItem("gitdecode_admin_token");
    if (token) {
      setIsAuthenticated(true);
    }
  }, []);

  const fetchDashboardData = useCallback(async (filter?: string) => {
    setLoadingRequests(true);
    setLoadingAnalytics(true);
    try {
      const [listData, statsData, analyticsRes] = await Promise.all([
        adminListProRequests(filter === "all" ? undefined : filter),
        adminGetProRequestStats(),
        adminGetAnalytics().catch(() => null),
      ]);
      setRequests(listData);
      setStats(statsData);
      if (analyticsRes) {
        setAnalyticsData(analyticsRes);
      }
    } catch (err: any) {
      if (err.message?.includes("401") || err.message?.includes("expired") || err.message?.includes("token")) {
        localStorage.removeItem("gitdecode_admin_token");
        setIsAuthenticated(false);
      }
    } finally {
      setLoadingRequests(false);
      setLoadingAnalytics(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchDashboardData(activeFilter);
    }
  }, [isAuthenticated, activeFilter, fetchDashboardData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);

    try {
      const res = await adminLogin(password);
      localStorage.setItem("gitdecode_admin_token", res.token);
      setIsAuthenticated(true);
      setPassword("");
    } catch (err: any) {
      setLoginError(err.message || "Invalid password.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("gitdecode_admin_token");
    setIsAuthenticated(false);
  };

  const handleApprove = async (requestId: string) => {
    setActionLoading(requestId);
    try {
      await adminApproveProRequest(requestId);
      await fetchDashboardData(activeFilter);
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
      await fetchDashboardData(activeFilter);
    } catch (err: any) {
      alert("Failed to reject request: " + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Filter requests by search query
  const filteredRequests = requests.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.github_username?.toLowerCase().includes(q) ||
      r.email?.toLowerCase().includes(q) ||
      r.first_name?.toLowerCase().includes(q) ||
      r.last_name?.toLowerCase().includes(q)
    );
  });

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
            <p className={styles.terminalPrompt}>$ GitDecode Admin Terminal</p>
            <p className={styles.terminalNotice}>
              Enter system admin password to access analytics &amp; management dashboard.
            </p>

            <form onSubmit={handleLogin} className={styles.loginForm}>
              <div className={styles.loginInputWrap}>
                <span className={styles.promptSym}>&gt;</span>

                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password..."
                  className={styles.passwordInput}
                  autoFocus
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={styles.eyeBtn}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {loginError && (
                <div className={styles.loginError}>
                  <span>!</span> {loginError}
                </div>
              )}

              <button
                type="submit"
                className={styles.loginBtn}
                disabled={loginLoading}
              >
                {loginLoading ? "Verifying..." : "Authenticate →"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Fallback defaults for visitor & KPI analytics
  const visitors = analyticsData?.visitors || {
    today_pv: 0,
    today_uniques: 0,
    d7_pv: 0,
    d7_uniques: 0,
    d30_pv: 0,
    d30_uniques: 0,
    total_pv: 0,
    total_uniques: 0,
  };

  const systemKpis = analyticsData?.system_kpis || {
    total_repos: 0,
    total_chats: 0,
    total_reports: 0,
    pro_total: stats.total,
    pro_pending: stats.pending,
    pro_approved: stats.approved,
    pro_rejected: stats.rejected,
    conversion_rate: stats.total > 0 ? round((stats.approved / stats.total) * 100, 1) : 0,
  };

  const timelineData = analyticsData?.timeline || [];
  const topPagesData = analyticsData?.top_pages || [];

  return (
    <div className={styles.adminWrap}>
      {/* ── Top Header Toolbar ────────────────────────────────────── */}
      <header className={styles.adminHeader}>
        <div className={styles.headerLeft}>
          <span className={styles.logoBadge}>GitDecode // Admin Control Center</span>
          <span className={styles.livePulse} />
          <span className={styles.statusText}>Live Telemetry</span>
        </div>
        <div className={styles.headerRight}>
          <button
            onClick={() => fetchDashboardData(activeFilter)}
            className={styles.refreshBtn}
            title="Refresh analytics data"
            disabled={loadingAnalytics}
          >
            <RefreshCw size={14} className={loadingAnalytics ? styles.spinIcon : ""} />
            <span>Sync Telemetry</span>
          </button>
          <button onClick={handleLogout} className={styles.logoutBtn}>
            Exit Session
          </button>
        </div>
      </header>

      <div className={styles.mainContainer}>
        {/* ── Section Title ────────────────────────────────────────── */}
        <div className={styles.sectionHeadingRow}>
          <div>
            <h1 className={styles.dashboardTitle}>Operations &amp; Analytics Dashboard</h1>
            <p className={styles.dashboardSub}>
              // Real-time visitor counts, traffic timelines, usage telemetry, and Pro request conversions.
            </p>
          </div>
        </div>

        {/* ── Key Performance Metric Cards Grid ────────────────────── */}
        <div className={styles.kpiGrid}>
          {/* Card 1: Today Visitors */}
          <div className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <span className={styles.kpiLabel}>Today's Traffic</span>
              <Users size={16} className={styles.kpiIconGreen} />
            </div>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>{visitors.today_pv}</span>
              <span className={styles.kpiUnit}>views</span>
            </div>
            <p className={styles.kpiSub}>
              <span className={styles.highlightGreen}>{visitors.today_uniques}</span> unique visitors today
            </p>
          </div>

          {/* Card 2: Total Visitors */}
          <div className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <span className={styles.kpiLabel}>Total Site Visitors</span>
              <Activity size={16} className={styles.kpiIconAmber} />
            </div>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>{visitors.total_pv}</span>
              <span className={styles.kpiUnit}>total views</span>
            </div>
            <p className={styles.kpiSub}>
              <span className={styles.highlightAmber}>{visitors.total_uniques}</span> all-time unique visitors
            </p>
          </div>

          {/* Card 3: Ingested Repos */}
          <div className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <span className={styles.kpiLabel}>Repositories Parsed</span>
              <Layers size={16} className={styles.kpiIconGreen} />
            </div>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>{systemKpis.total_repos}</span>
              <span className={styles.kpiUnit}>repos</span>
            </div>
            <p className={styles.kpiSub}>AST code graph walks completed</p>
          </div>

          {/* Card 4: AI RAG Chats */}
          <div className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <span className={styles.kpiLabel}>AI RAG Messages</span>
              <MessageSquare size={16} className={styles.kpiIconAmber} />
            </div>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>{systemKpis.total_chats}</span>
              <span className={styles.kpiUnit}>queries</span>
            </div>
            <p className={styles.kpiSub}>Vector &amp; code graph answers</p>
          </div>

          {/* Card 5: Architecture Reports */}
          <div className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <span className={styles.kpiLabel}>Reports Generated</span>
              <FileText size={16} className={styles.kpiIconGreen} />
            </div>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>{systemKpis.total_reports}</span>
              <span className={styles.kpiUnit}>reports</span>
            </div>
            <p className={styles.kpiSub}>Deep risk &amp; onboarding guides</p>
          </div>

          {/* Card 6: Pro Upgrade Conversion */}
          <div className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <span className={styles.kpiLabel}>Pro Approval Rate</span>
              <CheckCircle2 size={16} className={styles.kpiIconGreen} />
            </div>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>{systemKpis.conversion_rate}%</span>
              <span className={styles.kpiUnit}>rate</span>
            </div>
            <p className={styles.kpiSub}>
              {stats.approved} approved of {stats.total} requests
            </p>
          </div>
        </div>

        {/* ── Interactive Visual Graphs & Charts Section ───────────── */}
        <AdminCharts
          timeline={timelineData}
          topPages={topPagesData}
          kpis={systemKpis}
        />

        {/* ── Pro Request Management Section ──────────────────────── */}
        <div className={styles.sectionHeaderRow}>
          <div>
            <h2 className={styles.sectionTitle}>Pro Upgrade Requests</h2>
            <p className={styles.sectionSub}>// Manage GOPROFREE coupon code submissions</p>
          </div>

          {/* Search Bar */}
          <div className={styles.searchBox}>
            <Search size={14} className={styles.searchIcon} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search user, name, email..."
              className={styles.searchInput}
            />
          </div>
        </div>

        {/* Filter Pills */}
        <div className={styles.filterBar}>
          <button
            onClick={() => setActiveFilter("all")}
            className={`${styles.filterTab} ${activeFilter === "all" ? styles.activeFilterTab : ""}`}
          >
            All Requests ({stats.total})
          </button>
          <button
            onClick={() => setActiveFilter("pending")}
            className={`${styles.filterTab} ${activeFilter === "pending" ? styles.activeFilterTab : ""}`}
          >
            <Clock size={12} /> Pending ({stats.pending})
          </button>
          <button
            onClick={() => setActiveFilter("approved")}
            className={`${styles.filterTab} ${activeFilter === "approved" ? styles.activeFilterTab : ""}`}
          >
            <CheckCircle2 size={12} /> Approved ({stats.approved})
          </button>
          <button
            onClick={() => setActiveFilter("rejected")}
            className={`${styles.filterTab} ${activeFilter === "rejected" ? styles.activeFilterTab : ""}`}
          >
            <XCircle size={12} /> Rejected ({stats.rejected})
          </button>
        </div>

        {/* Requests Data Table */}
        <div className={styles.tableCard}>
          {loadingRequests ? (
            <div className={styles.tableLoading}>
              <span className={styles.spinner} /> Loading Pro requests...
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className={styles.tableEmpty}>
              No requests found matching your filter or search query.
            </div>
          ) : (
            <div className={styles.tableResponsive}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>GitHub User</th>
                    <th>Applicant Name</th>
                    <th>Contact Email</th>
                    <th>Mobile</th>
                    <th>Coupon</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((req) => (
                    <tr key={req.id}>
                      <td>
                        <div className={styles.userCell}>
                          <span className={styles.ghUser}>@{req.github_username}</span>
                          <span className={styles.ghEmail}>{req.github_email}</span>
                        </div>
                      </td>
                      <td>
                        <span className={styles.applicantName}>
                          {req.first_name} {req.last_name}
                        </span>
                      </td>
                      <td>
                        <a href={`mailto:${req.email}`} className={styles.emailLink}>
                          {req.email}
                        </a>
                      </td>
                      <td className={styles.monoCell}>{req.mobile}</td>
                      <td>
                        <span className={styles.couponBadge}>{req.coupon_code}</span>
                      </td>
                      <td className={styles.monoCell}>
                        {req.created_at ? new Date(req.created_at).toLocaleDateString() : "N/A"}
                      </td>
                      <td>
                        <span
                          className={
                            req.status === "approved"
                              ? styles.badgeApproved
                              : req.status === "rejected"
                              ? styles.badgeRejected
                              : styles.badgePending
                          }
                        >
                          {req.status}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {req.status === "pending" ? (
                          <div className={styles.actionBtns}>
                            <button
                              onClick={() => handleApprove(req.id)}
                              className={styles.approveBtn}
                              disabled={actionLoading === req.id}
                            >
                              {actionLoading === req.id ? "..." : "Approve"}
                            </button>
                            <button
                              onClick={() => handleReject(req.id)}
                              className={styles.rejectBtn}
                              disabled={actionLoading === req.id}
                            >
                              {actionLoading === req.id ? "..." : "Reject"}
                            </button>
                          </div>
                        ) : (
                          <span className={styles.actionDoneText}>
                            {req.status === "approved" ? "✓ Active" : "✗ Rejected"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function round(val: number, dec: number) {
  return Number(Math.round(Number(val + "e" + dec)) + "e-" + dec);
}
