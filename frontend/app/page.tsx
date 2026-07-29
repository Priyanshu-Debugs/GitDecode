"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import FeedbackSection from "./components/FeedbackSection";
import { useAuth } from "@/app/lib/useAuth";
import styles from "./page.module.css";


/* ── Language Data ───────────────────────────────────────────────── */
const languages = [
  { name: "TypeScript", color: "#3178c6" },
  { name: "JavaScript", color: "#f7df1e" },
  { name: "Python", color: "#3776ab" },
  { name: "Go", color: "#00add8" },
  { name: "Rust", color: "#dea584" },
  { name: "C++", color: "#00599c" },
  { name: "Java", color: "#e24725" },
  { name: "Ruby", color: "#cc342d" },
  { name: "PHP", color: "#777bb4" },
  { name: "Swift", color: "#f05138" },
];

/* ═══════════════════════════════════════════════════════════════════
   Landing Page — Minimal, Developer-Centric
   ═══════════════════════════════════════════════════════════════════ */

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const router = useRouter();
  const { user } = useAuth(false);

  // State for the developer speech bubble
  const [showBubble, setShowBubble] = useState(false);
  const [bubbleText, setBubbleText] = useState("");
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleQuoteEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ text: string }>;
      if (customEvent.detail && customEvent.detail.text) {
        setBubbleText(customEvent.detail.text);
        setShowBubble(true);

        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }

        timerRef.current = setTimeout(() => {
          setShowBubble(false);
        }, 4200);
      }
    };

    window.addEventListener("show-snarky-quote", handleQuoteEvent);

    return () => {
      window.removeEventListener("show-snarky-quote", handleQuoteEvent);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleRepoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (user) {
      router.push("/dashboard");
    } else {
      router.push("/auth/sign-in");
    }
  };

  return (
    <>
      <Navbar />
      <main>
        {/* ── HERO ──────────────────────────────────────────────── */}
        <header className={styles.hero}>
          <div className={styles.wrap}>
            <div className={styles.logoWrapper}>
              <Image
                src="/developer-logo-refined.svg"
                alt="GitDecode Developer Logo"
                width={140}
                height={140}
                priority
                className={styles.heroLogo}
              />
              {showBubble && (
                <div className={styles.bubble} role="status" aria-live="polite">
                  {bubbleText}
                </div>
              )}
            </div>

            <h1 className={styles.heroTitle}>
              GitDecode<span className={styles.cursor}>▋</span>
            </h1>

            <p className={styles.heroTagline}>
              Understand any <span className={styles.underlined}>codebase</span> in minutes, not <span className={styles.cut}>months</span>.
            </p>

            <p className={styles.heroSub}>
              <span className={styles.comment}>// </span>
              AI-powered codebase intelligence. Parse your repository, build a
              knowledge graph, and explore it through interactive diagrams and
              natural conversation.
            </p>

            {/* Repo URL input */}
            <form onSubmit={handleRepoSubmit} className={styles.repoForm}>
              <div className={styles.repoInputWrap}>
                <span className={styles.repoPrompt}>$</span>
                <input
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  className={styles.repoInput}
                  aria-label="GitHub repository URL"
                />
                <button type="submit" className={styles.repoSubmit}>
                  →
                </button>
              </div>
            </form>

            {/* CTA buttons */}
            <div className={styles.cta}>
              {user ? (
                <Link href="/dashboard" className={styles.btnFill}>
                  dashboard
                </Link>
              ) : (
                <Link href="/auth/sign-in" className={styles.btnFill}>
                  sign in
                </Link>
              )}
              <Link href="/how-it-works" className={styles.btnOutline}>
                how it works
              </Link>
            </div>

            <p className={styles.trust}>
              No credit card · Free for public repos · GitHub auth
            </p>
          </div>
        </header>



        {/* ── CAPABILITIES ─────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.wrap}>
            <p className={styles.label}>capabilities</p>
            <h2 className={styles.sectionTitle}>
              Three tools. Complete clarity.
            </h2>

            <div className={styles.panelGrid}>
              {/* Architecture Diagrams panel */}
              <div className={styles.panel}>
                <div className={styles.panelBar}>
                  <span>diagrams.mmd</span>
                  <span className={styles.panelMeta}>auto-generated</span>
                </div>
                <pre className={styles.panelCode}>
                  <span className={styles.ln}>
                    <span className={styles.codeDim}>graph TD</span>
                  </span>
                  <span className={styles.ln}>
                    {"  "}
                    <span className={styles.codeGreen}>App</span> --{">"}{" "}
                    <span className={styles.codeGreen}>Router</span>
                  </span>
                  <span className={styles.ln}>
                    {"  "}
                    <span className={styles.codeGreen}>Router</span> --{">"}{" "}
                    <span className={styles.codeGreen}>AuthProvider</span>
                  </span>
                  <span className={styles.ln}>
                    {"  "}
                    <span className={styles.codeGreen}>Router</span> --{">"}{" "}
                    <span className={styles.codeGreen}>Dashboard</span>
                  </span>
                  <span className={styles.ln}>
                    {"  "}
                    <span className={styles.codeGreen}>Dashboard</span> --{">"}{" "}
                    <span className={styles.codeGreen}>ChatView</span>
                  </span>
                  <span className={styles.ln}>
                    {"  "}
                    <span className={styles.codeGreen}>Dashboard</span> --{">"}{" "}
                    <span className={styles.codeGreen}>GraphView</span>
                  </span>
                </pre>
              </div>

              {/* Chat with Code panel */}
              <div className={styles.panel}>
                <div className={styles.panelBar}>
                  <span>chat.log</span>
                  <span className={styles.panelMeta}>RAG-powered</span>
                </div>
                <pre className={styles.panelCode}>
                  <span className={styles.ln}>
                    <span className={styles.codeAmber}>you:</span> Where is auth
                    handled?
                  </span>
                  <span className={styles.ln}>&nbsp;</span>
                  <span className={styles.ln}>
                    <span className={styles.codeGreen}>gitdecode:</span>{" "}
                    Authentication is in
                  </span>
                  <span className={styles.ln}>
                    {"  "}
                    <span className={styles.codeAmber}>
                      src/lib/auth/provider.ts
                    </span>
                  </span>
                  <span className={styles.ln}>
                    {"  "}
                    <span className={styles.codeDim}>
                      Lines 12-48: OAuth2 flow with
                    </span>
                  </span>
                  <span className={styles.ln}>
                    {"  "}
                    <span className={styles.codeDim}>
                      GitHub as the identity provider.
                    </span>
                  </span>
                </pre>
              </div>

              {/* Blast Radius panel */}
              <div className={`${styles.panel} ${styles.panelWide}`}>
                <div className={styles.panelBar}>
                  <span>blast-radius.diff</span>
                  <span className={styles.panelMeta}>impact analysis</span>
                </div>
                <pre className={styles.panelCode}>
                  <span className={styles.ln}>
                    <span className={styles.codeDim}>
                      Changing <span className={styles.codeAmber}>auth/provider.ts</span> affects:
                    </span>
                  </span>
                  <span className={styles.ln}>&nbsp;</span>
                  <span className={`${styles.ln} ${styles.lnDel}`}>
                    - 4 direct dependents
                  </span>
                  <span className={`${styles.ln} ${styles.lnDel}`}>
                    - 12 transitive consumers
                  </span>
                  <span className={`${styles.ln} ${styles.lnAdd}`}>
                    + 0 test files covering this path
                  </span>
                  <span className={`${styles.ln} ${styles.lnAdd}`}>
                    + risk: HIGH — add tests before refactoring
                  </span>
                </pre>
              </div>
            </div>

            {/* Language strip */}
            <div className={styles.langStrip}>
              <span className={styles.langLabel}>supported:</span>
              {languages.map((lang) => (
                <span key={lang.name} className={styles.langBadge}>
                  <span
                    className={styles.langDot}
                    style={{ backgroundColor: lang.color }}
                  />
                  {lang.name}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── STATS ────────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.wrap}>
            <p className={styles.label}>benchmarks</p>
            <h2 className={styles.sectionTitle}>
              Fast. Private. Comprehensive.
            </h2>

            <div className={styles.stats}>
              <div>
                <div className={`${styles.statNum} ${styles.statGreen}`}>
                  {"<"}60s
                </div>
                <div className={styles.statLabel}>analysis time</div>
              </div>
              <div>
                <div className={styles.statNum}>10+</div>
                <div className={styles.statLabel}>languages</div>
              </div>
              <div>
                <div className={styles.statNum}>100%</div>
                <div className={styles.statLabel}>your code stays private</div>
              </div>
            </div>

            <p className={styles.footnote}>
              // median across repos up to 50k LOC. Code is processed in-memory;
              we never store your repository content.
            </p>
          </div>
        </section>

        {/* ── FEEDBACK SECTION ───────────────────────────────────── */}
        <FeedbackSection />
      </main>
      <Footer />
    </>
  );
}

