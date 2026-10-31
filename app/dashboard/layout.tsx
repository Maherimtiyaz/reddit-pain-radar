import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, LogOut } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/actions/auth";
import { requireDashboardUser } from "@/lib/dashboard/data";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

/**
 * The whole dashboard is session-gated and reads live tenant data, so there is
 * no static shell to serve. Opt the segment out of Cache Components'
 * instant-navigation validation instead of faking a skeleton
 * (see node_modules/next/dist/docs/.../authentication-with-cache-components).
 */
export const instant = false;

/**
 * Protected account shell. `requireDashboardUser` runs on every request, so
 * the check cannot be bypassed by navigating straight to a child route.
 */
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireDashboardUser();

  return (
    <div className="bg-canvas flex min-h-svh flex-col">
      <header className="border-line bg-canvas/85 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6">
          <Link
            href="/dashboard"
            className="font-heading text-ink flex items-center gap-2 font-semibold tracking-tight"
          >
            <LogoMark className="text-brand size-7" />
            {site.name}
            <span className="text-ink-faint hidden text-xs font-normal tracking-normal sm:inline">
              / dashboard
            </span>
          </Link>

          <div className="flex items-center gap-1.5">
            <Link
              href="/"
              className="text-ink-muted hover:text-ink hidden items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm transition-colors sm:inline-flex"
            >
              View site
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Link>
            <span className="text-ink-muted hidden max-w-[16rem] truncate text-sm md:inline">
              {user.email}
            </span>
            <form action={signOutAction}>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="h-9 gap-2 px-2.5"
              >
                <LogOut className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        {children}
      </main>
    </div>
  );
}
