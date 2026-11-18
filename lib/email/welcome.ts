import { Resend } from "resend";

import { site } from "@/lib/site";

/**
 * Transactional email via Resend (server-only).
 *
 * Without `RESEND_API_KEY` (local development, CI) the message is printed
 * to the server log instead of sent — the same log-only degradation the
 * waitlist action uses, so the app runs with zero email configuration.
 */

export type WelcomeEmailInput = {
  to: string;
  orgName: string;
  /** Shown exactly once; never persisted in plaintext. */
  apiKey: string;
};

let resend: Resend | null = null;

export async function sendWelcomeEmail(
  input: WelcomeEmailInput,
): Promise<{ delivered: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Never log the key itself: on a serverless host these logs are readable by
    // anyone with project access and may be retained or exported.
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[email] RESEND_API_KEY is not set: the customer was provisioned but their API key was NOT delivered",
        { to: input.to, orgName: input.orgName },
      );
    } else {
      console.warn(
        "[email] RESEND_API_KEY not set — welcome email skipped (key not logged)",
        { to: input.to, orgName: input.orgName },
      );
    }
    return { delivered: false };
  }

  resend ??= new Resend(apiKey);
  const from = process.env.EMAIL_FROM ?? "PainProof <onboarding@resend.dev>";

  const { data, error } = await resend.emails.send({
    from,
    to: input.to,
    subject: "Welcome to PainProof Pro",
    text: welcomeText(input),
    html: welcomeHtml(input),
  });

  if (error) {
    // The org is already provisioned at this point. Log loudly so the key
    // can be re-sent manually; a retry queue belongs with the Phase 3
    // transactional-email work.
    console.error("[email] failed to send welcome email", {
      to: input.to,
      orgName: input.orgName,
      error,
    });
    return { delivered: false };
  }

  console.log("[email] welcome email sent", {
    to: input.to,
    resendId: data?.id,
  });
  return { delivered: true };
}

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

export function welcomeText(input: WelcomeEmailInput): string {
  return [
    `Welcome to PainProof Pro, ${input.orgName}!`,
    ``,
    `Sign in with this email address to start checking ideas:`,
    `  ${site.url}/login`,
    ``,
    `What you get every month:`,
    `  - 30 idea checks: verdict, PainProof Score, linked quotes, competitors, a 48-hour test`,
    `  - Niche watch: add up to 5 topics, get new complaints about them every Monday`,
    `  - Every report saved in your dashboard`,
    ``,
    `For developers, your API key (shown only this once — treat it like a password):`,
    `  ${input.apiKey}`,
    `  curl -H "Authorization: Bearer <key>" ${site.url}/api/v1/me`,
    ``,
    `Manage or cancel billing anytime from the dashboard.`,
    `Questions? Just reply to this email or write to ${site.email}.`,
  ].join("\n");
}

function welcomeHtml(input: WelcomeEmailInput): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px;background:#0a0a0a;color:#fafafa;font-family:Geist,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.6">
    <div style="max-width:560px;margin:0 auto">
      <p style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#818cf8;font-weight:600">PainProof Pro</p>
      <h1 style="font-size:22px;margin:8px 0 16px">Welcome, ${escapeHtml(input.orgName)}</h1>
      <p style="color:#a1a1aa;margin:0 0 20px">Sign in with this email address to check your first idea.</p>
      <a href="${site.url}/login" style="display:inline-block;background:#6366f1;color:#fafafa;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Sign in to PainProof</a>
      <ul style="color:#a1a1aa;margin:24px 0 0;padding-left:18px">
        <li><strong style="color:#fafafa">30 idea checks</strong> a month — verdict, score, linked quotes, competitors, a 48-hour test</li>
        <li><strong style="color:#fafafa">Niche watch</strong> — new complaints about up to 5 topics, every Monday</li>
        <li>Every report saved in your dashboard</li>
      </ul>
      <p style="color:#82828b;margin:28px 0 8px;font-size:13px">For developers — your API key, shown only this once:</p>
      <pre style="background:#161616;border:1px solid #1f1f1f;border-radius:8px;padding:14px;color:#10b981;font-size:13px;overflow-x:auto">${escapeHtml(input.apiKey)}</pre>
      <p style="color:#a1a1aa;margin:16px 0 0">Manage or cancel billing from the dashboard. Questions? Reply to this email or write to <a href="mailto:${site.email}" style="color:#818cf8">${site.email}</a>.</p>
    </div>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
