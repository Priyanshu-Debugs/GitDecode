"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackPageView } from "@/app/lib/api";

export default function AnalyticsTracker() {
  const pathname = usePathname();
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (pathname && pathname !== prevPathRef.current) {
      prevPathRef.current = pathname;
      // Trigger non-blocking pageview ping
      trackPageView(pathname);
    }
  }, [pathname]);

  return null;
}
