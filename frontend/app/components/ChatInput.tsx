"use client";

import { useState, useRef, useEffect } from "react";
import styles from "@/app/dashboard/dashboard.module.css";
import ModelSelector from "./ModelSelector";

interface ChatInputProps {
  onSend: (value: string) => void;
  disabled: boolean;
  initialValue?: string;
}

export default function ChatInput({ onSend, disabled, initialValue = "" }: ChatInputProps) {
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleSubmit = () => {
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    setValue("");
  };

  return (
    <div className={styles.chatInputBoxFull}>
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
        </div>
        <div className={styles.chatToolbarRight}>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSubmit}
            disabled={disabled || !value.trim()}
            style={{
              width: 32,
              height: 32,
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              opacity: disabled || !value.trim() ? 0.5 : 1,
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
