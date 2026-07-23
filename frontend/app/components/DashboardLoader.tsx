"use client";

import { useState, useEffect } from "react";
import styles from "../dashboard/dashboard.module.css";

const QUOTES = [
  { text: "There are only 10 types of people in the world: those who understand binary, and those who don't.", author: "Classic Dev Joke" },
  { text: "Why do programmers wear glasses? Because they can't C#.", author: "Developer Humor" },
  { text: "A SQL query walks into a bar, walks up to two tables and asks, 'Can I join you?'", author: "Database Humor" },
  { text: "To understand recursion, you must first understand recursion.", author: "Programming Logic" },
  { text: "The best thing about a boolean is even if you are wrong, you are only off by a bit.", author: "Boolean Wisecrack" },
  { text: "Any fool can write code that a computer can understand. Good programmers write code that humans can understand.", author: "Martin Fowler" },
  { text: "Why did the programmer quit their job? Because they didn't get arrays.", author: "Array Humor" },
  { text: "There are two ways to write error-free programs; only the third one works.", author: "Alan J. Perlis" },
  { text: "Computers are fast; programmers are slow.", author: "Surgical Wisdom" },
  { text: "A program is never complete; it is only abandoned.", author: "Dev Proverb" }
];

export default function DashboardLoader() {
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setQuoteIndex((prev) => (prev + 1) % QUOTES.length);
        setFade(true);
      }, 300); // match transition speed
    }, 3800);

    return () => clearInterval(interval);
  }, []);

  const currentQuote = QUOTES[quoteIndex];

  return (
    <div className={styles.loaderContainer}>
      {/* Background Ambient Glow */}
      <div className={styles.loaderGlow} />

      {/* SVG Animated Network Map */}
      <div className={styles.logoNetwork}>
        <svg width="280" height="160" viewBox="0 0 280 160" fill="none" className={styles.loaderSvg}>
          {/* Pulsing connections */}
          <path d="M 50 80 Q 105 40 140 80" className={styles.pulsingPath} />
          <path d="M 50 80 Q 105 120 140 80" className={styles.pulsingPath} />
          <path d="M 140 80 H 230" className={styles.pulsingPath} />
          <path d="M 140 80 L 190 35" className={styles.pulsingPath} />
          <path d="M 140 80 L 190 125" className={styles.pulsingPath} />
          <path d="M 190 35 L 230 80" className={styles.pulsingPath} />
          <path d="M 190 125 L 230 80" className={styles.pulsingPath} />

          {/* Connection Line GitHub to GitDecode */}
          <line x1="50" y1="80" x2="140" y2="80" className={styles.pulsingLine} />

          {/* GitHub Node on the Left */}
          <circle cx="50" cy="80" r="24" className={styles.hubNodeOuter} />
          <circle cx="50" cy="80" r="20" className={styles.hubNodeInner} />
          {/* GitHub Mini-Icon (SVG Octocat Silhouette) */}
          <g transform="translate(39, 69) scale(0.9)" fill="#ffffff">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.11.82-.26.82-.577v-2.234c-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22v3.293c0 .319.22.694.825.576C20.565 21.795 24 17.3 24 12c0-6.63-5.37-12-12-12z" />
          </g>

          {/* GitDecode Logo Node in the Center */}
          <rect x="98" y="58" width="84" height="44" rx="22" className={styles.gitdecodeNodeOuterRect} />
          <rect x="102" y="62" width="76" height="36" rx="18" className={styles.gitdecodeNodeInnerRect} />
          {/* GitDecode Logo Image */}
          <image href="/logo.svg" x="110" y="68" width="60" height="24" />

          {/* Floating Orbiting Codebase Nodes */}
          {/* Node 1: Lexer */}
          <g className={styles.orbitGroup1}>
            <circle cx="190" cy="35" r="12" className={styles.codeNodeOuter} />
            <circle cx="190" cy="35" r="8" className={styles.codeNodeInner} />
          </g>
          {/* Node 2: AST */}
          <g className={styles.orbitGroup2}>
            <circle cx="230" cy="80" r="14" className={styles.codeNodeOuter} style={{ animationDelay: "-1s" }} />
            <circle cx="230" cy="80" r="10" className={styles.codeNodeInner} />
          </g>
          {/* Node 3: Linker */}
          <g className={styles.orbitGroup3}>
            <circle cx="190" cy="125" r="12" className={styles.codeNodeOuter} style={{ animationDelay: "-2s" }} />
            <circle cx="190" cy="125" r="8" className={styles.codeNodeInner} />
          </g>
        </svg>

        {/* Pulsing Core Radar Ring */}
        <div className={styles.radarRing} />
      </div>

      {/* Rotating Computer Science Quote Container */}
      <div className={`${styles.quoteContainer} ${fade ? styles.fadeIn : styles.fadeOut}`}>
        <p className={styles.quoteText}>&ldquo;{currentQuote.text}&rdquo;</p>
        <span className={styles.quoteAuthor}>&mdash; {currentQuote.author}</span>
        
        {/* Loading Progress Bar Indicator */}
        <div className={styles.loaderBarWrapper}>
          <div className={styles.loaderProgressBar} />
        </div>
      </div>
    </div>
  );
}
