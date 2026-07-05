"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/app/lib/useAuth";
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

function FolderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
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

/* ── Nav Items ─────────────────────────────────────────────────────── */
const navItems = [
  { href: "/dashboard", label: "Overview", icon: HomeIcon },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, signOut } = useAuth(true);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

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

  return (
    <div className={styles.dashboardLayout}>
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside
        className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ""}`}
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

        <nav className={styles.sidebarNav}>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
              >
                <item.icon />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

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

      {/* ── Main Area ───────────────────────────────────────── */}
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
          <div className={styles.topbarActions}>
            {/* Future: notification bell, search, etc. */}
          </div>
        </div>

        {/* Page Content */}
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
