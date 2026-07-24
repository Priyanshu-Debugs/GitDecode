"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { getSupabase } from "@/app/lib/supabase";
import styles from "./page.module.css";

/* ── Developer-Centric Sign In ──────────────────────────────────────
   A minimalist, terminal-themed split screen that perfectly aligns
   with the landing page aesthetic.
   ────────────────────────────────────────────────────────────────── */

function TerminalConsole() {
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const lines = [
      "git clone https://github.com/gitdecode/ast-lexer-engine.git...",
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
        <span>indexing_agent.sh</span>
        <span className={styles.terminalTitle}>terminal logs</span>
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
      localStorage.removeItem("gitdecode_mock_session");
      localStorage.removeItem("gitdecode_cached_repos");
    }
  }, []);

  const handleGitHubSignIn = async () => {
    setError("");
    setLoading(true);
    if (typeof window !== "undefined") {
      localStorage.removeItem("gitdecode_mock_session");
      localStorage.removeItem("gitdecode_cached_repos");
    }
    try {
      const supabase = getSupabase();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: `${window.location.origin}/auth/callback-client`,
          scopes: "repo read:user",
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
      email: "demo@gitdecode.local",
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
        email: "demo@gitdecode.local",
        role: "authenticated",
      },
    };

    localStorage.setItem("gitdecode_mock_session", JSON.stringify(mockSession));
    window.location.href = "/dashboard";
  };

  return (
    <div className={styles.splitLayout}>
      {/* ── Left Side: Developer Visuals ───── */}
      <div className={styles.visualPanel}>
        <div className={styles.infoWrapper}>
          <div className={styles.infoBrand}>
            GitDecode
          </div>
          <h2 className={styles.infoTitle}>Analyze codebases with context graph intelligence.</h2>
          
          <TerminalConsole />

          <div className={styles.featureList}>
            <div className={styles.featureItem}>
              <div className={styles.featureNumber}>01</div>
              <div className={styles.featureContent}>
                <h4 className={styles.featureTitle}>Interactive Dependency Graphs</h4>
                <p className={styles.featureDescription}>
                  Automatically construct file-level and class-level dependency networks to expose repository relationships visually.
                </p>
              </div>
            </div>
            
            <div className={styles.featureItem}>
              <div className={styles.featureNumber}>02</div>
              <div className={styles.featureContent}>
                <h4 className={styles.featureTitle}>Context-Aware Code Q&A</h4>
                <p className={styles.featureDescription}>
                  Ask direct questions about functions or API pipelines. Receive grounded explanations complete with exact code citations.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right Side: Minimalist Login Panel ───────────── */}
      <div className={styles.loginPanel}>
        <Link href="/" className={styles.backBtn}>
          ← home.md
        </Link>

        <div className={styles.loginCenter}>
          <div className={styles.logo}>
            <Image src="/developer-logo.svg" alt="GitDecode Logo" width={240} height={240} priority className={styles.logoImage} />
          </div>

          <div className={styles.intro}>
            <h2 className={styles.heading}>Codebase intelligence starts here</h2>
            <p className={styles.subtitle}>
              // Connect with GitHub to visualize dependencies, chat with your files,
              and analyze downstream blast radius instantly.
            </p>
          </div>

          {error && (
            <div className={styles.errorBanner}>
              [!] {error}
            </div>
          )}

          <div className={styles.actionContainer}>
            <button
              onClick={handleGitHubSignIn}
              disabled={loading}
              className={styles.btnFill}
            >
              {loading ? "authenticating..." : "continue with github"}
            </button>
            
            <div className={styles.divider}>
              <span className={styles.dividerText}>or test-drive</span>
            </div>

            <button
              onClick={handleDevBypass}
              className={styles.btnOutline}
            >
              enter demo mode
            </button>
          </div>

          <div className={styles.securityDisclaimer}>
            // Secure authorization powered by Supabase Auth.
            <br />
            // We only request read access to public repositories.
          </div>
        </div>
      </div>
    </div>
  );
}
