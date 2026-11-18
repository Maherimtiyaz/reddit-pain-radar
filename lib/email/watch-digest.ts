import { Resend } from "resend";

import type { TopicDigest } from "@/lib/watch/digest";

const SOURCE_NAMES = { hackernews: "Hacker News", github: "GitHub" } as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function watchDigestText(
  digests: TopicDigest[],
  dashboardUrl: string,
): string {
  const lines = ["Your PainProof niche watch — new pains this week", ""];
  for (const digest of digests) {
    lines.push(`## ${digest.topic}`, "");
    if (digest.pains.length === 0) {
      lines.push("Nothing new this week.", "");
      continue;
    }
    for (const pain of digest.pains) {
      lines.push(`- "${pain.quote}"`);
      lines.push(
        `  ${SOURCE_NAMES[pain.source]}, ${pain.date}${pain.engagement ? ` · ${pain.engagement}` : ""} — ${pain.url}`,
      );
    }
    lines.push("");
  }
  lines.push(`Manage topics or check an idea: ${dashboardUrl}`);
  return lines.join("\n");
}

function watchDigestHtml(digests: TopicDigest[], dashboardUrl: string): string {
  const sections = digests
    .map((digest) => {
      const items =
        digest.pains.length === 0
          ? `<p style="color:#82828b">Nothing new this week.</p>`
          : digest.pains
              .map(
                (
                  pain,
                ) => `<div style="border-left:2px solid #6366f1;padding:8px 12px;margin:0 0 12px;background:#161616">
  <p style="margin:0;color:#fafafa">&ldquo;${escapeHtml(pain.quote)}&rdquo;</p>
  <p style="margin:6px 0 0;font-size:12px;color:#82828b"><a href="${escapeHtml(pain.url)}" style="color:#818cf8">${SOURCE_NAMES[pain.source]}, ${pain.date}</a>${pain.engagement ? ` · ${escapeHtml(pain.engagement)}` : ""}</p>
</div>`,
              )
              .join("");
      return `<h2 style="font-size:16px;margin:28px 0 12px;color:#fafafa">${escapeHtml(digest.topic)}</h2>${items}`;
    })
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#0a0a0a;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:40px 24px;color:#fafafa">
<p style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#818cf8;font-weight:600">PainProof Pro · Niche watch</p>
<h1 style="font-size:22px;margin:12px 0">New pains in your topics</h1>
${sections}
<p style="margin:32px 0 0;font-size:13px;color:#82828b"><a href="${escapeHtml(dashboardUrl)}" style="color:#818cf8">Manage topics or check an idea</a></p>
</div></body></html>`;
}

export async function sendWatchDigest(input: {
  to: string[];
  digests: TopicDigest[];
  dashboardUrl: string;
}): Promise<{ delivered: boolean }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const total = input.digests.reduce((sum, d) => sum + d.pains.length, 0);
  if (!apiKey) {
    console.warn("[watch] RESEND_API_KEY not set — digest logged", {
      to: input.to,
      total,
    });
    return { delivered: false };
  }
  const { error } = await new Resend(apiKey).emails.send({
    from: process.env.EMAIL_FROM ?? "PainProof <onboarding@resend.dev>",
    to: input.to,
    subject: `Niche watch: ${total} new pain${total === 1 ? "" : "s"} in your topics`,
    text: watchDigestText(input.digests, input.dashboardUrl),
    html: watchDigestHtml(input.digests, input.dashboardUrl),
  });
  if (error) {
    console.error("[watch] failed to send digest", { to: input.to, error });
    return { delivered: false };
  }
  return { delivered: true };
}
