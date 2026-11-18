import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  CircleAlert,
  CreditCard,
  Eye,
  FileSearch,
  Newspaper,
  X,
} from "lucide-react";

import { ProCheckForm } from "@/components/dashboard/pro-check-form";
import { WatchTopicForm } from "@/components/dashboard/watch-topic-form";
import { Button } from "@/components/ui/button";
import {
  openBillingPortalAction,
  removeWatchTopicAction,
} from "@/lib/actions/pro";
import type { EffectivePlan } from "@/lib/billing/limits";
import {
  CHECK_PRICE_LABEL,
  isCheckSaleOpen,
  isProSaleOpen,
  PRO_PRICE_LABEL,
} from "@/lib/check/availability";
import { VERDICT_LABELS } from "@/lib/check/score";
import type { Verdict } from "@/lib/check/types";
import { getProDashboardData } from "@/lib/dashboard/data";

// Session-gated: no static shell, and navigations may block on the DB.
export const instant = false;
// Pro checks started from this page run after the action responds.
export const maxDuration = 300;

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

const PLAN_LABELS: Record<EffectivePlan, string> = {
  pro: "Pro",
  starter: "Pro (legacy)",
  trial: "Inactive",
  expired_trial: "Inactive",
};

const VERDICT_STYLE: Record<Verdict, string> = {
  build: "border-signal/30 bg-signal/10 text-signal",
  niche_down: "border-urgency/30 bg-urgency/10 text-urgency",
  skip: "border-destructive/30 bg-destructive/10 text-destructive",
  insufficient: "border-line bg-surface-2 text-ink-muted",
};

function Card({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-line bg-surface rounded-2xl border">
      <header className="border-line flex items-center justify-between gap-3 border-b px-5 py-4">
        <h2 className="font-heading text-ink flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </h2>
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

function CheckStatus({
  status,
  verdict,
  score,
}: {
  status: string;
  verdict: string | null;
  score: number | null;
}) {
  if (status === "complete" && verdict && verdict in VERDICT_STYLE) {
    const v = verdict as Verdict;
    return (
      <span
        className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${VERDICT_STYLE[v]}`}
      >
        {VERDICT_LABELS[v]}
        {score !== null ? ` · ${score}` : ""}
      </span>
    );
  }
  const label =
    status === "failed"
      ? "Failed"
      : status === "pending_payment"
        ? "Unpaid"
        : "Researching…";
  return (
    <span className="border-line text-ink-muted inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs">
      {label}
    </span>
  );
}

function NoWorkspace({ email }: { email: string }) {
  const proOpen = isProSaleOpen();
  const checkOpen = isCheckSaleOpen();
  return (
    <div className="mx-auto max-w-2xl">
      <div className="border-line bg-surface rounded-2xl border p-8">
        <h1 className="font-heading text-ink text-2xl font-semibold tracking-tight">
          No PainProof Pro workspace yet
        </h1>
        <p className="text-ink-muted mt-2 text-sm leading-relaxed">
          You&apos;re signed in as{" "}
          <span className="text-ink font-medium">{email}</span>. Pro gives you
          30 idea checks a month, weekly niche-watch alerts and your report
          history.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {proOpen ? (
            <Button asChild className="h-12 px-5">
              <a href="/api/checkout">Get Pro — {PRO_PRICE_LABEL}/month</a>
            </Button>
          ) : null}
          {checkOpen ? (
            <Button asChild variant="outline" className="border-line h-12 px-5">
              <Link href="/check">Or check one idea — {CHECK_PRICE_LABEL}</Link>
            </Button>
          ) : null}
          {!proOpen && !checkOpen ? (
            <Button asChild className="h-12 px-5">
              <Link href="/?ref=dashboard#subscribe">Get the free weekly</Link>
            </Button>
          ) : null}
        </div>
        <p className="text-ink-faint mt-4 text-xs leading-relaxed">
          Already subscribed with a different address? Sign out and sign in with
          the email you used at checkout.
        </p>
      </div>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [data, query] = await Promise.all([
    getProDashboardData(),
    searchParams,
  ]);
  const billingUnavailable = query.billing === "unavailable";
  if (!data.org) return <NoWorkspace email={data.user.email} />;

  const {
    org,
    plan,
    pro,
    quota,
    used,
    topicLimit,
    checks,
    topics,
    canManageBilling,
  } = data;
  const left = Math.max(0, quota - used);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-ink-faint text-xs font-medium tracking-wide uppercase">
            {org.name}
          </p>
          <h1 className="font-heading text-ink mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
            PainProof {PLAN_LABELS[plan]}
          </h1>
        </div>
        {canManageBilling ? (
          <form action={openBillingPortalAction}>
            <Button
              type="submit"
              variant="outline"
              className="border-line h-11 gap-2 px-4"
            >
              <CreditCard className="size-4" aria-hidden="true" />
              Manage billing
            </Button>
          </form>
        ) : null}
      </header>

      {billingUnavailable ? (
        <p
          role="status"
          className="border-line bg-surface text-ink-muted rounded-2xl border p-4 text-sm"
        >
          The billing portal isn&apos;t available right now. Email us and
          we&apos;ll update or cancel your subscription for you.
        </p>
      ) : null}

      {!pro ? (
        <div className="border-urgency/30 bg-urgency/10 text-ink flex flex-col gap-3 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm">
            <CircleAlert
              className="text-urgency mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            Your subscription isn&apos;t active, so checks and niche watch are
            paused. Your past reports are still here.
          </p>
          {isProSaleOpen() ? (
            <Button asChild className="h-11 shrink-0 px-5">
              <a href="/api/checkout">Reactivate Pro</a>
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Checks this month"
          value={`${used} / ${quota}`}
          hint={pro ? `${left} left · resets on the 1st (UTC)` : undefined}
        />
        <Stat
          label="Watched topics"
          value={`${topics.length} / ${topicLimit}`}
          hint="Digest every Monday"
        />
        <Stat
          label="Reports"
          value={String(checks.length)}
          hint="Kept for as long as you're subscribed"
        />
      </div>

      <Card
        title="Check an idea"
        icon={<FileSearch className="text-brand size-4" aria-hidden="true" />}
      >
        <ProCheckForm disabled={!pro || left === 0} />
        {pro && left === 0 ? (
          <p className="text-ink-faint mt-3 text-xs">
            You&apos;ve used this month&apos;s checks. They reset on the 1st
            (UTC).
          </p>
        ) : null}
      </Card>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
        <Card title="Your checks">
          {checks.length === 0 ? (
            <p className="text-ink-faint text-sm">
              No checks yet. Describe an idea above — the report is ready in
              about 2 minutes.
            </p>
          ) : (
            <ul className="divide-line -my-2 divide-y">
              {checks.map((check) => (
                <li key={check.id}>
                  <Link
                    href={`/dashboard/checks/${check.id}`}
                    className="hover:text-brand-light group flex items-center justify-between gap-3 py-3"
                  >
                    <span className="min-w-0">
                      <span className="text-ink group-hover:text-brand-light block truncate text-sm font-medium">
                        {check.headline ?? check.idea}
                      </span>
                      <span className="text-ink-faint text-xs">
                        {dateFormatter.format(check.createdAt)}
                      </span>
                    </span>
                    <CheckStatus
                      status={check.status}
                      verdict={check.verdict}
                      score={check.score}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-8">
          <Card
            title="Niche watch"
            icon={<Eye className="text-brand size-4" aria-hidden="true" />}
          >
            <p className="text-ink-muted mb-4 text-sm leading-relaxed">
              Every Monday we email you new complaints about these topics from
              Hacker News and GitHub, quoted and linked.
            </p>
            {topics.length > 0 ? (
              <ul className="mb-4 flex flex-wrap gap-2">
                {topics.map((topic) => (
                  <li
                    key={topic.id}
                    className="border-line bg-surface-2 text-ink flex items-center gap-1 rounded-full border py-1 pr-1 pl-3 text-sm"
                  >
                    {topic.topic}
                    <form action={removeWatchTopicAction}>
                      <input type="hidden" name="id" value={topic.id} />
                      <button
                        type="submit"
                        aria-label={`Stop watching ${topic.topic}`}
                        className="text-ink-faint hover:text-ink grid size-7 place-items-center rounded-full transition-colors"
                      >
                        <X className="size-3.5" aria-hidden="true" />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : null}
            <WatchTopicForm disabled={!pro || topics.length >= topicLimit} />
          </Card>

          <Card
            title="PainProof Weekly"
            icon={
              <Newspaper className="text-brand size-4" aria-hidden="true" />
            }
          >
            <p className="text-ink-muted text-sm leading-relaxed">
              5–7 problems worth building, every week, with the proof linked.
            </p>
            <Link
              href="/weekly"
              className="text-brand-light hover:text-brand mt-3 inline-flex items-center gap-1 text-sm"
            >
              Read past issues
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
