"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { 
  Eye, 
  EyeOff, 
  RefreshCw, 
  Search, 
  Users, 
  Activity, 
  Layers, 
  MessageSquare, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Trash2, 
  Edit2, 
  UserCheck, 
  UserMinus, 
  ChevronDown, 
  ChevronUp, 
  Calendar,
  AlertTriangle
} from "lucide-react";
import {
  adminLogin,
  adminListProRequests,
  adminGetProRequestStats,
  adminApproveProRequest,
  adminRejectProRequest,
  adminDeleteProRequest,
  adminGetAnalytics,
  adminListUsers,
  adminGetUserDetail,
  adminListSubscriptions,
  adminUpdateSubscription,
  adminRevokeSubscription,
} from "@/app/lib/api";
import AdminCharts from "@/app/components/AdminCharts";
import styles from "./page.module.css";

type TabType = "overview" | "users" | "subscriptions" | "pro-requests";

function formatDate(dateInput: string | Date | null) {
  if (!dateInput) return "Lifetime / No Expiry";
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return "N/A";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<TabType>("overview");
  
  // Data States
  const [requests, setRequests] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [users, setUsers] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [analyticsData, setAnalyticsData] = useState<any>(null);

  // Loading States
  const [loadingData, setLoadingData] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");

  // Expanded Items
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [expandedUserDetail, setExpandedUserDetail] = useState<any>(null);
  const [loadingUserDetail, setLoadingUserDetail] = useState(false);

  // Modals & Action States
  const [toast, setToast] = useState<{ message: string; type: "success" | "warning" | "error" } | null>(null);
  const [editingSub, setEditingSub] = useState<any | null>(null);
  const [approveModalReq, setApproveModalReq] = useState<any | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [durationDays, setDurationDays] = useState<number>(365);
  const [customDaysVal, setCustomDaysVal] = useState<number>(30);
  const [customDaysUnit, setCustomDaysUnit] = useState<"days" | "months" | "years">("days");
  const [isCustomDuration, setIsCustomDuration] = useState(false);

  // Check for stored token on mount
  useEffect(() => {
    const token = localStorage.getItem("gitdecode_admin_token");
    if (token) {
      setIsAuthenticated(true);
    }
  }, []);

  const showToast = (message: string, type: "success" | "warning" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchDashboardData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [listData, statsData, analyticsRes, usersRes, subsRes] = await Promise.all([
        adminListProRequests(),
        adminGetProRequestStats(),
        adminGetAnalytics().catch(() => null),
        adminListUsers().catch(() => []),
        adminListSubscriptions().catch(() => []),
      ]);
      
      setRequests(listData);
      setStats(statsData);
      if (analyticsRes) setAnalyticsData(analyticsRes);
      setUsers(usersRes);
      setSubscriptions(subsRes);
    } catch (err: any) {
      if (err.message?.includes("401") || err.message?.includes("expired") || err.message?.includes("token")) {
        localStorage.removeItem("gitdecode_admin_token");
        setIsAuthenticated(false);
      } else {
        showToast("Error fetching telemetry: " + err.message, "error");
      }
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchDashboardData();
    }
  }, [isAuthenticated, fetchDashboardData]);

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

  // ── Pro Request Actions ──────────────────────────────────────────
  const openApproveModal = (req: any) => {
    setApproveModalReq(req);
    setAdminNotes(req.admin_notes || "");
    setDurationDays(365);
    setIsCustomDuration(false);
  };

  const handleApprove = async () => {
    if (!approveModalReq) return;
    const reqId = approveModalReq.id;
    setActionLoading(reqId);
    
    // Calculate final duration days
    let finalDays = durationDays;
    if (isCustomDuration) {
      if (customDaysUnit === "days") finalDays = customDaysVal;
      else if (customDaysUnit === "months") finalDays = customDaysVal * 30;
      else if (customDaysUnit === "years") finalDays = customDaysVal * 365;
    }

    try {
      const res = await adminApproveProRequest(reqId, adminNotes, finalDays);
      setApproveModalReq(null);
      if (res.warning) {
        showToast(`Approved successfully, but: ${res.warning}`, "warning");
      } else {
        showToast("Pro Upgrade Request Approved Successfully!");
      }
      await fetchDashboardData();
    } catch (err: any) {
      showToast("Failed to approve request: " + err.message, "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (reqId: string) => {
    const notes = prompt("Enter rejection notes (will be added to record):");
    if (notes === null) return; // cancelled
    
    setActionLoading(reqId);
    try {
      const res = await adminRejectProRequest(reqId, notes);
      if (res.warning) {
        showToast(`Rejected successfully, but: ${res.warning}`, "warning");
      } else {
        showToast("Pro Upgrade Request Rejected.");
      }
      await fetchDashboardData();
    } catch (err: any) {
      showToast("Failed to reject request: " + err.message, "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteProRequest = async (reqId: string) => {
    if (!confirm("Are you sure you want to permanently delete this request record? This cannot be undone.")) {
      return;
    }
    setActionLoading(reqId);
    try {
      await adminDeleteProRequest(reqId);
      showToast("Pro request record deleted.");
      await fetchDashboardData();
    } catch (err: any) {
      showToast("Failed to delete request: " + err.message, "error");
    } finally {
      setActionLoading(null);
    }
  };

  // ── User Activity & Details ──────────────────────────────────────
  const toggleExpandUser = async (userId: string) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
      setExpandedUserDetail(null);
      return;
    }
    
    setExpandedUser(userId);
    setLoadingUserDetail(true);
    try {
      const detail = await adminGetUserDetail(userId);
      setExpandedUserDetail(detail);
    } catch (err: any) {
      showToast("Failed to fetch user details: " + err.message, "error");
    } finally {
      setLoadingUserDetail(false);
    }
  };

  // ── Subscription Management CRUD ───────────────────────────────
  const openEditSub = (sub: any) => {
    setEditingSub(sub);
    setDurationDays(365);
    setIsCustomDuration(false);
  };

  const handleUpdateSubscription = async () => {
    if (!editingSub) return;
    setActionLoading(editingSub.user_id);

    let finalDays = durationDays;
    if (isCustomDuration) {
      if (customDaysUnit === "days") finalDays = customDaysVal;
      else if (customDaysUnit === "months") finalDays = customDaysVal * 30;
      else if (customDaysUnit === "years") finalDays = customDaysVal * 365;
    }

    try {
      await adminUpdateSubscription(editingSub.user_id, {
        plan: "pro",
        duration_days: finalDays,
      });
      showToast("Subscription updated successfully!");
      setEditingSub(null);
      await fetchDashboardData();
    } catch (err: any) {
      showToast("Failed to update subscription: " + err.message, "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevokePro = async (userId: string, email: string) => {
    if (!confirm(`Revoke Pro plan for user "${email}" and set them back to the Free plan?`)) {
      return;
    }
    setActionLoading(userId);
    try {
      await adminRevokeSubscription(userId);
      showToast("Subscription revoked. User is now back to Hobby Free tier.");
      await fetchDashboardData();
    } catch (err: any) {
      showToast("Failed to revoke subscription: " + err.message, "error");
    } finally {
      setActionLoading(null);
    }
  };

  // Filters & Search Helpers
  const getFilteredRequests = () => {
    return requests.filter((r) => {
      // 1. Filter by tab status
      if (activeFilter !== "all" && r.status !== activeFilter) return false;
      // 2. Search filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        r.github_username?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.first_name?.toLowerCase().includes(q) ||
        r.last_name?.toLowerCase().includes(q)
      );
    });
  };

  const getFilteredUsers = () => {
    return users.filter((u) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        u.email?.toLowerCase().includes(q) ||
        u.id?.toLowerCase().includes(q) ||
        u.user_metadata?.first_name?.toLowerCase().includes(q) ||
        u.user_metadata?.github_username?.toLowerCase().includes(q)
      );
    });
  };

  const getFilteredSubs = () => {
    return subscriptions.filter((s) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        s.email?.toLowerCase().includes(q) ||
        s.user_id?.toLowerCase().includes(q) ||
        s.plan?.toLowerCase().includes(q)
      );
    });
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
    today_pv: 0, today_uniques: 0, d7_pv: 0, d7_uniques: 0, d30_pv: 0, d30_uniques: 0, total_pv: 0, total_uniques: 0,
  };

  const systemKpis = analyticsData?.system_kpis || {
    total_repos: 0,
    total_chats: 0,
    total_reports: 0,
    pro_total: stats.total,
    pro_pending: stats.pending,
    pro_approved: stats.approved,
    pro_rejected: stats.rejected,
    conversion_rate: stats.total > 0 ? Number(((stats.approved / stats.total) * 100).toFixed(1)) : 0,
  };

  const timelineData = analyticsData?.timeline || [];
  const topPagesData = analyticsData?.top_pages || [];

  return (
    <div className={styles.adminWrap}>
      {/* ── Toast Notifications ───────────────────────────────────── */}
      {toast && (
        <div className={`${styles.toast} ${styles[`toast_${toast.type}`]}`}>
          {toast.type === "warning" && <AlertTriangle size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* ── Top Header Toolbar ────────────────────────────────────── */}
      <header className={styles.adminHeader}>
        <div className={styles.headerLeft}>
          <span className={styles.logoBadge}>GitDecode // Admin Control Center</span>
          <span className={styles.livePulse} />
          <span className={styles.statusText}>Live Telemetry</span>
        </div>
        <div className={styles.headerRight}>
          <button
            onClick={fetchDashboardData}
            className={styles.refreshBtn}
            title="Refresh dashboard data"
            disabled={loadingData}
          >
            <RefreshCw size={14} className={loadingData ? styles.spinIcon : ""} />
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

        {/* ── Tabbed Navigation Menu ───────────────────────────────── */}
        <div className={styles.navigationTabs}>
          <button 
            onClick={() => { setActiveTab("overview"); setSearchQuery(""); }} 
            className={`${styles.tabBtn} ${activeTab === "overview" ? styles.tabBtnActive : ""}`}
          >
            System Overview
          </button>
          <button 
            onClick={() => { setActiveTab("users"); setSearchQuery(""); }} 
            className={`${styles.tabBtn} ${activeTab === "users" ? styles.tabBtnActive : ""}`}
          >
            Users ({users.length})
          </button>
          <button 
            onClick={() => { setActiveTab("subscriptions"); setSearchQuery(""); }} 
            className={`${styles.tabBtn} ${activeTab === "subscriptions" ? styles.tabBtnActive : ""}`}
          >
            Active Subscriptions ({subscriptions.length})
          </button>
          <button 
            onClick={() => { setActiveTab("pro-requests"); setSearchQuery(""); }} 
            className={`${styles.tabBtn} ${activeTab === "pro-requests" ? styles.tabBtnActive : ""}`}
          >
            Pro Requests ({requests.length})
          </button>
        </div>

        {/* ── Search Toolbar (except overview) ─────────────────────── */}
        {activeTab !== "overview" && (
          <div className={styles.searchToolbar}>
            <div className={styles.searchBox}>
              <Search size={14} className={styles.searchIcon} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  activeTab === "users" 
                    ? "Search users by email, name, github user..."
                    : activeTab === "subscriptions"
                    ? "Search subscriptions by email or status..."
                    : "Search pro requests by user details..."
                }
                className={styles.searchInput}
              />
            </div>
            {activeTab === "pro-requests" && (
              <div className={styles.filterPills}>
                <button
                  onClick={() => setActiveFilter("all")}
                  className={`${styles.filterPill} ${activeFilter === "all" ? styles.activeFilterPill : ""}`}
                >
                  All ({stats.total})
                </button>
                <button
                  onClick={() => setActiveFilter("pending")}
                  className={`${styles.filterPill} ${activeFilter === "pending" ? styles.activeFilterPill : ""}`}
                >
                  Pending ({stats.pending})
                </button>
                <button
                  onClick={() => setActiveFilter("approved")}
                  className={`${styles.filterPill} ${activeFilter === "approved" ? styles.activeFilterPill : ""}`}
                >
                  Approved ({stats.approved})
                </button>
                <button
                  onClick={() => setActiveFilter("rejected")}
                  className={`${styles.filterPill} ${activeFilter === "rejected" ? styles.activeFilterPill : ""}`}
                >
                  Rejected ({stats.rejected})
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Tab 1: OVERVIEW TAB ──────────────────────────────────── */}
        {activeTab === "overview" && (
          <>
            {/* KPI Cards Grid */}
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

            {/* Interactive charts */}
            <AdminCharts
              timeline={timelineData}
              topPages={topPagesData}
              kpis={systemKpis}
            />
          </>
        )}

        {/* ── Tab 2: USERS TAB ─────────────────────────────────────── */}
        {activeTab === "users" && (
          <div className={styles.tableCard}>
            {loadingData ? (
              <div className={styles.tableLoading}>
                <span className={styles.spinner} /> Loading user directory...
              </div>
            ) : getFilteredUsers().length === 0 ? (
              <div className={styles.tableEmpty}>No users found.</div>
            ) : (
              <div className={styles.tableResponsive}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ width: "40px" }} />
                      <th>User Info</th>
                      <th>OAuth Provider</th>
                      <th>Last Active</th>
                      <th>Created</th>
                      <th>Current Plan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredUsers().map((u) => {
                      const isExpanded = expandedUser === u.id;
                      const hasAvatar = !!u.user_metadata?.avatar_url;
                      return (
                        <Fragment key={u.id}>
                          <tr className={styles.userRow}>
                            <td>
                              <button 
                                onClick={() => toggleExpandUser(u.id)}
                                className={styles.expandRowBtn}
                              >
                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </button>
                            </td>
                            <td>
                              <div className={styles.userInfoCell}>
                                {hasAvatar ? (
                                  <img 
                                    src={u.user_metadata.avatar_url} 
                                    alt="Avatar" 
                                    className={styles.userAvatar} 
                                  />
                                ) : (
                                  <div className={styles.userAvatarPlaceholder}>
                                    {u.email?.charAt(0).toUpperCase() || "U"}
                                  </div>
                                )}
                                <div className={styles.userInfoText}>
                                  <span className={styles.userEmail}>{u.email}</span>
                                  {u.user_metadata?.full_name && (
                                    <span className={styles.userFullName}>{u.user_metadata.full_name}</span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className={styles.providerBadge}>
                                {u.app_metadata?.provider || "email"}
                              </span>
                            </td>
                            <td className={styles.monoCell}>
                              {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "Never"}
                            </td>
                            <td className={styles.monoCell}>
                              {formatDate(u.created_at)}
                            </td>
                            <td>
                              <span className={u.plan === "pro" ? styles.badgeApproved : styles.badgePending}>
                                {u.plan.toUpperCase()}
                              </span>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className={styles.expandedRow}>
                              <td colSpan={6}>
                                <div className={styles.expandedUserContainer}>
                                  {loadingUserDetail ? (
                                    <div className={styles.expandedLoader}>
                                      <span className={styles.spinner} /> Querying DB logs for active session telemetry...
                                    </div>
                                  ) : expandedUserDetail ? (
                                    <div className={styles.expandedDetailGrid}>
                                      <div className={styles.detailSec}>
                                        <h4>Usage Telemetry</h4>
                                        <p><strong>Total Codebases:</strong> {expandedUserDetail.repos_count}</p>
                                        <p><strong>RAG Queries Sent:</strong> {expandedUserDetail.chats_count}</p>
                                        <p><strong>Account UUID:</strong> <span className={styles.monoCell}>{expandedUserDetail.id}</span></p>
                                      </div>
                                      <div className={styles.detailSec}>
                                        <h4>Plan Metadata</h4>
                                        {expandedUserDetail.subscription ? (
                                          <>
                                            <p><strong>Plan Tier:</strong> {expandedUserDetail.subscription.plan?.toUpperCase()}</p>
                                            <p><strong>Expires At:</strong> {expandedUserDetail.subscription.expires_at ? new Date(expandedUserDetail.subscription.expires_at).toLocaleString() : "Lifetime"}</p>
                                            <p><strong>Started At:</strong> {new Date(expandedUserDetail.subscription.started_at).toLocaleString()}</p>
                                          </>
                                        ) : (
                                          <p>No active subscription row (default Free Hobby limit tier).</p>
                                        )}
                                      </div>
                                      <div className={`${styles.detailSec} ${styles.detailSecFull}`}>
                                        <h4>Recent User Logins &amp; Repo Activity</h4>
                                        {expandedUserDetail.activity && expandedUserDetail.activity.length > 0 ? (
                                          <div className={styles.activityTimeline}>
                                            {expandedUserDetail.activity.slice(0, 5).map((act: any) => (
                                              <div key={act.id} className={styles.activityItem}>
                                                <span className={styles.activityTime}>{new Date(act.created_at).toLocaleString()}</span>
                                                <div className={styles.activityContent}>
                                                  <strong>{act.title}</strong>
                                                  <span>{act.subtitle}</span>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <p className={styles.emptyNotice}>No codebase syncs or chat messages logged yet.</p>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <p className={styles.errorNotice}>Failed to fetch data logs.</p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Tab 3: SUBSCRIPTIONS TAB ──────────────────────────────── */}
        {activeTab === "subscriptions" && (
          <div className={styles.tableCard}>
            {loadingData ? (
              <div className={styles.tableLoading}>
                <span className={styles.spinner} /> Querying billing logs...
              </div>
            ) : getFilteredSubs().length === 0 ? (
              <div className={styles.tableEmpty}>No active subscriptions found.</div>
            ) : (
              <div className={styles.tableResponsive}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Account Email</th>
                      <th>Plan Level</th>
                      <th>Upgrade Date</th>
                      <th>Expiration Date</th>
                      <th>Status</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredSubs().map((sub) => {
                      const expires = sub.expires_at ? new Date(sub.expires_at) : null;
                      const isExpired = expires ? expires < new Date() : false;
                      return (
                        <tr key={sub.user_id}>
                          <td>
                            <div className={styles.userInfoCell}>
                              {sub.avatar_url ? (
                                <img 
                                  src={sub.avatar_url} 
                                  alt="Avatar" 
                                  className={styles.userAvatar} 
                                />
                              ) : (
                                <div className={styles.userAvatarPlaceholder}>
                                  {sub.email?.charAt(0).toUpperCase() || "U"}
                                </div>
                              )}
                              <div className={styles.userInfoText}>
                                <span className={styles.userEmail}>{sub.name || "No Name"}</span>
                                <span className={styles.userFullName}>{sub.email}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={sub.plan === "pro" ? styles.badgeApproved : styles.badgePending}>
                              {sub.plan?.toUpperCase()}
                            </span>
                          </td>
                          <td className={styles.monoCell}>
                            {formatDate(sub.started_at)}
                          </td>
                          <td className={styles.monoCell}>
                            {formatDate(sub.expires_at)}
                          </td>
                          <td>
                            {isExpired ? (
                              <span className={styles.badgeExpired}>Expired</span>
                            ) : (
                              <span className={styles.badgeActive}>Active</span>
                            )}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div className={styles.actionBtns}>
                              <button 
                                onClick={() => openEditSub(sub)}
                                className={styles.editBtn}
                                title="Edit Expiry/Plan"
                                disabled={actionLoading === sub.user_id}
                              >
                                <Edit2 size={13} />
                                <span>Edit</span>
                              </button>
                              <button 
                                onClick={() => handleRevokePro(sub.user_id, sub.email)}
                                className={styles.revokeBtn}
                                title="Revoke Pro / Set Free"
                                disabled={actionLoading === sub.user_id}
                              >
                                <UserMinus size={13} />
                                <span>Revoke Pro</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Tab 4: PRO REQUESTS TAB ──────────────────────────────── */}
        {activeTab === "pro-requests" && (
          <div className={styles.tableCard}>
            {loadingData ? (
              <div className={styles.tableLoading}>
                <span className={styles.spinner} /> Querying Pro request logs...
              </div>
            ) : getFilteredRequests().length === 0 ? (
              <div className={styles.tableEmpty}>No pro upgrade requests found.</div>
            ) : (
              <div className={styles.tableResponsive}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>GitHub Account</th>
                      <th>Applicant</th>
                      <th>Email</th>
                      <th>Coupon Used</th>
                      <th>Submitted</th>
                      <th>Status</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredRequests().map((req) => (
                      <tr key={req.id}>
                        <td>
                          <div className={styles.userInfoCell}>
                            {req.avatar_url ? (
                              <img 
                                src={req.avatar_url} 
                                alt="Avatar" 
                                className={styles.userAvatar} 
                              />
                            ) : (
                              <div className={styles.userAvatarPlaceholder}>
                                {req.github_username?.charAt(0).toUpperCase() || "G"}
                              </div>
                            )}
                            <div className={styles.userInfoText}>
                              <span className={styles.ghUser}>@{req.github_username}</span>
                              <span className={styles.ghEmail}>{req.github_email}</span>
                            </div>
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
                        <td>
                          <span className={styles.couponBadge}>{req.coupon_code}</span>
                        </td>
                        <td className={styles.monoCell}>
                          {formatDate(req.created_at)}
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
                          <div className={styles.actionBtns}>
                            {req.status === "pending" ? (
                              <>
                                <button
                                  onClick={() => openApproveModal(req)}
                                  className={styles.approveBtn}
                                  disabled={actionLoading === req.id}
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleReject(req.id)}
                                  className={styles.rejectBtn}
                                  disabled={actionLoading === req.id}
                                >
                                  Reject
                                </button>
                              </>
                            ) : (
                              <span className={styles.actionDoneText}>
                                {req.status === "approved" ? "✓ Approved" : "✗ Rejected"}
                              </span>
                            )}
                            <button
                              onClick={() => handleDeleteProRequest(req.id)}
                              className={styles.deleteBtn}
                              title="Delete Record"
                              disabled={actionLoading === req.id}
                            >
                              <Trash2 size={13} />
                              <span>Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MODAL: APPROVE PRO REQUEST WITH CUSTOM DURATION ───────── */}
      {approveModalReq && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h3>Approve Pro Request: @{approveModalReq.github_username}</h3>
              <button onClick={() => setApproveModalReq(null)} className={styles.modalCloseBtn}>&times;</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalInputSec}>
                <label>Admin Notes:</label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="E.g., Granted via free coupon approval."
                  className={styles.modalTextarea}
                />
              </div>

              <div className={styles.modalInputSec}>
                <label>Grant Subscription Duration:</label>
                <div className={styles.durationSelectorWrap}>
                  <div className={styles.presetOptions}>
                    <button 
                      type="button" 
                      onClick={() => { setDurationDays(30); setIsCustomDuration(false); }}
                      className={`${styles.presetPill} ${durationDays === 30 && !isCustomDuration ? styles.presetPillActive : ""}`}
                    >
                      30 Days
                    </button>
                    <button 
                      type="button" 
                      onClick={() => { setDurationDays(90); setIsCustomDuration(false); }}
                      className={`${styles.presetPill} ${durationDays === 90 && !isCustomDuration ? styles.presetPillActive : ""}`}
                    >
                      90 Days
                    </button>
                    <button 
                      type="button" 
                      onClick={() => { setDurationDays(180); setIsCustomDuration(false); }}
                      className={`${styles.presetPill} ${durationDays === 180 && !isCustomDuration ? styles.presetPillActive : ""}`}
                    >
                      6 Months
                    </button>
                    <button 
                      type="button" 
                      onClick={() => { setDurationDays(365); setIsCustomDuration(false); }}
                      className={`${styles.presetPill} ${durationDays === 365 && !isCustomDuration ? styles.presetPillActive : ""}`}
                    >
                      1 Year
                    </button>
                    <button 
                      type="button" 
                      onClick={() => { setDurationDays(99999); setIsCustomDuration(false); }}
                      className={`${styles.presetPill} ${durationDays === 99999 && !isCustomDuration ? styles.presetPillActive : ""}`}
                    >
                      Lifetime
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setIsCustomDuration(true)}
                      className={`${styles.presetPill} ${isCustomDuration ? styles.presetPillActive : ""}`}
                    >
                      Custom...
                    </button>
                  </div>

                  {isCustomDuration && (
                    <div className={styles.customInputRow}>
                      <input 
                        type="number"
                        min="1"
                        value={customDaysVal}
                        onChange={(e) => setCustomDaysVal(parseInt(e.target.value) || 1)}
                        className={styles.customNumInput}
                      />
                      <select 
                        value={customDaysUnit}
                        onChange={(e: any) => setCustomDaysUnit(e.target.value)}
                        className={styles.customUnitSelect}
                      >
                        <option value="days">Days</option>
                        <option value="months">Months</option>
                        <option value="years">Years</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button onClick={() => setApproveModalReq(null)} className={styles.modalCancelBtn}>
                Cancel
              </button>
              <button 
                onClick={handleApprove}
                className={styles.modalSaveBtn}
                disabled={actionLoading === approveModalReq.id}
              >
                {actionLoading === approveModalReq.id ? "Processing..." : "Confirm & Approve"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: EDIT ACTIVE SUBSCRIPTION DURATION ──────────────── */}
      {editingSub && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h3>Edit Subscription: {editingSub.email}</h3>
              <button onClick={() => setEditingSub(null)} className={styles.modalCloseBtn}>&times;</button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.modalSubtitle}>Update active billing details and expiry periods.</p>
              
              <div className={styles.modalInputSec}>
                <label>Change Validity Duration:</label>
                <div className={styles.durationSelectorWrap}>
                  <div className={styles.presetOptions}>
                    <button 
                      type="button" 
                      onClick={() => { setDurationDays(30); setIsCustomDuration(false); }}
                      className={`${styles.presetPill} ${durationDays === 30 && !isCustomDuration ? styles.presetPillActive : ""}`}
                    >
                      +30 Days
                    </button>
                    <button 
                      type="button" 
                      onClick={() => { setDurationDays(90); setIsCustomDuration(false); }}
                      className={`${styles.presetPill} ${durationDays === 90 && !isCustomDuration ? styles.presetPillActive : ""}`}
                    >
                      +90 Days
                    </button>
                    <button 
                      type="button" 
                      onClick={() => { setDurationDays(180); setIsCustomDuration(false); }}
                      className={`${styles.presetPill} ${durationDays === 180 && !isCustomDuration ? styles.presetPillActive : ""}`}
                    >
                      +6 Months
                    </button>
                    <button 
                      type="button" 
                      onClick={() => { setDurationDays(365); setIsCustomDuration(false); }}
                      className={`${styles.presetPill} ${durationDays === 365 && !isCustomDuration ? styles.presetPillActive : ""}`}
                    >
                      +1 Year
                    </button>
                    <button 
                      type="button" 
                      onClick={() => { setDurationDays(99999); setIsCustomDuration(false); }}
                      className={`${styles.presetPill} ${durationDays === 99999 && !isCustomDuration ? styles.presetPillActive : ""}`}
                    >
                      Lifetime
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setIsCustomDuration(true)}
                      className={`${styles.presetPill} ${isCustomDuration ? styles.presetPillActive : ""}`}
                    >
                      Custom...
                    </button>
                  </div>

                  {isCustomDuration && (
                    <div className={styles.customInputRow}>
                      <input 
                        type="number"
                        min="1"
                        value={customDaysVal}
                        onChange={(e) => setCustomDaysVal(parseInt(e.target.value) || 1)}
                        className={styles.customNumInput}
                      />
                      <select 
                        value={customDaysUnit}
                        onChange={(e: any) => setCustomDaysUnit(e.target.value)}
                        className={styles.customUnitSelect}
                      >
                        <option value="days">Days</option>
                        <option value="months">Months</option>
                        <option value="years">Years</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button onClick={() => setEditingSub(null)} className={styles.modalCancelBtn}>
                Cancel
              </button>
              <button 
                onClick={handleUpdateSubscription}
                className={styles.modalSaveBtn}
                disabled={actionLoading === editingSub.user_id}
              >
                {actionLoading === editingSub.user_id ? "Saving..." : "Update Subscription"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
