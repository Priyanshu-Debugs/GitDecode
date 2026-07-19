"use client";

import { useState, useRef, useEffect } from "react";
import styles from "@/app/dashboard/dashboard.module.css";
import ModelSelector from "./ModelSelector";
import { getRateLimitStatus } from "@/app/lib/api";
import Link from "next/link";
import { useLocalKeys } from "@/app/lib/useLocalKeys";

interface ChatInputProps {
  repoId?: string;
  onSend: (value: string) => void;
  disabled: boolean;
  initialValue?: string;
  onLimitReached?: () => void;
}

export default function ChatInput({ repoId, onSend, disabled, initialValue = "", onLimitReached }: ChatInputProps) {
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [rateLimit, setRateLimit] = useState<{ remaining_daily: number, remaining_monthly: number, is_developer: boolean } | null>(null);
  const { getPreference, getKey } = useLocalKeys();
  const pref = getPreference();
  const hasOwnKey = !!getKey(pref.provider || "google");
  
  // A heuristic: if it's default google model and user has no key, they are using the default model
  const isDefaultModel = (!pref.provider || pref.provider === "google") && !hasOwnKey;

  const fetchRateLimit = async () => {
    if (!repoId || !isDefaultModel) {
      setRateLimit(null);
      return;
    }
    try {
      const res = await getRateLimitStatus(repoId);
      setRateLimit(res);
      if (res.remaining_daily === 0 && !res.is_developer && onLimitReached) {
        onLimitReached();
      }
    } catch (e) {
      console.error("Failed to fetch rate limit status", e);
    }
  };

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    fetchRateLimit();
    // Poll every 10 seconds just in case
    const interval = setInterval(fetchRateLimit, 10000);
    return () => clearInterval(interval);
  }, [repoId, isDefaultModel]);
  
  // Re-fetch after a short delay when disabled changes (meaning message might have finished sending)
  useEffect(() => {
    if (!disabled) {
      setTimeout(fetchRateLimit, 500);
    }
  }, [disabled]);

  const handleSubmit = () => {
    if (!value.trim() || disabled || isLimitReached) return;
    onSend(value.trim());
    setValue("");
  };

  const [showLimitCard, setShowLimitCard] = useState(false);
  const isLimitReached = Boolean(rateLimit && rateLimit.remaining_daily === 0 && !rateLimit.is_developer);

  useEffect(() => {
    if (isLimitReached) {
      setShowLimitCard(true);
    } else {
      setShowLimitCard(false);
    }
  }, [isLimitReached]);

  return (
    <div className={styles.chatInputBoxFull} style={{ position: 'relative' }}>
      {isLimitReached && showLimitCard && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 24px)',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '90%',
          maxWidth: '420px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 24px 50px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.02) inset',
          zIndex: 100,
          color: 'var(--color-text)',
          animation: 'slideUpFade 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          overflow: 'hidden'
        }}>
          {/* Subtle glowing accent */}
          <div style={{
            position: 'absolute',
            top: 0, left: '10%', right: '10%', height: '1px',
            background: 'linear-gradient(90deg, transparent, var(--color-error), transparent)',
            opacity: 0.6,
            boxShadow: '0 1px 12px var(--color-error)'
          }} />
          
          <button 
            onClick={() => setShowLimitCard(false)}
            style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text)'; e.currentTarget.style.background = 'var(--color-surface-elevated)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
            <div style={{ background: 'rgba(248, 113, 113, 0.08)', color: 'var(--color-error)', border: '1px solid rgba(248, 113, 113, 0.15)', borderRadius: '12px', width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: 'inset 0 0 12px rgba(248, 113, 113, 0.05)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--color-text)' }}>Usage Limit Reached</h3>
            </div>
          </div>
          
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '24px', lineHeight: 1.6 }}>
            You&apos;ve reached your daily limit of <strong style={{ color: 'var(--color-text)' }}>3 messages</strong> using the default model. Bring your own API key to continue exploring your codebase without restrictions.
          </p>
          
          <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
            <Link href="/dashboard/settings" className="btn" style={{ flex: 1, justifyContent: 'center', padding: '10px 12px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text)' }}>
              Configure API Key
            </Link>
            <Link href="/pricing" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', padding: '10px 12px' }}>
              Upgrade to Pro
            </Link>
          </div>
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes slideUpFade {
              from { opacity: 0; transform: translate(-50%, 12px) scale(0.97); }
              to { opacity: 1; transform: translate(-50%, 0) scale(1); }
            }
          `}} />
        </div>
      )}
      <textarea
        ref={textareaRef}
        placeholder="Ask anything about the codebase..."
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        disabled={disabled}
        style={{
          background: "transparent",
          border: "none",
          outline: "none",
          resize: "none",
          width: "100%",
          padding: "4px 8px",
          fontSize: "0.8125rem",
          color: "var(--color-text)",
          minHeight: "40px",
          maxHeight: "120px",
          fontFamily: "var(--font-sans)",
        }}
      />
      <div className={styles.chatToolbar}>
        <div className={styles.chatToolbarLeft}>
          <ModelSelector />
          {rateLimit && !rateLimit.is_developer && isDefaultModel && (
            <span style={{ 
              fontSize: '0.7rem', 
              color: rateLimit.remaining_daily <= 1 ? 'var(--color-error)' : 'var(--color-text-secondary)',
              background: 'var(--color-surface-elevated)',
              padding: '2px 8px',
              borderRadius: '12px',
              marginLeft: '8px'
            }}>
              {rateLimit.remaining_daily} daily remaining
            </span>
          )}
          {rateLimit?.is_developer && (
            <span style={{ 
              fontSize: '0.7rem', 
              color: 'var(--color-primary)',
              background: 'rgba(56, 189, 248, 0.1)',
              padding: '2px 8px',
              borderRadius: '12px',
              marginLeft: '8px',
              fontWeight: 600
            }}>
              Developer Bypass
            </span>
          )}
        </div>
        <div className={styles.chatToolbarRight}>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSubmit}
            disabled={disabled || !value.trim() || isLimitReached}
            style={{
              width: 32,
              height: 32,
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              opacity: disabled || !value.trim() || isLimitReached ? 0.5 : 1,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
