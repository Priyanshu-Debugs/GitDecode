"use client";

import { motion } from "framer-motion";
import styles from "../page.module.css";
import { howItWorksData } from "../lib/howItWorksData";

interface StepItem {
  id: number;
  stepNumber: string;
  title: string;
  headline: string;
  description: string;
  tech: string[];
  codePreview: string;
}

interface HowItWorksData {
  sectionLabel: string;
  title: string;
  subtitle: string;
  steps: StepItem[];
}

export default function HowItWorksSection() {
  const data = howItWorksData;


  return (
    <section id="how-it-works" className={styles.section} style={{ position: "relative", overflow: "hidden" }}>
      <div className={styles.wrap}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <p className={styles.label}>{data.sectionLabel}</p>
          <h2 className={styles.sectionTitle}>{data.title}</h2>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "1.05rem", maxWidth: 640, margin: "12px auto 0" }}>
            {data.subtitle}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 32, position: "relative" }}>
          {/* Vertical connecting gradient line */}
          <div
            style={{
              position: "absolute",
              top: 40,
              bottom: 40,
              left: 28,
              width: 2,
              background: "var(--color-border-hover)",
              opacity: 0.5,
              zIndex: 0,
            }}
          />

          {data.steps.map((step, idx) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              style={{
                position: "relative",
                zIndex: 1,
                display: "grid",
                gridTemplateColumns: "56px 1fr",
                gap: 24,
                background: "var(--color-panel)",
                border: "1px solid var(--color-border)",
                borderRadius: 0,
                padding: "28px 32px",
                boxShadow: "none",
              }}
            >
              {/* Step Badge */}
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 0,
                  background: "var(--color-surface-elevated)",
                  border: "1px solid var(--color-border-hover)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.1rem",
                  fontWeight: 600,
                  color: "var(--color-green)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {step.stepNumber}
              </div>

              {/* Step Main Content */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", fontWeight: 600, color: "var(--color-text)" }}>
                    {step.title}
                  </h3>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem", fontWeight: 500, color: "var(--color-dim)" }}>
                    {step.headline}
                  </span>
                </div>

                <p style={{ color: "var(--color-text-secondary)", fontSize: "0.95rem", lineHeight: 1.6, margin: "10px 0 16px" }}>
                  {step.description}
                </p>

                {/* Tech Pills */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                  {step.tech.map((t, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 500,
                        padding: "3px 10px",
                        borderRadius: 999,
                        background: "transparent",
                        border: "1px solid var(--color-border-hover)",
                        color: "var(--color-dim)",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>

                {/* Mini Code Terminal Preview */}
                <div
                  style={{
                    background: "var(--color-bg)",
                    border: "1px solid var(--color-line)",
                    borderRadius: 0,
                    padding: "10px 14px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.82rem",
                    color: "var(--color-green)",
                    overflowX: "auto",
                  }}
                >
                  {step.codePreview}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
