"use client";

import { useState, useEffect } from "react";
import { getUserSubscription } from "@/app/lib/api";

export interface SubscriptionInfo {
  plan: "free" | "pro";
  is_pro: boolean;
  limits: {
    daily_msg_limit: number;
    monthly_msg_limit: number;
    repo_limit: number;
    monthly_report_limit: number;
  };
  started_at: string | null;
  expires_at: string | null;
}

const DEFAULT_FREE_LIMITS = {
  daily_msg_limit: 3,
  monthly_msg_limit: 15,
  repo_limit: 2,
  monthly_report_limit: 2,
};

const SUBSC_CACHE_KEY = "gitdecode_cached_subscription";

export function useSubscription() {
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(SUBSC_CACHE_KEY);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {
          // invalid cache JSON
        }
      }
    }
    return null;
  });
  const [loading, setLoading] = useState<boolean>(() => !subscription);

  const refreshSubscription = async () => {
    try {
      const info = await getUserSubscription();
      setSubscription(info);
      if (typeof window !== "undefined") {
        localStorage.setItem(SUBSC_CACHE_KEY, JSON.stringify(info));
      }
    } catch (err) {
      console.error("Failed to fetch user subscription, falling back to default free plan:", err);
      if (!subscription) {
        setSubscription({
          plan: "free",
          is_pro: false,
          limits: DEFAULT_FREE_LIMITS,
          started_at: null,
          expires_at: null,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSubscription();
  }, []);

  return {
    subscription,
    loading,
    isPro: subscription?.is_pro ?? false,
    refreshSubscription,
  };
}
