"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import styles from "./page.module.css";
import {
  Shield,
  Key,
  Trash2,
  Database,
  Lock,
  CheckCircle2,
  ChevronRight
} from "lucide-react";

interface SecurityPillar {
  id: number;
  title: string;
  badge: string;
  description: string;
  icon: any;
  techStack: string[];
  details: string[];
}

const securityPillars: SecurityPillar[] = [
  {
    id: 1,
    title: "Supabase JWT Auth",
    badge: "API Guarding",
    description: "Every FastAPI route is protected by token signature verification. We validate Supabase-issued JWTs using HS256 encryption against the server-side private secret.",
    icon: Shield,
    techStack: ["Supabase Auth", "FastAPI Depends", "PyJWT HS256", "Audience Checks"],
    details: [
      "Signature Verification: Every request extracts the Bearer token and decodes it using the SUPABASE_JWT_SECRET.",
      "Audience Constraint: Checks the audience claim (aud) to equal 'authenticated', blocking foreign token recycling.",
      "Role Validation: Validates user context UUID and role parameters."
    ]
  },
  {
    id: 2,
    title: "Bring Your Own Key (BYOK)",
    badge: "Credential Isolation",
    description: "Provider keys (Gemini, OpenAI, Anthropic) are stored 100% locally on your browser. Keys are never sent to GitMesh servers for persistence.",
    icon: Key,
    techStack: ["localStorage", "State Encryption", "TLS Transit", "Browser Storage"],
    details: [
      "Client-Only Persistence: LLM provider keys remain strictly inside the browser's localStorage.",
      "Ephemeral Transit: Keys are sent only in dynamic request headers and are instantly deleted from RAM after completion.",
      "Instant Deletion: Local keys can be wiped from browser storage in one click."
    ]
  },
  {
    id: 3,
    title: "Zero-Retention Ingestion",
    badge: "Transient Storage",
    description: "GitMesh clones repository assets into volatile temporary folders on the worker disk, extracts structural data, and purges the directory completely.",
    icon: Trash2,
    techStack: ["git clone --depth 1", "tempfile.gettempdir()", "shutil.rmtree", "Inngest Workers"],
    details: [
      "Shallow Ingest: Clones only depth-1 target commits, avoiding massive historical source blobs checkouts.",
      "Immediate Deletion: Directories are swept using shutil.rmtree as soon as Tree-sitter finishes graph creation.",
      "Size Constraints: Caps individual code files ingestion sizes to prevent buffer overflows."
    ]
  },
  {
    id: 4,
    title: "Tenant Database Isolation",
    badge: "Data Partitioning",
    description: "Database indexes are partitioned securely. SQL queries strictly validate user ownership, preventing cross-tenant data leaks.",
    icon: Database,
    techStack: ["PostgreSQL Constraints", "Supabase RLS", "user_id Joins", "Parameter Binding"],
    details: [
      "Multi-Tenant Partitioning: Every database table contains user_id indexes, ensuring tenant separation.",
      "Supabase Row-Level Security: Enforces database access controls during active sessions.",
      "Sanitized Parameterization: Avoids SQL injection vectors using parameterized query structures."
    ]
  },
  {
    id: 5,
    title: "TLS 1.3 Encryption",
    badge: "Transit Security",
    description: "All client-to-backend communication is forced over HTTPS TLS 1.3, safeguarding session tokens and API keys in transit.",
    icon: Lock,
    techStack: ["TLS 1.3 Protocol", "HTTPS Enforced", "Secure Cookie Headers", "SSL Handshakes"],
    details: [
      "Man-In-The-Middle Prevention: Strong encryption cipher suites guard session tokens from eavesdroppers.",
      "HSTS Protection: Strict-Transport-Security headers force client browsers to establish HTTPS pipelines only.",
      "Cookie Session Security: Auth cookies are tagged with Secure, SameSite=Lax, and HttpOnly attributes."
    ]
  },
  {
    id: 6,
    title: "Data Privacy & GDPR",
    badge: "Compliance",
    description: "GitMesh enforces strict compliance policies safeguarding code assets. We prioritize local browser isolation and clear tenant data deletion rights.",
    icon: Shield,
    techStack: ["GDPR Policy", "CCPA Guidelines", "Local Encryption", "Atomic Erasure"],
    details: [
      "GDPR Erasure Right: Deleting a repository or profile triggers atomic SQL drops, purging all nodes from disk.",
      "Zero Source Caching: We do not cache or store full source files, preventing intellectual property collection.",
      "No Third-Party Access: Dependency structures and parsed metadata outlines are never shared with third parties."
    ]
  }
];

export default function SecurityPage() {
  const [activePillarId, setActivePillarId] = useState<number>(1);
  const activePillar = securityPillars.find((p) => p.id === activePillarId) || securityPillars[0];

  // State for the developer speech bubble
  const [showBubble, setShowBubble] = useState(false);
  const [bubbleText, setBubbleText] = useState("");
  const bubbleTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleQuoteEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ text: string }>;
      if (customEvent.detail && customEvent.detail.text) {
        setBubbleText(customEvent.detail.text);
        setShowBubble(true);

        if (bubbleTimerRef.current) {
          clearTimeout(bubbleTimerRef.current);
        }

        bubbleTimerRef.current = setTimeout(() => {
          setShowBubble(false);
        }, 4200);
      }
    };

    window.addEventListener("show-snarky-quote", handleQuoteEvent);

    return () => {
      window.removeEventListener("show-snarky-quote", handleQuoteEvent);
      if (bubbleTimerRef.current) {
        clearTimeout(bubbleTimerRef.current);
      }
    };
  }, []);

  return (
    <>
      <Navbar />
      <main className={styles.wrap}>
        {/* ── IDE HEADER ─────────────────────────────────────────── */}
        <header className={styles.header}>
          <div className={styles.logoWrapper}>
            <Image
              src="/developer-logo-refined.svg"
              alt="GitMesh Developer Logo"
              width={140}
              height={140}
              priority
              className={styles.headerLogo}
            />
            {showBubble && (
              <div className={styles.bubble} role="status" aria-live="polite">
                {bubbleText}
              </div>
            )}
          </div>
          <p className={styles.label}>security_architecture</p>
          <h1 className={styles.title}>security.yaml</h1>
          <p className={styles.subtitle}>
            <span className={styles.comment}># </span>
            A detailed outline of GitMesh's data protection ciphers, tenant partition policies, and zero-retention infrastructure rules.
          </p>
        </header>

        {/* ── SIDE-BY-SIDE POSTURE VIEW (CARDS & SPEC INFO) ────────── */}
        <section className={styles.interactiveSection}>
          <div className={styles.paneGrid}>
            
            {/* Column 1: Tabs Selector List */}
            <div className={styles.pillarTabs}>
              <p className={styles.selectorInstruction}>
                # Select a security file tab to inspect specifications:
              </p>
              {securityPillars.map((pillar) => {
                const Icon = pillar.icon;
                const isActive = pillar.id === activePillarId;
                return (
                  <div key={pillar.id} className={styles.pillarAccordionItem}>
                    <button
                      onClick={() => setActivePillarId(pillar.id)}
                      className={`${styles.pillarTabButton} ${isActive ? styles.activePillarTabButton : ""}`}
                    >
                      <div className={styles.pillarTabLeft}>
                        <Icon size={16} className={isActive ? styles.activeIcon : styles.inactiveIcon} />
                        <span className={styles.pillarTitleLabel}>{pillar.title}</span>
                      </div>
                      <div className={styles.pillarTabRight}>
                        <span className={styles.pillarBadge}>{pillar.badge}</span>
                        {isActive && <ChevronRight size={14} className={styles.activeChevron} />}
                      </div>
                    </button>
                    
                    {/* Inline Accordion Content (Visible only on mobile/tablet when active) */}
                    {isActive && (
                      <div className={styles.mobileAccordionContent}>
                        <div className={styles.detailsCard} style={{ marginTop: 12, border: 'none', padding: '16px 8px' }}>
                          <p className={styles.detailsDesc}>{pillar.description}</p>
                          <div className={styles.techPillsRow} style={{ marginBottom: 16 }}>
                            {pillar.techStack.map((tech) => (
                              <span key={tech} className={styles.techPill}>{tech}</span>
                            ))}
                          </div>
                          <h3 className={styles.specsTitle}>Security Specifications</h3>
                          <ul className={styles.specsList}>
                            {pillar.details.map((detail, index) => {
                              const [title, desc] = detail.split(": ");
                              return (
                                <li key={index} className={styles.specsListItem}>
                                  <CheckCircle2 size={14} className={styles.checkIcon} />
                                  <div>
                                    <strong className={styles.specItemTitle}>{title}</strong>
                                    <span className={styles.specItemDesc}>: {desc}</span>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Column 2: Dynamic Specifications Card (Visible on desktop side-by-side) */}
            <div className={styles.detailsWrapper}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={activePillarId}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className={styles.detailsCard}>
                    <div className={styles.detailsCardHeader}>
                      <h2 className={styles.detailsTitle}>{activePillar.title}</h2>
                      <p className={styles.detailsDesc}>{activePillar.description}</p>
                      
                      <div className={styles.techPillsRow}>
                        {activePillar.techStack.map((tech) => (
                          <span key={tech} className={styles.techPill}>{tech}</span>
                        ))}
                      </div>
                    </div>

                    <div className={styles.specsContainer}>
                      <h3 className={styles.specsTitle}>Security Specifications</h3>
                      <ul className={styles.specsList}>
                        {activePillar.details.map((detail, index) => {
                          const [title, desc] = detail.split(": ");
                          return (
                            <li key={index} className={styles.specsListItem}>
                              <CheckCircle2 size={14} className={styles.checkIcon} />
                              <div>
                                <strong className={styles.specItemTitle}>{title}</strong>
                                <span className={styles.specItemDesc}>: {desc}</span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

          </div>
        </section>

        {/* ── SECURITY FAQ SECTION ────────────────────────────────── */}
        <section className={styles.faqSection}>
          <div className={styles.faqHeader}>
            <p className={styles.label}>common_queries</p>
            <h2 className={styles.faqMainTitle}>Security & Privacy FAQ</h2>
          </div>

          <div className={styles.faqGrid}>
            <div className={styles.faqCard}>
              <h3 className={styles.faqQuestion}>Do you store my GitHub password or tokens?</h3>
              <p className={styles.faqAnswer}>
                No. GitMesh uses standard OAuth2 secure checkouts to fetch files. Your credentials are processed transiently in temporary memory or securely managed by GitHub during authentication.
              </p>
            </div>

            <div className={styles.faqCard}>
              <h3 className={styles.faqQuestion}>Is my codebase content cached or stored?</h3>
              <p className={styles.faqAnswer}>
                Only abstract graph maps (classes, function names, and import connections) and raw outlines are persisted inside your tenant space on Supabase. Full file contents are cloned to volatile disk, processed, and completely deleted instantly. We never keep copy caches of your source files.
              </p>
            </div>

            <div className={styles.faqCard}>
              <h3 className={styles.faqQuestion}>Can other users see my parsed repositories?</h3>
              <p className={styles.faqAnswer}>
                No. PostgreSQL row-level checks and secure tenant validation parameters enforce complete workspace isolation. Users can only query repositories associated directly with their unique Supabase authenticated account sub UUID.
              </p>
            </div>

            <div className={styles.faqCard}>
              <h3 className={styles.faqQuestion}>What happens when I delete a repository?</h3>
              <p className={styles.faqAnswer}>
                Deleting a repository triggers an immediate purge. All DB files metadata, graph linkages, and cached diagrams are deleted in an atomic transaction from our active tables.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
