"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/app/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

/**
 * useAuth — React hook for Supabase auth state management.
 *
 * - Subscribes to `onAuthStateChange` to keep user/session in sync.
 * - Provides `signOut` method.
 * - Redirects unauthenticated users to `/auth/sign-in` when
 *   `requireAuth` is true (default).
 */
export function useAuth(requireAuth = true) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const supabase = getSupabase();
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();

        if (mounted) {
          setSession(currentSession);
          setUser(currentSession?.user ?? null);
          setLoading(false);

          if (requireAuth && !currentSession) {
            router.replace("/auth/sign-in");
          }
        }

        // Listen for auth changes
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, newSession) => {
          if (mounted) {
            setSession(newSession);
            setUser(newSession?.user ?? null);

            if (requireAuth && !newSession) {
              router.replace("/auth/sign-in");
            }
          }
        });

        return () => {
          subscription.unsubscribe();
        };
      } catch {
        if (mounted) {
          setLoading(false);
          if (requireAuth) {
            router.replace("/auth/sign-in");
          }
        }
      }
    };

    initAuth();
    return () => {
      mounted = false;
    };
  }, [requireAuth, router]);

  const signOut = useCallback(async () => {
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem("gitdecode_cached_subscription");
        localStorage.removeItem("gitdecode_cached_repos");
      }
      try {
        const supabase = getSupabase();
        await supabase.auth.signOut();
      } catch {
        // Ignore if Supabase client throws due to not being configured
      }
      router.replace("/auth/sign-in");
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  }, [router]);

  return { user, session, loading, signOut };
}
