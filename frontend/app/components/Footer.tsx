import Link from "next/link";
import Image from "next/image";
import styles from "./Footer.module.css";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.wrap}>
        {/* Logo */}
        <Image
          src="/developer-logo-refined.svg"
          alt="GitMesh Developer Logo"
          width={64}
          height={64}
          className={styles.footerLogo}
        />

        {/* Terminal-style quote */}
        <p className={styles.quote}>the best code is the one you understand.</p>

        {/* Terminal prompt */}
        <p className={styles.prompt}>
          <span className={styles.promptGreen}>~/gitmesh ❯</span>{" "}
          <span className={styles.cursor}>▋</span>
        </p>

        {/* Links row */}
        <div className={styles.links}>
          <div className={styles.col}>
            <h3 className={styles.colTitle}>Product</h3>
            <ul className={styles.colList}>
              <li>
                <Link href="#how-it-works" className={styles.colLink}>
                  How It Works
                </Link>
              </li>
              <li>
                <Link href="#" className={styles.colLink}>
                  Docs
                </Link>
              </li>
              <li>
                <Link href="#" className={styles.colLink}>
                  Pricing
                </Link>
              </li>
            </ul>
          </div>
          <div className={styles.col}>
            <h3 className={styles.colTitle}>Legal</h3>
            <ul className={styles.colList}>
              <li>
                <Link href="#" className={styles.colLink}>
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="#" className={styles.colLink}>
                  Terms
                </Link>
              </li>
              <li>
                <Link href="#" className={styles.colLink}>
                  Security
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom meta */}
        <p className={styles.meta}>
          © {new Date().getFullYear()} GitMesh ·{" "}
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.metaLink}
          >
            GitHub
          </a>
        </p>
      </div>
    </footer>
  );
}
