"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ChatDemo.module.css";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  source?: string;
}

const DEMO_MESSAGES: ChatMessage[] = [
  {
    role: "user",
    content: "How does the authentication flow work?",
  },
  {
    role: "assistant",
    content:
      "The authentication uses Supabase JWT tokens validated in security.py. Here's the flow:\n\n1. User signs in via Supabase Auth\n2. JWT is sent in the Authorization header\n3. verify_supabase_token() decodes with HS256\n4. User ID extracted from the 'sub' claim",
    source: "security.py:37-77",
  },
  {
    role: "user",
    content: "What happens if I change the Neo4j schema?",
  },
  {
    role: "assistant",
    content:
      "Based on blast radius analysis, changing the Neo4j schema would impact:\n\n• neo4j_client.py — all query methods\n• ingestion.py — node creation pipeline\n• visualizer agent — graph queries\n• blast_radius agent — traversal logic\n\n4 files affected, 12 functions at risk.",
    source: "neo4j_client.py",
  },
];

const TYPING_SPEED = 18;
const MESSAGE_DELAY = 800;
const TYPING_INDICATOR_DURATION = 1200;

export default function ChatDemo() {
  const [visibleMessages, setVisibleMessages] = useState<ChatMessage[]>([]);
  const [typingText, setTypingText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showTypingIndicator, setShowTypingIndicator] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-scroll inside container
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [visibleMessages, typingText, showTypingIndicator]);

  // Main animation driver
  useEffect(() => {
    if (!mounted || isComplete) return;

    let active = true;
    let timerId: NodeJS.Timeout;
    let intervalId: NodeJS.Timeout;

    const runSequence = () => {
      if (currentIndex >= DEMO_MESSAGES.length) {
        setIsComplete(true);
        return;
      }

      const msg = DEMO_MESSAGES[currentIndex];

      if (msg.role === "user") {
        // User message delay
        timerId = setTimeout(() => {
          if (!active) return;
          setVisibleMessages((prev) => [...prev, msg]);
          setCurrentIndex((prev) => prev + 1);
        }, MESSAGE_DELAY);
      } else {
        // Assistant message: show indicator
        setShowTypingIndicator(true);
        timerId = setTimeout(() => {
          if (!active) return;
          setShowTypingIndicator(false);
          setIsTyping(true);
          setTypingText("");

          let charIndex = 0;
          const content = msg.content;

          intervalId = setInterval(() => {
            if (!active) return;
            if (charIndex < content.length) {
              setTypingText(content.slice(0, charIndex + 1));
              charIndex++;
            } else {
              clearInterval(intervalId);
              setIsTyping(false);
              setTypingText("");
              setVisibleMessages((prev) => [...prev, msg]);
              setCurrentIndex((prev) => prev + 1);
            }
          }, TYPING_SPEED);

        }, TYPING_INDICATOR_DURATION);
      }
    };

    runSequence();

    return () => {
      active = false;
      clearTimeout(timerId);
      clearInterval(intervalId);
    };
  }, [mounted, currentIndex, isComplete]);

  // Video looping effect: restart after a short delay once complete
  useEffect(() => {
    if (!isComplete) return;

    const loopTimer = setTimeout(() => {
      setVisibleMessages([]);
      setTypingText("");
      setIsTyping(false);
      setShowTypingIndicator(false);
      setCurrentIndex(0);
      setIsComplete(false);
    }, 6000); // Wait 6 seconds before repeating the typing loop

    return () => clearTimeout(loopTimer);
  }, [isComplete]);

  const handleReplay = () => {
    setVisibleMessages([]);
    setTypingText("");
    setIsTyping(false);
    setShowTypingIndicator(false);
    setCurrentIndex(0);
    setIsComplete(false);
  };

  if (!mounted) {
    return <div className={styles.chatWindow} style={{ height: "480px" }} />;
  }

  return (
    <div ref={containerRef} className={styles.chatWindow}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.windowDots}>
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
          </div>
          <span className={styles.headerTitle}>GitMesh Chat</span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.connectedDot} />
          <span className={styles.connectedText}>my-project</span>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className={styles.messages}>
        {visibleMessages.map((msg, i) => (
          <div
            key={i}
            className={`${styles.message} ${
              msg.role === "user" ? styles.userMessage : styles.assistantMessage
            }`}
          >
            <div className={styles.messageBubble}>
              <p className={styles.messageText}>{msg.content}</p>
              {msg.source && (
                <span className={styles.sourceTag}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                    <polyline points="14,2 14,8 20,8"/>
                  </svg>
                  {msg.source}
                </span>
              )}
            </div>
          </div>
        ))}

        {/* Currently typing assistant message */}
        {isTyping && typingText && (
          <div className={`${styles.message} ${styles.assistantMessage}`}>
            <div className={styles.messageBubble}>
              <p className={styles.messageText}>{typingText}</p>
            </div>
          </div>
        )}

        {/* Typing indicator */}
        {showTypingIndicator && (
          <div className={`${styles.message} ${styles.assistantMessage}`}>
            <div className={styles.typingIndicator}>
              <span className={styles.typingDot} />
              <span className={styles.typingDot} />
              <span className={styles.typingDot} />
            </div>
          </div>
        )}
      </div>

      {/* Input Bar */}
      <div className={styles.inputBar}>
        <input
          type="text"
          placeholder="Ask about your codebase..."
          className={styles.input}
          disabled
        />
        <button className={styles.sendBtn} disabled={!isComplete} onClick={handleReplay}>
          {isComplete ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
