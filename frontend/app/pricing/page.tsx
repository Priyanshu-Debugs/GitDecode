"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import styles from "./page.module.css";
import { Check, Terminal, ShieldAlert, Cpu, Heart, Rocket, Building } from "lucide-react";
import { useAuth } from "@/app/lib/useAuth";
import { useSubscription } from "@/app/lib/useSubscription";
import { upgradeUserSubscription, getProRequestStatus } from "@/app/lib/api";



interface PricingPlan {
  id: string;
  name: string;
  price: string;
  originalPrice?: string;
  promoText?: string;
  period: string;
  icon: any;
  description: string;
  features: string[];
  buttonText: string;
  buttonLink: string;
  recommended: boolean;
}

const plans: PricingPlan[] = [
  {
    id: "hobby",
    name: "Hobby.md",
    price: "₹0",
    period: "forever",
    icon: Heart,
    description: "Ideal for individual developers exploring public open-source codebases.",
    features: [
      "Public GitHub repositories sync",
      "Tree-sitter AST dependency indexing",
      "Depth-2 BFS Vectorless RAG",
      "Bring Your Own Key (BYOK) LLMs",
      "Community forum support"
    ],
    buttonText: "start free",
    buttonLink: "/auth/sign-up",
    recommended: false
  },
  {
    id: "developer",
    name: "Developer.py",
    price: "₹999",
    originalPrice: "₹1,999",
    promoText: "50% OFF INTRODUCTORY PROMO",
    period: "month",
    icon: Rocket,
    description: "Designed for active engineers sync-analyzing private commercial repos.",
    features: [
      "Public & Private repositories sync",
      "Depth-3 Deep-Scan BFS graph walk",
      "Priority ingestion queuing",
      "Pre-warmed Gemini Context Caching",
      "Dedicated Slack priority channel",
      "Unlimited diagram compilations"
    ],
    buttonText: "go pro",
    buttonLink: "/auth/sign-up",
    recommended: true
  },
  {
    id: "enterprise",
    name: "Enterprise.go",
    price: "Custom",
    period: "bespoke",
    icon: Building,
    description: "Bespoke deployments for teams requiring compliance and dedicated compute.",
    features: [
      "On-premises self-hosted parsing",
      "Unlimited repositories & scale",
      "Dedicated Inngest execution workers",
      "Custom LLM fine-tuning weights",
      "24/7 dedicated support & SLAs",
      "SAML/SSO dashboard access"
    ],
    buttonText: "contact sales",
    buttonLink: "mailto:gitdecode.team@gmail.com",
    recommended: false
  }
];

export default function PricingPage() {
  const router = useRouter();
  const { user } = useAuth(false);
  const { subscription, refreshSubscription } = useSubscription();
  const [proRequestStatus, setProRequestStatus] = useState<string | null>(null);
  
  // State for the developer speech bubble
  const [showBubble, setShowBubble] = useState(false);
  const [bubbleText, setBubbleText] = useState("");
  const bubbleTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (user) {
      getProRequestStatus()
        .then((res) => {
          if (res && res.has_request) {
            setProRequestStatus(res.status);
          }
        })
        .catch(() => {});
    }
  }, [user]);

  const handlePlanAction = async (planId: string) => {
    if (!user) {
      router.push("/auth/sign-in");
      return;
    }
    try {
      if (planId === "hobby") {
        if (subscription?.plan !== "free") {
          await upgradeUserSubscription("free");
          await refreshSubscription();
        }
      } else if (planId === "developer") {
        if (subscription?.plan !== "pro") {
          router.push("/pricing/checkout");
        }
      }
    } catch (err) {
      console.error("Failed to update subscription:", err);
    }
  };


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
              alt="GitDecode Developer Logo"
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
          <p className={styles.label}>subscription_plans</p>
          <h1 className={styles.title}>Pricing.js</h1>
          <p className={styles.subtitle}>
            <span className={styles.comment}># </span>
            Deploy GitDecode intelligence for your projects. Flexible models designed for developer workflows.
            <br />
            <span className={styles.comment}># [STATUS] Subscriptions are active. Select your plan below to unlock unlimited workspaces and deep AST indexing.</span>
          </p>
        </header>

        {/* ── COMING SOON BANNER CARD ────────────────────────────── */}
        <section className={styles.bannerSection}>
          <div className={styles.bannerCard}>
            <div className={styles.bannerContent}>
              <Cpu size={24} className={styles.bannerIcon} />
              <div className={styles.bannerText}>
                <h2 className={styles.bannerTitle}>Subscriptions Active · Developer Beta</h2>
                <p className={styles.bannerDesc}>
                  Our subscription tracking is active. You can instantly toggle between the Hobby (Free) and Developer (Pro) plans during this phase of our developer beta to test limits.
                </p>
              </div>
            </div>
            <div className={styles.bannerBadge}>
              <span className={styles.pulsingDot}></span>
              <span>BETA LIVE</span>
            </div>
          </div>
        </section>

        {/* ── PRICING CARDS GRID (HORIZONTAL ROW OF CARDS) ───────── */}
        <section className={styles.pricingSection}>
          <div className={styles.cardsGrid}>
            {plans.map((plan) => {
              const Icon = plan.icon;
              return (
                <div
                  key={plan.id}
                  className={`${styles.planCard} ${plan.recommended ? styles.recommendedCard : ""}`}
                >
                  {plan.recommended && (
                    <span className={styles.recommendedBadge}>popular</span>
                  )}

                  {/* Card Header (IDE file tab style) */}
                  <div className={styles.cardHeader}>
                    <div className={styles.cardHeaderTab}>
                      <Icon size={16} className={plan.recommended ? styles.activeIcon : styles.inactiveIcon} />
                      <span className={styles.cardName}>{plan.name}</span>
                    </div>
                    <div className={styles.priceContainer}>
                      {plan.originalPrice && (
                        <span className={styles.originalPrice}>{plan.originalPrice}</span>
                      )}
                      <span className={styles.priceNum}>{plan.price}</span>
                      <span className={styles.pricePeriod}>/{plan.period}</span>
                    </div>
                    {plan.promoText && (
                      <span className={styles.promoText}>{plan.promoText}</span>
                    )}
                  </div>

                  {/* Card Body */}
                  <div className={styles.cardBody}>
                    <p className={styles.cardDesc}>{plan.description}</p>

                    <ul className={styles.featuresList}>
                      {plan.features.map((feature, i) => (
                        <li key={i} className={styles.featureItem}>
                          <Check size={14} className={styles.checkIcon} />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Card Action */}
                  <div className={styles.cardAction}>
                    {user ? (
                      plan.id === "hobby" ? (
                        subscription?.plan === "free" ? (
                          <button className={styles.buyButton} disabled style={{ opacity: 0.5, cursor: "not-allowed" }}>
                            Current Plan
                          </button>
                        ) : (
                          <button className={styles.buyButton} onClick={() => handlePlanAction("hobby")}>
                            Downgrade to Free
                          </button>
                        )
                      ) : plan.id === "developer" ? (
                        subscription?.plan === "pro" ? (
                          <button className={styles.buyButton} disabled style={{ opacity: 0.5, cursor: "not-allowed" }}>
                            Current Plan
                          </button>
                        ) : proRequestStatus === "pending" ? (
                          <button className={styles.buyButton} disabled style={{ opacity: 0.8, cursor: "not-allowed", background: "var(--color-secondary-accent)", color: "var(--color-primary-text)" }}>
                            Request Pending
                          </button>
                        ) : (
                          <button className={styles.buyButton} onClick={() => handlePlanAction("developer")} style={{ background: "var(--color-primary)", color: "var(--color-primary-text)" }}>
                            Upgrade to Pro
                          </button>
                        )
                      ) : (

                        <Link href={plan.buttonLink} className={styles.buyButton}>
                          {plan.buttonText}
                        </Link>
                      )
                    ) : (
                      <Link href={plan.id === "enterprise" ? plan.buttonLink : "/auth/sign-in"} className={styles.buyButton}>
                        {plan.buttonText}
                      </Link>
                    )}
                    <span className={styles.footnote}>
                      {plan.id === "hobby" ? "// No credit card required" : "// Upgrade instantly"}
                    </span>
                  </div>

                </div>
              );
            })}
          </div>
        </section>

        {/* ── SECURITY NOTE CALLOUT ────────────────────────────────── */}
        <section className={styles.calloutSection}>
          <div className={styles.calloutCard}>
            <ShieldAlert size={28} className={styles.calloutIcon} />
            <div className={styles.calloutText}>
              <h3 className={styles.calloutTitle}>Strict Data Protection Guarantee</h3>
              <p className={styles.calloutDesc}>
                Whether on Hobby or Developer plans, your source code is processed 100% in transient memory and is immediately destroyed from local disks once AST extraction concludes. We never persist source code copies. Review our security model in <Link href="/security" className={styles.linkText}>security.yaml</Link>.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
