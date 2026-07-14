"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getSupabase } from "@/app/lib/supabase";
import Button from "@/app/components/Button";
import styles from "./page.module.css";

/* ── Design Read ───────────────────────────────────────────────────
   Reading this as: Premium developer SaaS split-screen login page
   for software engineers, with a minimalist dark tech theme, leaning
   toward flat border-based structures and interactive mock previews.
   ────────────────────────────────────────────────────────────────── */

import { useEffect } from "react";

function TerminalConsole() {
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const lines = [
      "git clone https://github.com/gitmesh/ast-lexer-engine.git...",
      "Cloning repository structures: 100% complete.",
      "Parsing tree-sitter AST maps...",
      "Found 42 TypeScript source files, 15 modules.",
      "Analyzing class dependencies...",
      "Indexed 28 class declarations, 142 functions.",
      "Indexing dependency graph relationships into Neo4j...",
      "Created 170 nodes and 342 reference linkages.",
      "Generating vector representations for chat Q&A...",
      "pgvector embeddings generated successfully.",
      "Indexing complete. Knowledge graph is online.",
      "--------------------------------------------------",
    ];

    let currentIdx = 0;
    setLogs(["$ " + lines[0]]);

    const interval = setInterval(() => {
      currentIdx = (currentIdx + 1) % lines.length;
      if (currentIdx === 0) {
        setLogs(["$ " + lines[0]]);
      } else {
        const nextLine = lines[currentIdx];
        const prefix = nextLine.startsWith("git") || nextLine.startsWith("Cloning") ? "$ " : "  ";
        setLogs((prev) => [...prev.slice(-7), prefix + nextLine]);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={styles.terminalContainer}>
      <div className={styles.terminalHeader}>
        <div className={styles.terminalDots}>
          <span className={styles.terminalDot} style={{ background: "#ef4444" }} />
          <span className={styles.terminalDot} style={{ background: "#f59e0b" }} />
          <span className={styles.terminalDot} style={{ background: "#22c55e" }} />
        </div>
        <span className={styles.terminalTitle}>indexing_agent@gitmesh: ~</span>
      </div>
      <div className={styles.terminalBody}>
        {logs.map((log, i) => (
          <div key={i} className={styles.terminalLine}>
            <span className={log.startsWith("$") ? styles.terminalPrompt : styles.terminalLog}>
              {log}
            </span>
          </div>
        ))}
        <div className={styles.terminalCursor} />
      </div>
    </div>
  );
}

export default function SignInPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("gitmesh_mock_session");
      localStorage.removeItem("gitmesh_cached_repos");
    }
  }, []);

  const handleGitHubSignIn = async () => {
    setError("");
    setLoading(true);
    if (typeof window !== "undefined") {
      localStorage.removeItem("gitmesh_mock_session");
      localStorage.removeItem("gitmesh_cached_repos");
    }
    try {
      const supabase = getSupabase();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: `${window.location.origin}/auth/callback-client`,
        },
      });

      if (authError) {
        setError(authError.message);
      }
    } catch {
      setError("Failed to initiate GitHub sign in.");
    } finally {
      setLoading(false);
    }
  };

  const handleDevBypass = () => {
    const header = { alg: "HS256", typ: "JWT" };
    const payload = {
      sub: "00000000-0000-0000-0000-000000000000",
      email: "demo@gitmesh.local",
      role: "authenticated",
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 hours
    };

    const base64Url = (obj: any) => {
      const str = JSON.stringify(obj);
      const base64 = window.btoa(unescape(encodeURIComponent(str)));
      return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    };

    const token = `${base64Url(header)}.${base64Url(payload)}.mocksignature`;
    const mockSession = {
      access_token: token,
      token_type: "bearer",
      expires_in: 86400,
      user: {
        id: "00000000-0000-0000-0000-000000000000",
        email: "demo@gitmesh.local",
        role: "authenticated",
      },
    };

    localStorage.setItem("gitmesh_mock_session", JSON.stringify(mockSession));
    window.location.href = "/dashboard";
  };

  return (
    <div className={styles.splitLayout}>
      {/* ── Left Side: Premium Interactive Visual Chat Mockup ───── */}
      <div className={styles.visualPanel}>
        <div className={styles.gridOverlay} />
        <div className={styles.glowSpot} />
        
        <div className={styles.infoWrapper}>
          <div className={styles.infoBrand}>
            <span className={styles.infoBrandGit}>Git</span>
            <span className={styles.infoBrandMesh}>Mesh</span>
            <span className={styles.infoBrandSub}>Agentic AI</span>
          </div>
          <h2 className={styles.infoTitle}>Analyze codebases with context graph intelligence</h2>
          
          <TerminalConsole />

          <div className={styles.featureList}>
            <div className={styles.featureItem}>
              <div className={styles.featureNumber}>01</div>
              <div className={styles.featureContent}>
                <h4 className={styles.featureTitle}>Interactive Dependency Graphs</h4>
                <p className={styles.featureDescription}>
                  GitMesh automatically constructs file-level and class-level dependency networks to expose repository relationships visually.
                </p>
              </div>
            </div>
            
            <div className={styles.featureItem}>
              <div className={styles.featureNumber}>02</div>
              <div className={styles.featureContent}>
                <h4 className={styles.featureTitle}>Context-Aware Code Q&A</h4>
                <p className={styles.featureDescription}>
                  Ask direct questions about functions or API pipelines. Receive grounded explanations complete with exact code citations and line ranges.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right Side: Minimalist Unified Login Panel ───────────── */}
      <div className={styles.loginPanel}>
        <Link href="/" className={styles.backBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
          Back to landing page
        </Link>

        <div className={styles.loginCenter}>
          <div className={styles.logo}>
            <Image src="/logo.svg" alt="GitMesh Logo" width={128} height={32} priority className={styles.logoImage} />
          </div>

          <div className={styles.intro}>
            <h2 className={styles.heading}>Codebase intelligence starts here</h2>
            <p className={styles.subtitle}>
              Connect with GitHub to visualize dependencies, chat with your files,
              and analyze downstream blast radius instantly.
            </p>
          </div>

          {error && (
            <div className={styles.errorBanner}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div className={styles.actionContainer}>
            <Button
              onClick={handleGitHubSignIn}
              loading={loading}
              size="lg"
              fullWidth
              className={styles.githubBtn}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              Continue with GitHub
            </Button>
            
            <div className={styles.divider}>
              <span className={styles.dividerText}>or test-drive the platform</span>
            </div>

            <Button
              onClick={handleDevBypass}
              variant="primary"
              size="lg"
              fullWidth
              className={styles.demoModeBtn}
            >
              Enter Demo Mode
            </Button>
          </div>

          <div className={styles.securityDisclaimer}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span>
              Secure authorization powered by Supabase Auth. We only request read access to public repositories.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
