import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/app/lib/useAuth";
import { useSubscription } from "@/app/lib/useSubscription";
import styles from "./Navbar.module.css";

const snarkyQuotes = [
  "Light mode? Haven't seen daylight since 2014.",
  "No. My retinas are calibrated to #0e0d0b.",
  "It's in the backlog, right under 'rewrite it in Rust'.",
  "Light mode is a YAGNI. Next ticket.",
  "You're a developer. You'll adapt.",
  "Works on my machine. My machine is dark.",
  "I closed that issue as 'wontfix'.",
  "The sun is a single point of failure.",
  "That's a v2 problem. There is no v2.",
  "Add it yourself. PRs welcome. (They're not.)",
  "Dark mode is the default. The default is correct.",
  "Bold of you to assume I take feature requests.",
  "Ask again at 3am. That's when I ship.",
  "Light mode is one more thing to maintain. Pass."
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);
  const pathname = usePathname();
  const { user } = useAuth(false);
  const { isPro } = useSubscription();

  const githubName =
    user?.user_metadata?.preferred_username ||
    user?.user_metadata?.user_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "Developer";

  const initials = githubName
    ? githubName.slice(0, 2).toUpperCase()
    : "DV";

  const handleLightModeClick = () => {
    const text = snarkyQuotes[lineIndex % snarkyQuotes.length];
    setLineIndex((prev) => prev + 1);

    window.dispatchEvent(
      new CustomEvent("show-snarky-quote", {
        detail: { text },
      })
    );
  };

  return (
    <nav className={styles.chrome}>
      <div className={styles.inner}>
        {/* Traffic light dots + file breadcrumb */}
        <div className={styles.left}>
          <span className={styles.dots}>
            <i className={styles.dotRed} />
            <i className={styles.dotAmber} />
            <i className={styles.dotGreen} />
          </span>
          <div className={styles.logoTabWrap}>
            <Link href="/" className={styles.logoLink}>
              <Image
                src="/logo.svg"
                alt="GitDecode"
                width={80}
                height={20}
                priority
                className={styles.logoImage}
              />
            </Link>
            <span className={styles.separator}>—</span>
            <div className={styles.tabs}>
              <Link
                href="/"
                className={`${styles.tab} ${
                  pathname === "/" ? styles.activeTab : ""
                }`}
              >
                Home.md
              </Link>
              <Link
                href="/how-it-works"
                className={`${styles.tab} ${
                  pathname === "/how-it-works" ? styles.activeTab : ""
                }`}
              >
                HowItWorks.json
              </Link>
              <Link
                href="/security"
                className={`${styles.tab} ${
                  pathname === "/security" ? styles.activeTab : ""
                }`}
              >
                security.yaml
              </Link>
              <Link
                href="/pricing"
                className={`${styles.tab} ${
                  pathname === "/pricing" ? styles.activeTab : ""
                }`}
              >
                Pricing.js
              </Link>
              <Link
                href="/developers"
                className={`${styles.tab} ${
                  pathname === "/developers" ? styles.activeTab : ""
                }`}
              >
                developers.py
              </Link>
              <Link
                href="/feedback"
                className={`${styles.tab} ${
                  pathname === "/feedback" ? styles.activeTab : ""
                }`}
              >
                feedback.go
              </Link>
            </div>

          </div>
        </div>

        {/* Desktop Actions */}
        <div className={styles.desktopActions}>
          <div className={styles.lightbtnWrapper}>
            <button
              className={styles.lightbtn}
              onClick={handleLightModeClick}
              type="button"
            >
              ☀ light mode
            </button>
          </div>
          {user ? (
            <>
              <Link href="/dashboard" className={styles.bracketBtn}>
                dashboard
              </Link>

              <Link
                href="/dashboard/profile"
                className={styles.topbarProfileWidget}
                title="Developer Profile"
              >
                {user.user_metadata?.avatar_url ? (
                  <div className={styles.topbarAvatar} style={{ overflow: "hidden", padding: 0 }}>
                    <img
                      src={user.user_metadata.avatar_url}
                      alt={githubName}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                ) : (
                  <div className={styles.topbarAvatar}>{initials}</div>
                )}
                <span className={styles.topbarProfileName} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {githubName}
                  {isPro ? (
                    <span style={{ 
                      fontSize: "0.6rem", 
                      background: "rgba(212, 175, 55, 0.12)", 
                      border: "1px solid #d4af37", 
                      color: "#d4af37", 
                      padding: "1px 6px", 
                      borderRadius: 4, 
                      fontFamily: "var(--font-mono)", 
                      fontWeight: 700,
                      letterSpacing: "0.02em"
                    }}>
                      Pro
                    </span>
                  ) : (
                    <span style={{ 
                      fontSize: "0.6rem", 
                      background: "rgba(131, 193, 103, 0.12)", 
                      border: "1px solid var(--color-green)", 
                      color: "var(--color-green)", 
                      padding: "1px 6px", 
                      borderRadius: 4, 
                      fontFamily: "var(--font-mono)", 
                      fontWeight: 700,
                      letterSpacing: "0.02em"
                    }}>
                      Free
                    </span>
                  )}
                </span>
              </Link>
            </>
          ) : (
            <Link href="/auth/sign-in" className={styles.bracketBtn}>
              sign in
            </Link>
          )}
        </div>

        {/* Mobile Hamburger */}
        <button
          className={styles.hamburger}
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
        >
          <span className={`${styles.hamburgerLine} ${mobileOpen ? styles.open1 : ""}`} />
          <span className={`${styles.hamburgerLine} ${mobileOpen ? styles.open2 : ""}`} />
          <span className={`${styles.hamburgerLine} ${mobileOpen ? styles.open3 : ""}`} />
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className={styles.mobileMenu}>
          <Link
            href="/"
            className={`${styles.mobileLink} ${pathname === "/" ? styles.activeMobileLink : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            Home.md
          </Link>
          <Link
            href="/how-it-works"
            className={`${styles.mobileLink} ${pathname === "/how-it-works" ? styles.activeMobileLink : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            HowItWorks.json
          </Link>
          <Link
            href="/security"
            className={`${styles.mobileLink} ${pathname === "/security" ? styles.activeMobileLink : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            security.yaml
          </Link>
          <Link
            href="/pricing"
            className={`${styles.mobileLink} ${pathname === "/pricing" ? styles.activeMobileLink : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            Pricing.js
          </Link>
          <Link
            href="/developers"
            className={`${styles.mobileLink} ${pathname === "/developers" ? styles.activeMobileLink : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            developers.py
          </Link>
          <Link
            href="/feedback"
            className={`${styles.mobileLink} ${pathname === "/feedback" ? styles.activeMobileLink : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            feedback.go
          </Link>

          <div className={styles.lightbtnWrapperMobile}>
            <button
              className={styles.mobileLink}
              onClick={handleLightModeClick}
              type="button"
              style={{ textAlign: "left", width: "100%" }}
            >
              ☀ light mode
            </button>
          </div>
          {user ? (
            <>
              <Link
                href="/dashboard"
                className={styles.mobileLink}
                onClick={() => setMobileOpen(false)}
                style={{ color: "var(--color-green)" }}
              >
                [ dashboard ]
              </Link>
              <Link
                href="/dashboard/profile"
                className={styles.mobileProfileLink}
                onClick={() => setMobileOpen(false)}
              >
                {user.user_metadata?.avatar_url ? (
                  <div className={styles.topbarAvatar} style={{ overflow: "hidden", padding: 0 }}>
                    <img
                      src={user.user_metadata.avatar_url}
                      alt={githubName}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                ) : (
                  <div className={styles.topbarAvatar}>{initials}</div>
                )}
                <span style={{ color: "var(--color-text)", fontFamily: "var(--font-mono)", fontSize: "0.875rem" }}>
                  {githubName}
                </span>
              </Link>
            </>
          ) : (
            <Link
              href="/auth/sign-in"
              className={styles.mobileLink}
              onClick={() => setMobileOpen(false)}
              style={{ color: "var(--color-green)" }}
            >
              [ sign in ]
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}

