import { Resend } from "resend";

import { VERDICT_LABELS } from "@/lib/check/score";
import type { Verdict } from "@/lib/check/types";

/**
 * "Your PainProof check is ready" email (Resend). Without `RESEND_API_KEY`
 * it is logged instead of sent — including the link in development only,
 * since the link is the key to a private report.
 */

export type CheckReadyEmail = {
  to: string;
  headline: string;
  verdict: Verdict;
  score: number | null;
  url: string;
};

let resend: Resend | null = null;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function checkReadySubject(input: CheckReadyEmail): string {
  return `Your PainProof check: ${VERDICT_LABELS[input.verdict]}${
    input.score === null ? "" : ` (${input.score}/100)`
  }`;
}

export function checkReadyText(input: CheckReadyEmail): string {
  return [
    `Your idea check is ready: ${input.headline}`,
    ``,
    `Verdict: ${VERDICT_LABELS[input.verdict]}${input.score === null ? "" : ` — PainProof Score ${input.score}/100`}`,
    ``,
    `Read the full report (quotes, competitors, your 48-hour test):`,
    input.url,
    ``,
    `This link is private. Anyone with it can read the report.`,
    `Questions? Just reply to this email.`,
  ].join("\n");
}

function checkReadyHtml(input: CheckReadyEmail): string {
  const verdict = escapeHtml(VERDICT_LABELS[input.verdict]);
  const score =
    input.score === null
      ? ""
      : ` <span style="color:#a1a1aa">— PainProof Score</span> <strong style="color:#fafafa">${input.score}/100</strong>`;
  return `<!doctype html><html><body style="margin:0;background:#0a0a0a;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;color:#fafafa">
    <p style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#818cf8;font-weight:600">PainProof</p>
    <h1 style="font-size:22px;line-height:1.3;margin:12px 0">Your idea check is ready</h1>
    <p style="color:#a1a1aa;margin:0 0 20px">${escapeHtml(input.headline)}</p>
    <p style="margin:0 0 28px">Verdict: <strong>${verdict}</strong>${score}</p>
    <a href="${escapeHtml(input.url)}" style="display:inline-block;background:#6366f1;color:#fafafa;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Read the full report</a>
    <p style="color:#82828b;font-size:13px;margin:28px 0 0">This link is private — anyone with it can read the report. Questions? Just reply.</p>
  </div></body></html>`;
}

export async function sendCheckReadyEmail(
  input: CheckReadyEmail,
): Promise<{ delivered: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[email] RESEND_API_KEY is not set: check report link NOT delivered",
        { to: input.to },
      );
    } else {
      console.warn(
        "[email] RESEND_API_KEY not set — check-ready email logged",
        {
          to: input.to,
          url: input.url,
        },
      );
    }
    return { delivered: false };
  }

  resend ??= new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "PainProof <onboarding@resend.dev>",
    to: input.to,
    subject: checkReadySubject(input),
    text: checkReadyText(input),
    html: checkReadyHtml(input),
  });
  if (error) {
    console.error("[email] failed to send check-ready email", {
      to: input.to,
      error,
    });
    return { delivered: false };
  }
  console.log("[email] check-ready email sent", {
    to: input.to,
    resendId: data?.id,
  });
  return { delivered: true };
}
