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



  const handleGitHubSignIn = async () => {
    setError("");
    setLoading(true);
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.11.82-.26.82-.577v-2.234c-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22v3.293c0 .319.22.694.825.576C20.565 21.795 24 17.3 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              <span>{loading ? "authenticating..." : "continue with github"}</span>
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
