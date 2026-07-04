import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import SectionHeading from "./components/SectionHeading";
import AnimatedSection from "./components/AnimatedSection";
import ChatDemo from "./components/ChatDemo";
import Button from "./components/Button";
import InteractiveDiagram from "./components/InteractiveDiagram";
import styles from "./page.module.css";

/* ── Icons (inline SVGs) ─────────────────────────────────────────── */
function DiagramIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#b01e0a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="8" y="14" width="7" height="7" rx="1" />
      <line x1="6.5" y1="10" x2="6.5" y2="14" />
      <line x1="6.5" y1="14" x2="8" y2="14" />
      <line x1="17.5" y1="10" x2="17.5" y2="14" />
      <line x1="17.5" y1="14" x2="15" y2="14" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#b01e0a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="13" y2="12" />
    </svg>
  );
}

function BlastIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#b01e0a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

/* ── Features Data ───────────────────────────────────────────────── */
const features = [
  {
    icon: <DiagramIcon />,
    title: "Architecture Diagrams",
    description:
      "Auto-generated Mermaid diagrams showing file dependencies, class hierarchies, and call graphs.",
  },
  {
    icon: <ChatIcon />,
    title: "Chat with Your Code",
    description:
      "Ask questions in natural language. Get answers grounded in your actual codebase with file references.",
  },
  {
    icon: <BlastIcon />,
    title: "Blast Radius Analysis",
    description:
      "Understand the downstream impact of any change before touching a single line of code.",
  },
];

/* ── Steps Data ──────────────────────────────────────────────────── */
const steps = [
  {
    number: "01",
    title: "Connect",
    description: "Paste your GitHub repo URL. We clone and parse it automatically.",
  },
  {
    number: "02",
    title: "Analyze",
    description:
      "AI builds a knowledge graph — files, functions, dependencies, and vector embeddings.",
  },
  {
    number: "03",
    title: "Explore",
    description: "Chat, visualize, and understand. Ask anything about your codebase.",
  },
];



/* ═══════════════════════════════════════════════════════════════════
   Landing Page
   ═══════════════════════════════════════════════════════════════════ */

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        {/* ── HERO ──────────────────────────────────────────────── */}
        <section className={styles.hero}>
          <div className={styles.glowBlob1} />
          <div className={styles.glowBlob2} />
          <div className={styles.heroInner}>

            <h1 className={styles.heroTitle}>
              Understand{" "}
              <span className={styles.heroAccent}>
                any
                <svg className={styles.heroUnderline} viewBox="0 0 100 10" fill="none" preserveAspectRatio="none">
                  <path d="M 2 8 Q 50 2 98 8" stroke="#b01e0a" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </span>{" "}
              codebase
              <br />
              in minutes, not months
            </h1>

            <p className={styles.heroSubtitle}>
              GitMesh parses your repository, builds a knowledge graph, and lets
              you explore it through interactive diagrams and natural
              conversation.
            </p>

            <div className={styles.heroCtas}>
              <Button href="/auth/sign-in" size="lg">
                Get Started Free
                <ArrowRight />
              </Button>
              <Button href="#demo-diagram" variant="ghost" size="lg">
                See how it works
                <ChevronDown />
              </Button>
            </div>

            <p className={styles.heroTrust}>
              No credit card required · Free for public repos · GitHub
              integration
            </p>

            {/* Scroll hint */}
            <div className={styles.scrollHint}>
              <ChevronDown />
            </div>
          </div>
        </section>

        {/* ── FEATURES ──────────────────────────────────────────── */}
        <section id="features" className={`section-padding ${styles.section}`}>
          <div className="container">
            <AnimatedSection>
              <SectionHeading
                tag="Features"
                title="Everything you need to understand code"
                subtitle="Three powerful tools working together to give you complete codebase clarity."
                centered
              />
            </AnimatedSection>

            <div className={styles.featuresGrid}>
              {features.map((feature, i) => (
                <AnimatedSection key={feature.title} delay={i * 100} className="h-full">
                  <div className={`${styles.featureCard} h-full`}>
                    <div className={styles.featureIcon}>{feature.icon}</div>
                    <h3 className={styles.featureTitle}>{feature.title}</h3>
                    <p className={styles.featureDesc}>{feature.description}</p>
                  </div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </section>

        {/* ── DIAGRAM DEMO ──────────────────────────────────────── */}
        <section id="demo-diagram" className={`section-padding ${styles.section}`}>
          <div className="container">
            <div className={styles.demoSplit}>
              <AnimatedSection className={styles.demoText}>
                <SectionHeading
                  tag="Visualization"
                  title="See your codebase structure at a glance"
                />
                <ul className={styles.demoBullets}>
                  <li>
                    <span className={styles.bulletDot} />
                    File dependency graphs
                  </li>
                  <li>
                    <span className={styles.bulletDot} />
                    Class and function relationships
                  </li>
                  <li>
                    <span className={styles.bulletDot} />
                    Auto-updated on every sync
                  </li>
                </ul>
              </AnimatedSection>

              <AnimatedSection delay={200} className={styles.demoVisual}>
                <InteractiveDiagram />
              </AnimatedSection>
            </div>
          </div>
        </section>

        {/* ── CHAT DEMO ─────────────────────────────────────────── */}
        <section id="demo-chat" className={`section-padding ${styles.section}`}>
          <div className="container">
            <div className={styles.demoSplit}>
              <AnimatedSection className={styles.demoText}>
                <SectionHeading
                  tag="Conversation"
                  title="Ask anything about the code"
                  subtitle="Natural language Q&A powered by RAG vector search. Every answer cites its source — file path, line numbers, and code snippets."
                />
              </AnimatedSection>

              <AnimatedSection delay={200} className={styles.demoVisual}>
                <ChatDemo />
              </AnimatedSection>
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ──────────────────────────────────────── */}
        <section id="how-it-works" className={`section-padding ${styles.section}`}>
          <div className="container">
            <AnimatedSection>
              <SectionHeading
                tag="How It Works"
                title="From repo URL to full understanding"
                subtitle="Three simple steps. Under sixty seconds."
                centered
              />
            </AnimatedSection>

            <div className={styles.stepsRow}>
              {steps.map((step, i) => (
                <AnimatedSection key={step.number} delay={i * 150}>
                  <div className={styles.step}>
                    <div className={styles.stepNumber}>{step.number}</div>
                    <h3 className={styles.stepTitle}>{step.title}</h3>
                    <p className={styles.stepDesc}>{step.description}</p>
                  </div>
                  {i < steps.length - 1 && (
                    <div className={styles.stepConnector} />
                  )}
                </AnimatedSection>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA BANNER ────────────────────────────────────────── */}
        <section className={styles.ctaSection}>
          <div className="container">
            <AnimatedSection className={styles.ctaInner}>
              <h2 className={styles.ctaTitle}>
                Ready to understand your codebase?
              </h2>
              <p className={styles.ctaSubtitle}>
                Start exploring in under 60 seconds.
              </p>
              <Button href="/auth/sign-in" size="lg">
                Get Started Free
                <ArrowRight />
              </Button>
            </AnimatedSection>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
