"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useLocalKeys } from "@/app/lib/useLocalKeys";

interface ModelItem {
  id: string;
  name: string;
  context_window?: number;
}

interface ProviderMeta {
  display_name: string;
  key_prefix: string;
  has_server_key: boolean;
  models: ModelItem[];
}

export default function ModelSelector() {
  const { getKey, getPreference, setPreference } = useLocalKeys();
  const [isOpen, setIsOpen] = useState(false);
  const [providers, setProviders] = useState<Record<string, ProviderMeta>>({});
  const [liveModels, setLiveModels] = useState<Record<string, ModelItem[]>>({});
  const [selected, setSelected] = useState<{ provider: string; model: string; name?: string }>({
    provider: "google",
    model: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
  });
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch providers registry & user preferences
  useEffect(() => {
    async function loadData() {
      const pref = getPreference();
      setSelected({ provider: pref.provider || "google", model: pref.model || "gemini-3.1-flash-lite" });

      try {
        const res = await fetch("http://localhost:8000/api/v1/providers");
        if (res.ok) {
          const data = await res.json();
          setProviders(data);
        }
      } catch {
        // static fallback
        setProviders({
          google: {
            display_name: "Google Gemini",
            key_prefix: "AIza",
            has_server_key: true,
            models: [
              { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash" },
              { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro" },
              { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite" },
            ],
          },
          openai: {
            display_name: "OpenAI",
            key_prefix: "sk-",
            has_server_key: false,
            models: [
              { id: "gpt-5.6", name: "GPT 5.6" },
              { id: "gpt-5.5", name: "GPT 5.5" },
              { id: "gpt-4o", name: "GPT-4o" },
            ],
          },
          anthropic: {
            display_name: "Anthropic",
            key_prefix: "sk-ant-",
            has_server_key: false,
            models: [
              { id: "claude-fable-5", name: "Claude Fable 5" },
              { id: "claude-opus-4.8", name: "Claude Opus 4.8" },
              { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
            ],
          },
        });
      }
    }
    loadData();
  }, [getPreference]);

  // Dynamically fetch live models when an API key is available for a provider
  useEffect(() => {
    if (!isOpen) return;

    Object.keys(providers).forEach(async (providerKey) => {
      const key = getKey(providerKey);
      if (key && !liveModels[providerKey]) {
        try {
          const res = await fetch("http://localhost:8000/api/v1/providers/models", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: providerKey, api_key: key }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.models && data.models.length > 0) {
              setLiveModels((prev) => ({ ...prev, [providerKey]: data.models }));
            }
          }
        } catch {
          // ignore
        }
      }
    });
  }, [isOpen, providers, getKey, liveModels]);

  const handleSelect = (providerKey: string, model: ModelItem) => {
    setSelected({ provider: providerKey, model: model.id, name: model.name });
    setPreference(providerKey, model.id, model.context_window);
    setIsOpen(false);
  };

  const getModelDisplayName = () => {
    if (selected.name) return selected.name;
    const p = providers[selected.provider];
    if (p) {
      const m = (liveModels[selected.provider] || p.models).find((item) => item.id === selected.model);
      if (m) return m.name;
    }
    return selected.model;
  };

  return (
    <div style={{ position: "relative", display: "inline-block" }} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 10px",
          borderRadius: 6,
          background: "var(--color-surface-elevated)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text)",
          fontSize: "0.78rem",
          fontWeight: 500,
          cursor: "pointer",
          transition: "all 0.15s ease",
        }}
      >
        <span style={{ color: "var(--color-text)", display: "flex" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
          </svg>
        </span>
        <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {getModelDisplayName()}
        </span>
        <span style={{ display: "flex", opacity: 0.6 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </span>
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0,
            width: 280,
            maxHeight: 360,
            overflowY: "auto",
            background: "rgba(22, 20, 16, 0.85)", /* Matches var(--color-surface) but transparent for blur */
            backdropFilter: "blur(12px)",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
            zIndex: 1000,
            padding: 8,
          }}
        >
          <input
            type="text"
            placeholder="Search models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "6px 10px",
              marginBottom: 8,
              background: "var(--color-bg)",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              color: "var(--color-text)",
              fontSize: "0.78rem",
              outline: "none",
            }}
          />

          {Object.entries(providers).map(([providerKey, info]) => {
            const hasUserKey = !!getKey(providerKey);
            const isUnlocked = hasUserKey || info.has_server_key;
            const modelsList = liveModels[providerKey] || info.models || [];
            const filteredModels = modelsList.filter(
              (m) => m.name.toLowerCase().includes(search.toLowerCase()) || m.id.toLowerCase().includes(search.toLowerCase())
            );

            if (search && filteredModels.length === 0) return null;

            return (
              <div key={providerKey} style={{ marginBottom: 8 }}>
                <div
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--color-text-secondary)",
                    padding: "4px 8px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {providerKey === "google" && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                      </svg>
                    )}
                    {providerKey === "openai" && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                        <path d="M2 12h20"/>
                      </svg>
                    )}
                    {providerKey === "anthropic" && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2L2 22h20L12 2z"/>
                      </svg>
                    )}
                    <span>{info.display_name}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {info.has_server_key && (
                      <span style={{ background: "var(--color-surface-elevated)", color: "var(--color-text)", padding: "2px 6px", borderRadius: 4, fontSize: "0.6rem", fontWeight: 700 }}>FREE</span>
                    )}
                    {!isUnlocked && (
                      <span title="API key required in Settings" style={{ display: "flex" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                      </span>
                    )}
                  </div>
                </div>

                {filteredModels.map((m) => {
                  const isSelected = selected.provider === providerKey && selected.model === m.id;

                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!isUnlocked}
                      onClick={() => handleSelect(providerKey, m)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "6px 10px",
                        borderRadius: 6,
                        background: isSelected ? "var(--color-surface-elevated)" : "transparent",
                        border: isSelected ? "1px solid var(--color-border-hover)" : "none",
                        color: !isUnlocked ? "var(--color-text-tertiary)" : isSelected ? "var(--color-white)" : "var(--color-text-secondary)",
                        fontSize: "0.8rem",
                        cursor: !isUnlocked ? "not-allowed" : "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span>{m.name}</span>
                      {isSelected && (
                        <span style={{ color: "var(--color-text)", display: "flex" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}

          <div
            style={{
              borderTop: "1px solid var(--color-border)",
              marginTop: 6,
              paddingTop: 6,
            }}
          >
            <Link
              href="/dashboard/settings"
              onClick={() => setIsOpen(false)}
              style={{
                display: "block",
                padding: "6px 10px",
                color: "var(--color-text-secondary)",
                fontSize: "0.78rem",
                fontWeight: 500,
                textDecoration: "none",
                textAlign: "center",
              }}
            >
              + Add AI provider / API keys
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
