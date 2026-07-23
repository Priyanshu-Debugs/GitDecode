"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/app/lib/supabase";
import styles from "../sign-in/page.module.css";

/**
 * AuthCallbackClientPage — Client-side redirect callback handler.
 *
 * Establishes the authenticated session in the browser by allowing the
 * Supabase client library to parse the URL hash fragment (#access_token=...)
 * or query parameter authorization code, then redirects to `/dashboard`.
 */
export default function AuthCallbackClientPage() {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    const handleCallback = async () => {
      try {
        const supabase = getSupabase();
        
        // Supabase client automatically processes auth parameters in the browser URL
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (!active) return;

        if (error) {
          router.replace(`/auth/sign-in?error=${encodeURIComponent(error.message)}`);
          return;
        }

        if (session) {
          router.replace("/dashboard");
        } else {
          // If session isn't immediately available, check for active user
          const { data: { user } } = await supabase.auth.getUser();
          if (user && active) {
            router.replace("/dashboard");
          } else {
            // Give Supabase a short window to process before returning error
            const timeout = setTimeout(async () => {
              if (!active) return;
              const { data: { session: retrySession } } = await supabase.auth.getSession();
              if (retrySession) {
                router.replace("/dashboard");
              } else {
                router.replace("/auth/sign-in?error=Session%20could%20not%20be%20established");
              }
            }, 1500);
            return () => clearTimeout(timeout);
          }
        }
      } catch (err) {
        if (active) {
          router.replace(`/auth/sign-in?error=${encodeURIComponent("Authentication process failed")}`);
        }
      }
    };

    handleCallback();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <div
      className={styles.splitLayout}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-bg)",
        minHeight: "100vh"
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          className={styles.logo}
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: 20,
            fontSize: "2rem",
            fontWeight: 700,
            letterSpacing: "-0.03em"
          }}
        >
          <span className={styles.infoBrandGit}>Git</span>
          <span className={styles.infoBrandMesh}>Decode</span>
        </div>
        <div
          style={{
            width: "24px",
            height: "24px",
            border: "2px solid rgba(255, 255, 255, 0.06)",
            borderTopColor: "#c8ccd4",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 16px"
          }}
        />
        <p style={{ color: "var(--color-text-secondary)", fontSize: "0.8125rem", fontFamily: "var(--font-sans)" }}>
          Establishing secure session...
        </p>

        <style jsx global>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}
