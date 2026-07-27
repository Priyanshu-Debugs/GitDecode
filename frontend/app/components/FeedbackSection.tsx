"use client";

import { useState, useId } from "react";
import { submitFeedback } from "@/app/lib/api";
import { validateEmail } from "@/app/lib/emailValidation";
import styles from "./FeedbackSection.module.css";

export default function FeedbackSection() {
  const nameInputId = useId();
  const emailInputId = useId();
  const messageInputId = useId();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Real-time email validation status
  const emailValidation = email.trim() ? validateEmail(email) : null;

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
    const evalResult = validateEmail(trimmedEmail);
    if (!evalResult.isValid) {
      setErrorMsg(evalResult.message || "Please enter a valid Email ID.");
      return false;
    }

    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setErrorMsg("Message cannot be empty.");
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

      setSuccessMsg(res.message || "Feedback submitted successfully!");
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
          Help us refine GitDecode.
        </h2>
        <p className={styles.sectionSub}>
          <span className={styles.comment}>// </span>
          Submit your questions, feature requests, or developer feedback. All submissions are processed directly by our team.
        </p>

        {/* IDE Editor Window Frame */}
        <div className={styles.panel}>
          {/* Top Window Bar */}
          <div className={styles.panelBar}>
            <div className={styles.panelTitleGroup}>
              <span className={styles.dotRed} />
              <span className={styles.dotYellow} />
              <span className={styles.dotGreen} />
              <span className={styles.fileName}>feedback.go</span>
            </div>
            <div className={styles.panelRightTags}>
              <span className={styles.methodBadge}>POST</span>
              <span className={styles.panelMeta}>package main</span>
            </div>
          </div>

          {/* Code Signature Header */}
          <div className={styles.codeHeaderGutter}>
            <span className={styles.lineNum}>01</span>
            <code className={styles.codeLine}>
              <span className={styles.keyword}>func</span>{" "}
              <span className={styles.funcName}>SendFeedback</span>
              <span className={styles.codeDim}>(name, email, message string) error &#123;</span>
            </code>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit} className={styles.formContent}>
            {/* Field 1: User Name */}
            <div className={styles.fieldRow}>
              <span className={styles.lineNum}>02</span>
              <div className={styles.fieldBody}>
                <label htmlFor={nameInputId} className={styles.fieldLabel}>
                  <span className={styles.codeAmber}>var</span> userName{" "}
                  <span className={styles.codeDim}>string =</span>
                </label>
                <div className={styles.inputWrap}>
                  <span className={styles.promptPrefix}>$</span>
                  <input
                    id={nameInputId}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    className={styles.textInput}
                    disabled={isSubmitting}
                    aria-label="User Name"
                    maxLength={100}
                  />
                </div>
              </div>
            </div>

            {/* Field 2: Email ID */}
            <div className={styles.fieldRow}>
              <span className={styles.lineNum}>03</span>
              <div className={styles.fieldBody}>
                <label htmlFor={emailInputId} className={styles.fieldLabel}>
                  <span className={styles.codeAmber}>var</span> emailId{" "}
                  <span className={styles.codeDim}>string =</span>
                </label>
                <div className={styles.inputWrap}>
                  <span className={styles.promptPrefix}>$</span>
                  <input
                    id={emailInputId}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className={styles.textInput}
                    disabled={isSubmitting}
                    aria-label="Email ID"
                  />
                </div>

                {/* Real-time Email Format Status Badge */}
                {emailValidation && (
                  <div className={styles.emailStatusRow}>
                    {emailValidation.isValid ? (
                      <span className={styles.emailValidBadge}>
                        <span className={styles.badgeCheck}>✓</span> Valid email format
                      </span>
                    ) : (
                      <span className={styles.emailInvalidBadge}>
                        <span className={styles.badgeWarn}>!</span> {emailValidation.message}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Field 3: Message */}
            <div className={styles.fieldRow}>
              <span className={styles.lineNum}>04</span>
              <div className={styles.fieldBody}>
                <div className={styles.labelWithCounter}>
                  <label htmlFor={messageInputId} className={styles.fieldLabel}>
                    <span className={styles.codeAmber}>var</span> message{" "}
                    <span className={styles.codeDim}>string =</span>
                  </label>
                  <span className={styles.charCounter}>
                    {message.length} / 2000 chars
                  </span>
                </div>
                <div className={styles.inputWrap}>
                  <textarea
                    id={messageInputId}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Write your feedback, bug reports, or feature ideas here..."
                    className={styles.textAreaInput}
                    rows={4}
                    disabled={isSubmitting}
                    aria-label="Message"
                    maxLength={2000}
                  />
                </div>
              </div>
            </div>

            {/* Error Alert Badge */}
            {errorMsg && (
              <div className={styles.fieldRow}>
                <span className={styles.lineNum}>05</span>
                <div className={styles.fieldBody}>
                  <div className={styles.errorBadge} role="alert">
                    <span className={styles.errorIcon}>!</span>
                    <span>{errorMsg}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Success Alert Badge */}
            {successMsg && (
              <div className={styles.fieldRow}>
                <span className={styles.lineNum}>05</span>
                <div className={styles.fieldBody}>
                  <div className={styles.successBadge} role="status">
                    <span className={styles.successIcon}>✓</span>
                    <span>{successMsg}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Footer / Submit */}
            <div className={styles.fieldRow}>
              <span className={styles.lineNum}>06</span>
              <div className={styles.fieldBody}>
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
              </div>
            </div>

            <div className={styles.codeFooterGutter}>
              <span className={styles.lineNum}>07</span>
              <code className={styles.codeDim}>&#125;</code>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
