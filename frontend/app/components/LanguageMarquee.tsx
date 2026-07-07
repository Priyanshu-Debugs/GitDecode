"use client";

import React from "react";
import styles from "./LanguageMarquee.module.css";

// ── LANGUAGES DATA LIST with official CDN logo links ────────────────
const languages = [
  { 
    name: "TypeScript", 
    logoUrl: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/typescript/typescript-original.svg", 
    color: "rgba(49, 120, 198, 0.15)" 
  },
  { 
    name: "JavaScript", 
    logoUrl: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/javascript/javascript-original.svg", 
    color: "rgba(247, 223, 30, 0.12)" 
  },
  { 
    name: "Python", 
    logoUrl: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/python/python-original.svg", 
    color: "rgba(55, 118, 171, 0.15)" 
  },
  { 
    name: "Go", 
    logoUrl: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/go/go-original.svg", 
    color: "rgba(0, 173, 216, 0.15)" 
  },
  { 
    name: "Rust", 
    logoUrl: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/rust/rust-original.svg", 
    color: "rgba(222, 165, 132, 0.15)" 
  },
  { 
    name: "C++", 
    logoUrl: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/cplusplus/cplusplus-original.svg", 
    color: "rgba(0, 89, 156, 0.15)" 
  },
  { 
    name: "Java", 
    logoUrl: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/java/java-original.svg", 
    color: "rgba(226, 71, 37, 0.12)" 
  },
  { 
    name: "Ruby", 
    logoUrl: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/ruby/ruby-original.svg", 
    color: "rgba(204, 52, 45, 0.15)" 
  },
  { 
    name: "PHP", 
    logoUrl: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/php/php-original.svg", 
    color: "rgba(119, 123, 180, 0.15)" 
  },
  { 
    name: "Swift", 
    logoUrl: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/swift/swift-original.svg", 
    color: "rgba(240, 81, 56, 0.15)" 
  },
];

export default function LanguageMarquee() {
  const tripleLanguages = [...languages, ...languages, ...languages];

  return (
    <section className={styles.container}>
      <div className={styles.label}>
        Analyzing & visualizing structural patterns in:
      </div>
      <div className={styles.marquee}>
        <div className={styles.track}>
          {tripleLanguages.map((lang, index) => (
            <div
              key={`${lang.name}-${index}`}
              className={styles.badge}
            >
              <div className={styles.iconWrapper}>
                <img 
                  src={lang.logoUrl} 
                  alt={`${lang.name} logo`} 
                  width={20} 
                  height={20} 
                  loading="lazy"
                  className={styles.svgIcon}
                />
              </div>
              <span className={styles.name}>{lang.name}</span>
              <span
                className={styles.statusDot}
                style={{
                  backgroundColor: lang.color.replace(/[^,]+(?=\))/, "1"),
                  boxShadow: `0 0 8px ${lang.color.replace(/[^,]+(?=\))/, "1")}`,
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
