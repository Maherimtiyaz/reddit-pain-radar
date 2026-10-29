import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  CircleAlert,
  Code2,
  FileText,
  KeyRound,
  Radar,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { getDashboardData } from "@/lib/dashboard/data";
import type { EffectivePlan } from "@/lib/billing/limits";

// Session-gated: no static shell, and navigations may block on the DB.
export const instant = false;

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

function planLabel(plan: EffectivePlan): string {
  switch (plan) {
    case "expired_trial":
      return "Trial expired";
    case "starter":
      return "Starter";
    case "pro":
      return "Pro";
    default:
      return "Trial";
  }
}

function planBadgeClass(plan: EffectivePlan): string {
  switch (plan) {
    case "starter":
      return "border-brand/30 bg-brand/10 text-brand-light";
    case "pro":
      return "border-signal/30 bg-signal/10 text-signal";
    case "expired_trial":
      return "border-red-500/30 bg-red-500/10 text-red-300";
    default:
      return "border-urgency/30 bg-urgency/10 text-urgency";
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "complete":
      return "border-signal/30 bg-signal/10 text-signal";
    case "failed":
      return "border-red-500/30 bg-red-500/10 text-red-300";
    default:
      return "border-urgency/30 bg-urgency/10 text-urgency";
  }
}

function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${className}`}
    >
      {children}
    </span>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-line bg-surface rounded-2xl border">
      <header className="border-line flex items-center justify-between gap-3 border-b px-5 py-4">
        <h2 className="font-heading text-ink text-sm font-semibold">{title}</h2>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border-line bg-surface rounded-xl border p-4">
      <p className="text-ink-faint text-xs font-medium tracking-wide uppercase">
        {label}
      </p>
      <p className="font-heading text-ink mt-2 text-2xl font-semibold tracking-tight">
        {value}
      </p>
      {hint ? <p className="text-ink-faint mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-ink-faint text-sm leading-relaxed">{children}</p>;
}

export default async function DashboardPage() {
  const data = await getDashboardData();
  const { user, membership } = data;

  if (!membership) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="border-line bg-surface rounded-2xl border p-8">
          <span className="border-brand/30 bg-brand/10 text-brand-light flex size-11 items-center justify-center rounded-xl border">
            <Radar className="size-5" aria-hidden="true" />
          </span>
          <h1 className="font-heading text-ink mt-5 text-2xl font-semibold tracking-tight">
            No workspace yet
          </h1>
          <p className="text-ink-muted mt-2 text-sm leading-relaxed">
            You&apos;re signed in as{" "}
            <span className="text-ink font-medium">{user.email}</span>.
            Subscribe with this same email and we&apos;ll provision your
            workspace, first API key, and welcome email.
          </p>
          <div className="mt-6">
            <Button asChild className="h-12 px-5">
              <a href="/api/checkout">Get early access — $29/mo</a>
            </Button>
          </div>
          <p className="text-ink-faint mt-4 text-xs leading-relaxed">
            Already paid with a different address? Sign out and sign in with the
            email you used at checkout.
          </p>
        </div>
      </div>
    );
  }

  const {
    plan,
    quota,
    used,
    trialDaysLeft,
    subreddits,
    keywordSets,
    apiKeys,
    reports,
  } = data;

  const currentPlan = plan ?? "trial";

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-brand-light text-xs font-semibold tracking-[0.14em] uppercase">
            {membership.role} workspace
          </p>
          <h1 className="font-heading text-ink mt-1.5 text-3xl font-semibold tracking-tight">
            {membership.org.name}
          </h1>
          <p className="text-ink-muted mt-1 text-sm">
            /{membership.org.slug} · member since{" "}
            {dateFormatter.format(membership.org.createdAt)}
          </p>
        </div>
        <Badge className={planBadgeClass(currentPlan)}>
          {planLabel(currentPlan)}
        </Badge>
      </header>

      {currentPlan === "expired_trial" ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4">
          <p className="flex items-center gap-2 text-sm text-red-200">
            <CircleAlert className="size-4" aria-hidden="true" />
            Your trial has ended. Subscribe to keep generating reports.
          </p>
          <Button asChild size="sm" className="h-9">
            <a href="/api/checkout">Subscribe</a>
          </Button>
        </div>
      ) : currentPlan === "trial" ? (
        <div className="border-urgency/30 bg-urgency/10 flex flex-wrap items-center justify-between gap-4 rounded-xl border px-5 py-4">
          <p className="text-urgency flex items-center gap-2 text-sm">
            <CircleAlert className="size-4" aria-hidden="true" />
            {trialDaysLeft === 0
              ? "Your trial ends today."
              : `Trial — ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left.`}
          </p>
          <Button asChild size="sm" className="h-9">
            <a href="/api/checkout">Subscribe</a>
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Plan"
          value={planLabel(currentPlan)}
          hint={
            currentPlan === "trial" && trialDaysLeft !== null
              ? `${trialDaysLeft} days left`
              : "Billed monthly"
          }
        />
        <Stat
          label="Reports this month"
          value={`${used} / ${quota}`}
          hint="Resets on the 1st (UTC)"
        />
        <Stat label="Subreddits" value={String(subreddits.length)} />
        <Stat label="API keys" value={String(apiKeys.length)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card
            title="Recent reports"
            action={
              <span className="text-ink-faint inline-flex items-center gap-1 text-xs">
                <FileText className="size-3.5" aria-hidden="true" />
                {reports.length} shown
              </span>
            }
          >
            {reports.length === 0 ? (
              <EmptyState>
                No reports yet. Generate one with{" "}
                <code className="text-ink bg-surface-2 rounded px-1.5 py-0.5 font-mono text-xs">
                  POST /api/v1/reports
                </code>{" "}
                using an API key.
              </EmptyState>
            ) : (
              <ul className="divide-line -my-2 divide-y">
                {reports.map((report) => (
                  <li key={report.id}>
                    <Link
                      href={`/dashboard/reports/${report.id}`}
                      className="hover:bg-surface-2 -mx-2 flex items-center justify-between gap-4 rounded-lg px-2 py-3 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-ink truncate text-sm font-medium">
                          Report ·{" "}
                          {dateFormatter.format(
                            report.generatedAt ?? report.createdAt,
                          )}
                        </p>
                        <p className="text-ink-faint mt-0.5 font-mono text-xs">
                          {report.id.slice(0, 8)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <Badge className={statusBadgeClass(report.status)}>
                          {report.status}
                        </Badge>
                        <ArrowRight
                          className="text-ink-faint size-4"
                          aria-hidden="true"
                        />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Tracked subreddits"
            action={
              <span className="text-ink-faint text-xs">
                {subreddits.length} total
              </span>
            }
          >
            {subreddits.length === 0 ? (
              <EmptyState>
                Nothing tracked yet. Add communities with{" "}
                <code className="text-ink bg-surface-2 rounded px-1.5 py-0.5 font-mono text-xs">
                  POST /api/v1/subreddits
                </code>
                .
              </EmptyState>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {subreddits.map((subreddit) => (
                  <li
                    key={subreddit.id}
                    className="border-line bg-surface-2 text-ink-muted rounded-full border px-3 py-1 text-sm"
                  >
                    r/{subreddit.name}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Keyword sets">
            {keywordSets.length === 0 ? (
              <EmptyState>No keyword sets yet.</EmptyState>
            ) : (
              <ul className="flex flex-col gap-3">
                {keywordSets.map((set) => (
                  <li key={set.id}>
                    <p className="text-ink text-sm font-medium">{set.name}</p>
                    <p className="text-ink-faint mt-0.5 text-xs">
                      {set.keywords.length > 0
                        ? set.keywords.join(", ")
                        : "No keywords"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="API keys"
            action={
              <span className="text-ink-faint inline-flex items-center gap-1 text-xs">
                <KeyRound className="size-3.5" aria-hidden="true" />
                {apiKeys.length}
              </span>
            }
          >
            {apiKeys.length === 0 ? (
              <EmptyState>
                Mint a key with{" "}
                <code className="text-ink bg-surface-2 rounded px-1.5 py-0.5 font-mono text-xs">
                  POST /api/v1/keys
                </code>
                .
              </EmptyState>
            ) : (
              <ul className="flex flex-col gap-3">
                {apiKeys.map((key) => (
                  <li
                    key={key.id}
                    className="flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-ink truncate text-sm font-medium">
                        {key.name}
                      </p>
                      <p className="text-ink-faint mt-0.5 text-xs">
                        {key.lastUsedAt
                          ? `Used ${dateFormatter.format(key.lastUsedAt)}`
                          : "Never used"}
                      </p>
                    </div>
                    <span className="text-signal shrink-0 text-xs">Active</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-ink-faint border-line mt-4 border-t pt-3 text-xs leading-relaxed">
              Keys are shown only once at creation. Revoke a leaked key with{" "}
              <code className="text-ink bg-surface-2 rounded px-1.5 py-0.5 font-mono text-xs">
                DELETE /api/v1/keys/:id
              </code>
              .
            </p>
          </Card>

          <div className="border-line bg-surface rounded-2xl border p-5">
            <p className="text-ink flex items-center gap-2 text-sm font-medium">
              <Code2 className="text-brand-light size-4" aria-hidden="true" />
              Building with the API?
            </p>
            <p className="text-ink-muted mt-2 text-sm leading-relaxed">
              The welcome email includes a copy-paste quickstart. Full reference
              lives in the repository README.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
