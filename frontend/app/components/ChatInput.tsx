"use client";

import { useState, useRef, useEffect } from "react";
import styles from "@/app/dashboard/dashboard.module.css";
import ModelSelector from "./ModelSelector";
import { getRateLimitStatus } from "@/app/lib/api";
import { useAuth } from "@/app/lib/useAuth";
import { isDeveloperAccount } from "@/app/lib/developers";
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
  const { user } = useAuth(false);
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [rateLimit, setRateLimit] = useState<{ remaining_daily: number, remaining_monthly: number, is_developer: boolean } | null>(null);
  const { getPreference, getKey } = useLocalKeys();
  const pref = getPreference();
  const hasOwnKey = !!getKey(pref.provider || "google");
  
  // A heuristic: if it's default google model and user has no key, they are using the default model
  const isDefaultModel = (!pref.provider || pref.provider === "google") && !hasOwnKey;
  const isMasterDeveloper = isDeveloperAccount(user) || Boolean(rateLimit?.is_developer);

  const fetchRateLimit = async () => {
    if (!repoId || !isDefaultModel) {
      setRateLimit(null);
      return;
    }
    try {
      const res = await getRateLimitStatus(repoId);
      setRateLimit(res);
      if (res.remaining_daily === 0 && !res.is_developer && !isDeveloperAccount(user) && onLimitReached) {
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (!value.trim() || disabled || isLimitReached) return;
    onSend(value.trim());
    setValue("");
  };

  const isLimitReached = Boolean(!isMasterDeveloper && rateLimit && rateLimit.remaining_daily === 0 && isDefaultModel);

  return (
    <div style={{ width: '100%' }}>
      {isLimitReached && (
        <div style={{
          width: '100%',
          background: 'var(--color-surface)',
          border: '1px solid rgba(248, 113, 113, 0.3)',
          borderRadius: '16px',
          padding: '20px 24px',
          marginBottom: '16px',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(248, 113, 113, 0.15) inset',
          color: 'var(--color-text)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Glowing Top Accent Line */}
          <div style={{
            position: 'absolute',
            top: 0, left: '5%', right: '5%', height: '2px',
            background: 'linear-gradient(90deg, transparent, #ef4444, transparent)',
            opacity: 0.85
          }} />
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
            <div style={{
              background: 'rgba(248, 113, 113, 0.1)',
              color: '#ef4444',
              border: '1px solid rgba(248, 113, 113, 0.25)',
              borderRadius: '12px',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
                Daily Usage Limit Reached (0/3 Messages)
              </h3>
              <p style={{ margin: '3px 0 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                You have reached your daily limit of 3 free messages using the default model. Bring your own API key or upgrade to Pro to continue.
              </p>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
            <Link 
              href="/dashboard/settings" 
              className="btn btn-ghost btn-sm" 
              style={{ 
                padding: '9px 16px', 
                border: '1px solid var(--color-border-hover)', 
                background: 'var(--color-surface-elevated)', 
                color: 'var(--color-text)', 
                fontSize: '0.8125rem',
                borderRadius: '10px',
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <path d="M6 12h4" />
                <circle cx="16" cy="12" r="2" />
              </svg>
              Configure API Key
            </Link>

            <Link 
              href="/pricing" 
              className="btn btn-sm" 
              style={{ 
                padding: '9px 18px', 
                background: 'var(--color-primary)', 
                color: 'var(--color-primary-text)', 
                fontSize: '0.8125rem',
                fontWeight: 600,
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                boxShadow: '0 4px 16px rgba(131, 193, 103, 0.25)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              Upgrade to Pro
            </Link>
          </div>
        </div>
      )}

      <div className={styles.chatInputBoxFull} style={{ position: 'relative' }}>
        <textarea
          ref={textareaRef}
          placeholder={isLimitReached ? "Daily free message limit reached (0/3). Configure API Key or upgrade to continue." : "Ask anything about the codebase..."}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          disabled={disabled || isLimitReached}
          style={{
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "none",
            width: "100%",
            padding: "4px 8px",
            fontSize: "0.8125rem",
            color: isLimitReached ? "var(--color-text-tertiary)" : "var(--color-text)",
            minHeight: "40px",
            maxHeight: "120px",
            fontFamily: "var(--font-sans)",
            cursor: isLimitReached ? "not-allowed" : "text"
          }}
        />
        <div className={styles.chatToolbar}>
          <div className={styles.chatToolbarLeft}>
            <ModelSelector />
            {rateLimit && !isMasterDeveloper && isDefaultModel && (
              <span style={{ 
                fontSize: '0.725rem', 
                fontWeight: 500,
                color: rateLimit.remaining_daily === 0 ? 'var(--color-error)' : rateLimit.remaining_daily === 1 ? '#f59e0b' : 'var(--color-text-secondary)',
                background: rateLimit.remaining_daily === 0 ? 'rgba(239, 68, 68, 0.12)' : 'var(--color-surface-elevated)',
                border: rateLimit.remaining_daily === 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--color-border)',
                padding: '2px 10px',
                borderRadius: '12px',
                marginLeft: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                {rateLimit.remaining_daily === 0 ? '0/3 Daily Messages (Limit Reached)' : `${rateLimit.remaining_daily}/3 Daily Messages`}
              </span>
            )}
            {isMasterDeveloper && (
              <span style={{ 
                fontSize: '0.7rem', 
                color: '#e08a4a',
                background: 'rgba(224, 138, 74, 0.12)',
                border: '1px solid #e08a4a',
                padding: '2px 9px',
                borderRadius: '12px',
                marginLeft: '8px',
                fontWeight: 700,
                letterSpacing: '0.02em',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                Developer
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
                cursor: isLimitReached ? "not-allowed" : "pointer"
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
    </div>
  );
}
