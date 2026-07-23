"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import { useAuth } from "@/app/lib/useAuth";
import { submitProRequest } from "@/app/lib/api";
import styles from "./page.module.css";
import { Check, Rocket, Tag, ArrowLeft } from "lucide-react";

export default function CheckoutPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth(true);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponValid, setCouponValid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  // Pre-fill email from logged in user
  useEffect(() => {
    if (user?.email) {
      setEmail(user.email);
    }
  }, [user]);

  const handleCouponChange = (val: string) => {
    setCouponCode(val);
    setCouponValid(val.trim().toUpperCase() === "GOPROFREE");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!couponValid) {
      setError("Please enter a valid coupon code.");
      return;
    }

    if (!firstName || !lastName || !mobile || !email || !address) {
      setError("Please fill in all required fields.");
      return;
    }

    setSubmitting(true);
    try {
      await submitProRequest({
        first_name: firstName,
        last_name: lastName,
        mobile,
        email,
        address,
        coupon_code: couponCode.trim().toUpperCase(),
      });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Failed to submit request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <>
        <Navbar />
        <main className={styles.wrap}>
          <p style={{ color: "var(--color-dim)", fontFamily: "var(--font-mono)" }}>
            Loading checkout...
          </p>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className={styles.wrap}>
        {/* Back link */}
        <Link href="/pricing" className={styles.backLink}>
          <ArrowLeft size={14} /> back to pricing.js
        </Link>

        {/* Header */}
        <header className={styles.header}>
          <p className={styles.label}>pro_upgrade_request</p>
          <h1 className={styles.title}>checkout.py</h1>
          <p className={styles.subtitle}>
            <span className={styles.comment}># </span>
            Complete your details below to request a Developer (Pro) plan upgrade.
          </p>
        </header>

        {/* Checkout Grid */}
        <div className={styles.checkoutGrid}>
          {/* Order Summary Column */}
          <div className={styles.summaryCard}>
            <div className={styles.cardHeader}>
              <Rocket size={16} className={styles.activeIcon} />
              <span className={styles.cardName}>order_summary.json</span>
            </div>
            <div className={styles.summaryBody}>
              <div className={styles.planName}>Developer.py</div>
              <div className={styles.priceRow}>
                <span className={styles.originalPrice}>₹1,999</span>
                <span className={styles.price}>₹999</span>
                <span className={styles.period}>/month</span>
              </div>
              <span className={styles.promoTag}>50% OFF INTRODUCTORY PROMO</span>

              <ul className={styles.featuresList}>
                <li className={styles.featureItem}>
                  <Check size={14} className={styles.checkIcon} />
                  <span>Public & Private repositories sync</span>
                </li>
                <li className={styles.featureItem}>
                  <Check size={14} className={styles.checkIcon} />
                  <span>Depth-3 Deep-Scan BFS graph walk</span>
                </li>
                <li className={styles.featureItem}>
                  <Check size={14} className={styles.checkIcon} />
                  <span>Priority ingestion queuing</span>
                </li>
                <li className={styles.featureItem}>
                  <Check size={14} className={styles.checkIcon} />
                  <span>Pre-warmed Gemini Context Caching</span>
                </li>
                <li className={styles.featureItem}>
                  <Check size={14} className={styles.checkIcon} />
                  <span>Dedicated Slack priority channel</span>
                </li>
                <li className={styles.featureItem}>
                  <Check size={14} className={styles.checkIcon} />
                  <span>Unlimited diagram compilations</span>
                </li>
              </ul>

              <div className={styles.paymentNote}>
                <span className={styles.comment}>// Payment gateway integration coming soon.</span>
                <br />
                <span className={styles.comment}>// Apply coupon code GOPROFREE for access request.</span>
              </div>
            </div>
          </div>

          {/* Form Column */}
          <div className={styles.formCard}>
            <div className={styles.cardHeader}>
              <span className={styles.cardName}>your_details.yaml</span>
            </div>

            {submitted ? (
              <div className={styles.successState}>
                <div className={styles.successIcon}>✓</div>
                <h3>Request Submitted!</h3>
                <p>
                  Our team will review your request and notify you via email at{" "}
                  <strong>{email}</strong>.
                </p>
                <Link href="/dashboard" className={styles.dashboardLink}>
                  Go to Dashboard →
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className={styles.form}>
                {error && <div className={styles.errorBanner}>[!] {error}</div>}

                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <label>first_name</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="John"
                      required
                    />
                  </div>
                  <div className={styles.field}>
                    <label>last_name</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe"
                      required
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <label>mobile_number</label>
                  <input
                    type="tel"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="+91-9876543210"
                    required
                  />
                </div>

                <div className={styles.field}>
                  <label>email_id</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div className={styles.field}>
                  <label>address</label>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="City, State, Country, Postal Code"
                    required
                  />
                </div>

                {/* Coupon Code Input */}
                <div className={styles.couponSection}>
                  <div className={styles.couponHeader}>
                    <Tag size={14} />
                    <span>coupon_code</span>
                  </div>
                  <div className={styles.couponInputWrap}>
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(e) => handleCouponChange(e.target.value)}
                      placeholder="Enter coupon code"
                      className={couponValid ? styles.couponInputValid : styles.couponInput}
                    />
                    {couponValid && (
                      <div className={styles.couponSuccess}>
                        <Check size={14} /> Coupon Applied! Your request will be reviewed by our team.
                      </div>
                    )}
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={
                    !couponValid ||
                    !firstName ||
                    !lastName ||
                    !mobile ||
                    !email ||
                    !address ||
                    submitting
                  }
                  className={styles.submitButton}
                >
                  {submitting ? "submitting..." : "submit request"}
                </button>

                {!couponValid && couponCode.length > 0 && (
                  <p className={styles.couponHint}>
                    // Invalid coupon code. Check your code and try again.
                  </p>
                )}
                {!couponValid && couponCode.length === 0 && (
                  <p className={styles.couponHint}>
                    // Enter a valid coupon code to submit. Payment integration coming soon.
                  </p>
                )}
              </form>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
