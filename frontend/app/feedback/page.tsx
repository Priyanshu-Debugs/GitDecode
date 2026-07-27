"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import FeedbackSection from "@/app/components/FeedbackSection";
import styles from "./page.module.css";

export default function FeedbackPage() {
  // State for the developer speech bubble when clicking light mode
  const [showBubble, setShowBubble] = useState(false);
  const [bubbleText, setBubbleText] = useState("");
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleQuoteEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ text: string }>;
      if (customEvent.detail && customEvent.detail.text) {
        setBubbleText(customEvent.detail.text);
        setShowBubble(true);

        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }

        timerRef.current = setTimeout(() => {
          setShowBubble(false);
        }, 4200);
      }
    };

    window.addEventListener("show-snarky-quote", handleQuoteEvent);

    return () => {
      window.removeEventListener("show-snarky-quote", handleQuoteEvent);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <>
      <Navbar />
      <main className={styles.main}>
        {/* Page Hero Header with Developer Logo */}
        <header className={styles.hero}>
          <div className={styles.wrap}>
            <div className={styles.logoWrapper}>
              <Image
                src="/developer-logo-refined.svg"
                alt="GitDecode Developer Logo"
                width={120}
                height={120}
                priority
                className={styles.heroLogo}
              />
              {showBubble && (
                <div className={styles.bubble} role="status" aria-live="polite">
                  {bubbleText}
                </div>
              )}
            </div>

            <h1 className={styles.title}>
              Developer Feedback &amp; Suggestions
            </h1>
            <p className={styles.sub}>
              <span className={styles.comment}>// </span>
              GitDecode is continuously evolving. Share your suggestions, report issues, or propose new tools to help us make codebase intelligence better for everyone.
            </p>
          </div>
        </header>

        {/* Feedback Section Form */}
        <FeedbackSection />
      </main>
      <Footer />
    </>
  );
}
