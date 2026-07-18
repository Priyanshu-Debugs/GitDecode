"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocalKeys } from "@/app/lib/useLocalKeys";
import styles from "./settings.module.css";

interface ProviderMeta {
  display_name: string;
  key_prefix: string;
  has_server_key: boolean;
  models: { id: string; name: string; context_window: number }[];
}

export default function SettingsPage() {
  const { getKey, setKey, removeKey } = useLocalKeys();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"providers" | "about">("providers");
  const [providers, setProviders] = useState<Record<string, ProviderMeta>>({});
  const [inputKeys, setInputKeys] = useState<Record<string, string>>({});
  const [testStatus, setTestStatus] = useState<Record<string, { loading: boolean; valid?: boolean; msg?: string }>>({});

  useEffect(() => {
    async function fetchProviders() {
      try {
        const res = await fetch("http://localhost:8000/api/v1/providers");
        if (res.ok) {
          const data = await res.json();
          setProviders(data);
          
          // Pre-fill input fields from localStorage
          const initialInputs: Record<string, string> = {};
          Object.keys(data).forEach((p) => {
            const existing = getKey(p);
            if (existing) initialInputs[p] = existing;
          });
          setInputKeys(initialInputs);
        }
      } catch {
        // Fallback static providers if server is offline
        const fallback = {
          google: { display_name: "Google Gemini", key_prefix: "AIza", has_server_key: true, models: [] },
          openai: { display_name: "OpenAI", key_prefix: "sk-", has_server_key: false, models: [] },
          anthropic: { display_name: "Anthropic", key_prefix: "sk-ant-", has_server_key: false, models: [] },
          groq: { display_name: "Groq", key_prefix: "gsk_", has_server_key: false, models: [] },
        };
        setProviders(fallback);
      }
    }
    fetchProviders();
  }, [getKey]);

  const handleSave = (provider: string) => {
    const val = inputKeys[provider];
    if (val && val.trim()) {
      setKey(provider, val.trim());
      setTestStatus((prev) => ({ ...prev, [provider]: { loading: false, valid: true, msg: "Key saved to browser" } }));
    }
  };

  const handleRemove = (provider: string) => {
    removeKey(provider);
    setInputKeys((prev) => ({ ...prev, [provider]: "" }));
    setTestStatus((prev) => ({ ...prev, [provider]: { loading: false, msg: "" } }));
  };

  const handleTestKey = async (provider: string) => {
    const key = inputKeys[provider] || getKey(provider);
    if (!key) return;

    setTestStatus((prev) => ({ ...prev, [provider]: { loading: true, msg: "Validating API key..." } }));

    try {
      const res = await fetch("http://localhost:8000/api/v1/providers/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, api_key: key }),
      });
      const data = await res.json();
      setTestStatus((prev) => ({
        ...prev,
        [provider]: { loading: false, valid: data.valid, msg: data.message },
      }));
    } catch {
      setTestStatus((prev) => ({
        ...prev,
        [provider]: { loading: false, valid: false, msg: "Could not reach server to test key" },
      }));
    }
  };

  return (
    <div className={styles.container}>
      {/* Settings Navigation Sidebar */}
      <aside className={styles.sidebar}>
        <button
          className={styles.backBtn}
          onClick={() => router.back()}
          title="Go back"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Back</span>
        </button>
        <div className={styles.sidebarTitle}>Settings</div>
        <button
          className={`${styles.tabBtn} ${activeTab === "providers" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("providers")}
        >
          <span>Providers & Keys</span>
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === "about" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("about")}
        >
          <span>About & Privacy</span>
        </button>
      </aside>

      {/* Main Settings Content */}
      <main className={styles.mainContent}>
        {activeTab === "providers" && (
          <>
            <header className={styles.header}>
              <h1 className={styles.title}>API Key Settings</h1>
              <p className={styles.subtitle}>
                Bring Your Own Key (BYOK). Configure API keys for AI models to use them in GitMesh.
              </p>
            </header>

            <div className={styles.privacyCallout}>
              <span></span>
              <div>
                <strong>Privacy Guaranteed:</strong> Keys are stored only in your browser&apos;s <code>localStorage</code>.
                They are sent over HTTPS encrypted only during active requests and are never stored on our servers.
              </div>
            </div>

            <div className={styles.providerGrid}>
              {Object.entries(providers).map(([key, info]) => {
                const isSaved = !!getKey(key);
                const status = testStatus[key];

                return (
                  <div key={key} className={styles.providerCard}>
                    <div className={styles.providerHeader}>
                      <div className={styles.providerInfo}>
                        <span className={styles.providerName}>{info.display_name}</span>
                        {info.has_server_key && <span className={styles.freeTag}>Free Tier Available</span>}
                      </div>
                    </div>

                    <div className={styles.inputGroup}>
                      <input
                        type="password"
                        placeholder={`Enter ${info.display_name} API Key (${info.key_prefix}...)`}
                        value={inputKeys[key] || ""}
                        onChange={(e) => setInputKeys({ ...inputKeys, [key]: e.target.value })}
                        className={styles.keyInput}
                      />
                      <button
                        onClick={() => handleSave(key)}
                        className={`${styles.actionBtn} ${styles.saveBtn}`}
                      >
                        Save
                      </button>
                      {isSaved && (
                        <>
                          <button
                            onClick={() => handleTestKey(key)}
                            className={`${styles.actionBtn} ${styles.testBtn}`}
                            disabled={status?.loading}
                          >
                            {status?.loading ? "Testing..." : "Test"}
                          </button>
                          <button
                            onClick={() => handleRemove(key)}
                            className={`${styles.actionBtn} ${styles.removeBtn}`}
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>

                    {status?.msg && (
                      <div className={`${styles.statusMsg} ${status.valid ? styles.statusValid : styles.statusInvalid}`}>
                        {status.valid ? "✓ " : status.valid === false ? "✕ " : "ℹ "}
                        {status.msg}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {activeTab === "about" && (
          <div>
            <header className={styles.header}>
              <h1 className={styles.title}>About GitMesh BYOK</h1>
              <p className={styles.subtitle}>
                GitMesh uses Vectorless RAG and multi-agent workflows to parse and analyze GitHub codebases.
              </p>
            </header>
            <div style={{ lineHeight: "1.7", color: "var(--color-text-secondary)", fontSize: "0.95rem" }}>
              <p>
                <strong>Architecture:</strong> Unlike traditional vector RAG, GitMesh parses code AST structures with tree-sitter, builds a JSON dependency graph, and uses graph BFS to assemble exact code context.
              </p>
              <p style={{ marginTop: 12 }}>
                <strong>BYOK Security:</strong> Your API keys remain strictly on your client device. When you ask a question, the key is included in the request body, processed in-memory by our agent pipeline, and immediately garbage-collected.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
