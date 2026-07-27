"use client";

import { useState } from "react";
import { submitFeedback } from "@/app/lib/api";
import styles from "./FeedbackSection.module.css";

export default function FeedbackSection() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const validateForm = (): boolean => {
    setErrorMsg(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg("User name is required.");
      return false;
    }
    if (trimmedName.length < 2) {
      setErrorMsg("User name must be at least 2 characters long.");
      return false;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMsg("Email ID is required.");
      return false;
    }
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(trimmedEmail)) {
      setErrorMsg("Please enter a valid Email ID (e.g. name@domain.com).");
      return false;
    }

    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setErrorMsg("Message is required.");
      return false;
    }
    if (trimmedMessage.length < 5) {
      setErrorMsg("Message must be at least 5 characters long.");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg(null);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await submitFeedback({
        name: name.trim(),
        email: email.trim(),
        message: message.trim(),
      });

      setSuccessMsg(res.message || "Feedback sent successfully!");
      setName("");
      setEmail("");
      setMessage("");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to submit feedback. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className={styles.section} id="feedback">
      <div className={styles.wrap}>
        <p className={styles.label}>feedback</p>
        <h2 className={styles.sectionTitle}>
          Help us improve GitDecode.
        </h2>
        <p className={styles.sectionSub}>
          <span className={styles.comment}>// </span>
          Have a suggestion, bug report, or feature request? We read every submission.
        </p>

        {/* Code Panel styled like developer editor */}
        <div className={styles.panel}>
          <div className={styles.panelBar}>
            <div className={styles.panelTitleGroup}>
              <span className={styles.dotRed} />
              <span className={styles.dotYellow} />
              <span className={styles.dotGreen} />
              <span className={styles.fileName}>feedback.go</span>
            </div>
            <span className={styles.panelMeta}>package main</span>
          </div>

          <form onSubmit={handleSubmit} className={styles.formContent}>
            {/* Field 1: User Name */}
            <div className={styles.fieldGroup}>
              <label htmlFor="feedback-name" className={styles.fieldLabel}>
                <span className={styles.codeAmber}>var</span> userName{" "}
                <span className={styles.codeDim}>string</span> =
              </label>
              <div className={styles.inputWrap}>
                <span className={styles.promptPrefix}>$</span>
                <input
                  id="feedback-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  className={styles.textInput}
                  disabled={isSubmitting}
                  aria-label="User name"
                />
              </div>
            </div>

            {/* Field 2: Email ID */}
            <div className={styles.fieldGroup}>
              <label htmlFor="feedback-email" className={styles.fieldLabel}>
                <span className={styles.codeAmber}>var</span> emailId{" "}
                <span className={styles.codeDim}>string</span> =
              </label>
              <div className={styles.inputWrap}>
                <span className={styles.promptPrefix}>$</span>
                <input
                  id="feedback-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className={styles.textInput}
                  disabled={isSubmitting}
                  aria-label="Email ID"
                />
              </div>
            </div>

            {/* Field 3: Message */}
            <div className={styles.fieldGroup}>
              <label htmlFor="feedback-message" className={styles.fieldLabel}>
                <span className={styles.codeAmber}>var</span> message{" "}
                <span className={styles.codeDim}>string</span> =
              </label>
              <div className={styles.inputWrap}>
                <span className={styles.promptPrefix}>//</span>
                <textarea
                  id="feedback-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Write your feedback, questions, or ideas here..."
                  className={styles.textAreaInput}
                  rows={4}
                  disabled={isSubmitting}
                  aria-label="Message"
                />
              </div>
            </div>

            {/* Error Badge */}
            {errorMsg && (
              <div className={styles.errorBadge} role="alert">
                <span className={styles.errorIcon}>!</span>
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Success Badge */}
            {successMsg && (
              <div className={styles.successBadge} role="status">
                <span className={styles.successIcon}>✓</span>
                <span>{successMsg}</span>
              </div>
            )}

            {/* Actions */}
            <div className={styles.formFooter}>
              <p className={styles.destNote}>
                <span className={styles.comment}>// </span>
                Sends to <span className={styles.codeAmber}>gitdecode.support@gmail.com</span>
              </p>
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className={styles.spinner} /> Sending...
                  </>
                ) : (
                  <>go run feedback.go →</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
