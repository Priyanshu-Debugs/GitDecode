"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import styles from "./page.module.css";

/* ── Developer Profiles Data ────────────────────────────────────── */
const developers = [
  {
    name: "Mihir Patel",
    github: "https://github.com/mihirpatel204",
    githubId: "mihirpatel204",
  },
  {
    name: "Priyanshu Patel",
    github: "https://github.com/Priyanshu-Debugs",
    githubId: "Priyanshu-Debugs",
  },
  {
    name: "Sameer Prajapati",
    github: "https://github.com/Sameer-0904",
    githubId: "Sameer-0904",
  },
];

const snarkyQuotes = [
  "Light mode? Haven't seen daylight since 2014.",
  "No. My retinas are calibrated to #0e0d0b.",
  "It's in the backlog, right under 'rewrite it in Rust'.",
  "Light mode is a YAGNI. Next ticket.",
  "You're a developer. You'll adapt.",
  "Works on my machine. My machine is dark.",
  "I closed that issue as 'wontfix'.",
  "The sun is a single point of failure.",
  "That's a v2 problem. There is no v2.",
  "Add it yourself. PRs welcome. (They're not.)",
  "Dark mode is the default. The default is correct.",
  "Bold of you to assume I take feature requests.",
  "Ask again at 3am. That's when I ship.",
  "Light mode is one more thing to maintain. Pass."
];

export default function DeveloperPage() {
  // Round-robin speech bubble: each click shows on next developer
  const [activeSpeaker, setActiveSpeaker] = useState<number | null>(null);
  const [activeQuote, setActiveQuote] = useState("");
  const speakerIndexRef = useRef(0);   // which developer (0, 1, 2)
  const quoteIndexRef = useRef(0);     // which quote
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleQuoteEvent = () => {
      // Clear previous auto-hide timer
      if (timerRef.current) clearTimeout(timerRef.current);

      // Pick the current developer and quote
      const devIdx = speakerIndexRef.current % 3;
      const quote = snarkyQuotes[quoteIndexRef.current % snarkyQuotes.length];

      // Advance for next click
      speakerIndexRef.current = devIdx + 1;
      quoteIndexRef.current = quoteIndexRef.current + 1;

      // Show bubble on this developer
      setActiveSpeaker(devIdx);
      setActiveQuote(quote);

      // Auto-hide after 4 seconds
      timerRef.current = setTimeout(() => {
        setActiveSpeaker(null);
      }, 4000);
    };

    window.addEventListener("show-snarky-quote", handleQuoteEvent);

    return () => {
      window.removeEventListener("show-snarky-quote", handleQuoteEvent);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <>
      <Navbar />
      <main className={styles.wrap}>
        {/* ── IDE HEADER ─────────────────────────────────────────── */}
        <header className={styles.header}>
          <p className={styles.label}>developer_profiles</p>
          <h1 className={styles.title}>developers.py</h1>
          <p className={styles.subtitle}>
            <span className={styles.comment}># </span>
            The AI engineering team behind GitDecode codebase intelligence.
          </p>
        </header>

        {/* ── CARDS SECTION (MEET THE ENGINEERS — NOW ON TOP & HORIZONTAL) ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Meet the Engineers</h2>
          <div className={styles.cardsGrid}>
            {developers.map((dev, index) => (
              <div key={dev.name} className={styles.card}>
                {/* Logo Avatar Frame with popover speech bubble */}
                <div className={styles.avatarWrapper}>
                  <Image
                    src="/developers.svg"
                    alt={`${dev.name} Avatar`}
                    width={180}
                    height={180}
                    className={styles.avatarImage}
                  />
                  {activeSpeaker === index && (
                    <div className={styles.bubble} role="status" aria-live="polite">
                      {activeQuote}
                    </div>
                  )}
                </div>

                {/* Profile Details */}
                <div className={styles.details}>
                  <div className={styles.headerRow}>
                    <h3 className={styles.devName}>{dev.name}</h3>
                  </div>
                  <div className={styles.actionRow}>
                    <span className={styles.githubId}>id: @{dev.githubId}</span>
                    <a
                      href={dev.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.githubBtn}
                    >
                      github
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── CODE SECTION (IDE Mockup — NOW ON BOTTOM) ──────────── */}
        <section className={styles.section}>
          <div className={styles.editorFrame}>
            <div className={styles.editorBar}>
              <span>developers.py</span>
              <span className={styles.editorMeta}>python3 · UTF-8</span>
            </div>
            <pre className={styles.editorCode}>
              <span className={styles.ln}>
                <span className={styles.codeDim}>from</span> typing <span className={styles.codeDim}>import</span> List, Dict
              </span>
              <span className={styles.ln}>&nbsp;</span>
              <span className={styles.ln}>
                <span className={styles.codeDim}>class</span> <span className={styles.codeClass}>AIEngineer</span>:
              </span>
              <span className={styles.ln}>
                {"    "}<span className={styles.codeDim}>def</span> <span className={styles.codeFunc}>__init__</span>(self, name: str, github_id: str, github: str):
              </span>
              <span className={styles.ln}>
                {"        "}self.name = name
              </span>
              <span className={styles.ln}>
                {"        "}self.github_id = github_id
              </span>
              <span className={styles.ln}>
                {"        "}self.github = github
              </span>
              <span className={styles.ln}>&nbsp;</span>
              <span className={styles.ln}>
                engineers: List[AIEngineer] = [
              </span>
              {developers.map((dev, idx) => (
                <span key={dev.name} className={styles.ln}>
                  {"    "}<span className={styles.codeClass}>AIEngineer</span>(
                  <br />
                  {"        "}name=<span className={styles.codeVal}>"{dev.name}"</span>,
                  <br />
                  {"        "}github_id=<span className={styles.codeVal}>"{dev.githubId}"</span>,
                  <br />
                  {"        "}github=<span className={styles.codeVal}>"{dev.github}"</span>
                  <br />
                  {"    "}){idx < developers.length - 1 ? "," : ""}
                </span>
              ))}
              <span className={styles.ln}>
                ]
              </span>
            </pre>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
