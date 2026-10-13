/**
 * GitDecode — Local API Key Management Hook
 * =========================================
 * Keys are stored ONLY in the browser's localStorage under "gitdecode_api_keys".
 * They are NEVER sent to the server for storage — only included in chat request payloads.
 * 
 * localStorage schema:
 * {
 *   "openai": "sk-...",
 *   "anthropic": "sk-ant-...",
 *   "google": "AIza...",
 *   "groq": "gsk_...",
 *   "mistral": "...",
 *   "openrouter": "sk-or-..."
 * }
 */

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "gitdecode_api_keys";
const PREF_KEY = "gitdecode_preferred_model";

export interface LLMConfig {
  provider: string;
  model: string;
  api_key: string | null;
  context_window?: number;
}

export function useLocalKeys() {
  const [keys, setKeysState] = useState<Record<string, string>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setKeysState(JSON.parse(stored));
    } catch {
      // ignore
    }
  }, []);

  const getKeys = useCallback((): Record<string, string> => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }, []);

  const getKey = useCallback((provider: string): string | null => {
    const allKeys = getKeys();
    return allKeys[provider.toLowerCase()] || null;
  }, [getKeys]);

  const setKey = useCallback((provider: string, key: string): void => {
    const p = provider.toLowerCase();
    const current = getKeys();
    const updated = { ...current, [p]: key.trim() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setKeysState(updated);
  }, [getKeys]);

  const removeKey = useCallback((provider: string): void => {
    const p = provider.toLowerCase();
    const current = getKeys();
    delete current[p];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    setKeysState(current);
  }, [getKeys]);

  const hasKey = useCallback((provider: string): boolean => {
    return !!getKey(provider);
  }, [getKey]);

  const getPreference = useCallback((): { provider: string; model: string; context_window?: number } => {
    if (typeof window === "undefined") return { provider: "google", model: "gemini-3.5-flash-lite", context_window: 1000000 };
    try {
      const stored = localStorage.getItem(PREF_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Migrate legacy model names
        if (parsed.model === "gemini-3.5-flash") {
          parsed.model = "gemini-3.5-flash-lite";
          localStorage.setItem(PREF_KEY, JSON.stringify(parsed));
        }
        return parsed;
      }
    } catch {}
    return { provider: "google", model: "gemini-3.5-flash-lite", context_window: 1000000 };
  }, []);

  const setPreference = useCallback((provider: string, model: string, context_window?: number): void => {
    if (typeof window === "undefined") return;
    localStorage.setItem(PREF_KEY, JSON.stringify({ provider, model, context_window }));
  }, []);

  const getActiveLLMConfig = useCallback((): LLMConfig => {
    const pref = getPreference();
    const provider = pref.provider || "google";
    const model = pref.model || "gemini-3.5-flash-lite";
    const context_window = pref.context_window || 1000000;
    const key = getKey(provider);
    return { provider, model, api_key: key, context_window };
  }, [getPreference, getKey]);

  return { keys, getKey, setKey, removeKey, hasKey, getKeys, getPreference, setPreference, getActiveLLMConfig };
}
