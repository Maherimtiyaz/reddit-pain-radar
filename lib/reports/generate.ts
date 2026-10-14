/**
 * Turns extracted pain signals into a ranked, build-ready report.
 *
 * Pure and dependency-free so it can run in a worker, a route handler, or a
 * test. Signals are grouped into themes and ranked by composite score; each
 * theme keeps its strongest verbatim quotes.
 */

export type ReportSignal = {
  id: string;
  theme: string;
  verbatimQuote: string;
  urgencyScore: number | null;
  wtpScore: number | null;
  compositeScore: number | null;
  subreddit?: string | null;
  url?: string | null;
};

export type ReportQuote = {
  quote: string;
  subreddit: string | null;
  url: string | null;
};

export type ReportTheme = {
  theme: string;
  signalCount: number;
  urgencyScore: number;
  wtpScore: number;
  compositeScore: number;
  quotes: ReportQuote[];
};

export type GeneratedReport = {
  generatedAt: string;
  signalCount: number;
  themeCount: number;
  themes: ReportTheme[];
  markdown: string;
};

export type GenerateReportOptions = {
  /** ISO timestamp; injected so output is deterministic in tests. */
  generatedAt: string;
  /** Report title shown as the H1. */
  title?: string;
  /** Max verbatim quotes kept per theme. */
  quotesPerTheme?: number;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return round1(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function themeKey(theme: string): string {
  return theme.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Coalesce a signal's three scores into one composite (falls back to the mean). */
function compositeOf(signal: ReportSignal): number {
  if (typeof signal.compositeScore === "number") return signal.compositeScore;
  return 0.5 * (signal.urgencyScore ?? 0) + 0.5 * (signal.wtpScore ?? 0);
}

function groupThemes(
  signals: ReportSignal[],
  quotesPerTheme: number,
): ReportTheme[] {
  const groups = new Map<string, ReportSignal[]>();
  for (const signal of signals) {
    const key = themeKey(signal.theme);
    if (!key) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(signal);
    else groups.set(key, [signal]);
  }

  const themes: ReportTheme[] = [];
  for (const bucket of groups.values()) {
    const display = bucket[0].theme.trim();
    const ranked = [...bucket].sort((a, b) => compositeOf(b) - compositeOf(a));
    themes.push({
      theme: display,
      signalCount: bucket.length,
      urgencyScore: average(bucket.map((s) => s.urgencyScore ?? 0)),
      wtpScore: average(bucket.map((s) => s.wtpScore ?? 0)),
      compositeScore: average(bucket.map((s) => compositeOf(s))),
      quotes: ranked
        .filter((s) => s.verbatimQuote.trim().length > 0)
        .slice(0, quotesPerTheme)
        .map((s) => ({
          quote: s.verbatimQuote.trim(),
          subreddit: s.subreddit ?? null,
          url: s.url ?? null,
        })),
    });
  }

  return themes.sort((a, b) => b.compositeScore - a.compositeScore);
}

function renderMarkdown(
  options: GenerateReportOptions,
  themes: ReportTheme[],
  signalCount: number,
): string {
  const title = options.title ?? "Reddit Pain Radar — Opportunity Report";
  const lines: string[] = [
    `# ${title}`,
    "",
    `_Generated ${options.generatedAt} · ${signalCount} signal(s) · ${themes.length} theme(s)_`,
    "",
  ];

  if (themes.length === 0) {
    lines.push("No pain signals met the threshold for this report.", "");
    return lines.join("\n");
  }

  lines.push("## Ranked opportunities", "");
  themes.forEach((theme, index) => {
    lines.push(`### ${index + 1}. ${theme.theme}`, "");
    lines.push(
      `- **Composite score:** ${theme.compositeScore}/100`,
      `- **Urgency:** ${theme.urgencyScore}/100`,
      `- **Willingness to pay:** ${theme.wtpScore}/100`,
      `- **Signals:** ${theme.signalCount}`,
      "",
    );
    if (theme.quotes.length > 0) {
      lines.push("**Evidence**", "");
      for (const quote of theme.quotes) {
        const attribution = quote.subreddit ? ` — r/${quote.subreddit}` : "";
        lines.push(`> ${quote.quote}${attribution}`, "");
      }
    }
  });

  return lines.join("\n");
}

export function generateReport(
  signals: ReportSignal[],
  options: GenerateReportOptions,
): GeneratedReport {
  const quotesPerTheme = options.quotesPerTheme ?? 3;
  const themes = groupThemes(signals, quotesPerTheme);
  return {
    generatedAt: options.generatedAt,
    signalCount: signals.length,
    themeCount: themes.length,
    themes,
    markdown: renderMarkdown(options, themes, signals.length),
  };
}
