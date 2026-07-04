"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Button from "./Button";
import styles from "./Navbar.module.css";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className={styles.navbar}>
      <div className={styles.inner}>
        {/* Logo */}
        <Link href="/" className={styles.logo}>
          <Image src="/logo.svg" alt="GitMesh Logo" width={112} height={28} priority className={styles.logoImage} />
        </Link>

        {/* Desktop Nav */}
        <div className={styles.desktopNav}>
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className={styles.navLink}>
              {link.label}
            </a>
          ))}
        </div>

        {/* Desktop Actions */}
        <div className={styles.desktopActions}>
          <Button href="/auth/sign-in" variant="ghost" size="sm">
            Sign In
          </Button>
          <Button href="/auth/sign-in" size="sm">
            Get Started
          </Button>
        </div>

        {/* Mobile Hamburger */}
        <button
          className={styles.hamburger}
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
        >
          <span className={`${styles.hamburgerLine} ${mobileOpen ? styles.open1 : ""}`} />
          <span className={`${styles.hamburgerLine} ${mobileOpen ? styles.open2 : ""}`} />
          <span className={`${styles.hamburgerLine} ${mobileOpen ? styles.open3 : ""}`} />
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className={styles.mobileMenu}>
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={styles.mobileLink}
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <div className={styles.mobileDivider} />
          <Link
            href="/auth/sign-in"
            className={styles.mobileLink}
            onClick={() => setMobileOpen(false)}
          >
            Sign In
          </Link>
          <Link
            href="/auth/sign-in"
            className={styles.mobileGetStarted}
            onClick={() => setMobileOpen(false)}
          >
            Get Started
          </Link>
        </div>
      )}
    </nav>
  );
}
