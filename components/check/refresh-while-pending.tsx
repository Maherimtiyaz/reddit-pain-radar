"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Re-fetches the server-rendered report every few seconds while a check is
 * still being prepared, then stops (the finished page no longer renders it).
 */
export function RefreshWhilePending({
  intervalMs = 5_000,
}: {
  intervalMs?: number;
}) {
  const router = useRouter();
  React.useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), intervalMs);
    return () => window.clearInterval(timer);
  }, [router, intervalMs]);
  return null;
}
