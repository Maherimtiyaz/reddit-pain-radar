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
    console.warn(
      "[email] RESEND_API_KEY not set — welcome email logged, not sent",
      { to: input.to, orgName: input.orgName, apiKey: input.apiKey },
    );
    return { delivered: false };
  }

  resend ??= new Resend(apiKey);
  const from =
    process.env.EMAIL_FROM ?? "Reddit Pain Radar <onboarding@resend.dev>";

  const { data, error } = await resend.emails.send({
    from,
    to: input.to,
    subject: "Your Reddit Pain Radar API key",
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

function quickstartLines(input: WelcomeEmailInput): string[] {
  return [
    `# 1. Verify your key`,
    `curl -H "Authorization: Bearer ${input.apiKey}" ${site.url}/api/v1/me`,
    ``,
    `# 2. Track the communities your customers live in`,
    `curl -X POST ${site.url}/api/v1/subreddits \\`,
    `  -H "Authorization: Bearer ${input.apiKey}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"name": "SaaS"}'`,
    ``,
    `# 3. Generate your first opportunity report`,
    `curl -X POST ${site.url}/api/v1/reports \\`,
    `  -H "Authorization: Bearer ${input.apiKey}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{}'`,
  ];
}

function welcomeText(input: WelcomeEmailInput): string {
  return [
    `Welcome to Reddit Pain Radar, ${input.orgName}!`,
    ``,
    `Your API key (treat it like a password — it is shown only this once):`,
    ``,
    `  ${input.apiKey}`,
    ``,
    ...quickstartLines(input),
    ``,
    `Reports rank pain themes by urgency, willingness to pay, and frequency,`,
    `with verbatim Reddit evidence and source links for every theme.`,
    ``,
    `Questions? Just reply to this email or write to ${site.email}.`,
  ].join("\n");
}

function welcomeHtml(input: WelcomeEmailInput): string {
  const curl = quickstartLines(input).join("\n");
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px;background:#0a0a0a;color:#fafafa;font-family:Geist,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.6">
    <div style="max-width:560px;margin:0 auto">
      <p style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#818cf8;font-weight:600">Reddit Pain Radar</p>
      <h1 style="font-size:22px;margin:8px 0 16px">Welcome, ${escapeHtml(input.orgName)} 🎉</h1>
      <p style="color:#a1a1aa;margin:0 0 8px">Your account is live. Here is your API key — treat it like a password, it is shown only this once:</p>
      <pre style="background:#161616;border:1px solid #1f1f1f;border-radius:8px;padding:14px;color:#10b981;font-size:13px;overflow-x:auto">${escapeHtml(input.apiKey)}</pre>
      <p style="color:#a1a1aa;margin:24px 0 8px"><strong style="color:#fafafa">Quick start</strong></p>
      <pre style="background:#161616;border:1px solid #1f1f1f;border-radius:8px;padding:14px;color:#d4d4d8;font-size:12px;overflow-x:auto">${escapeHtml(curl)}</pre>
      <p style="color:#a1a1aa;margin:24px 0 0">Reports rank pain themes by <strong style="color:#fafafa">urgency</strong>, <strong style="color:#fafafa">willingness to pay</strong>, and <strong style="color:#fafafa">frequency</strong> — with verbatim Reddit evidence and source links for every theme.</p>
      <p style="color:#a1a1aa;margin:16px 0 0">Questions? Reply to this email or write to <a href="mailto:${site.email}" style="color:#818cf8">${site.email}</a>.</p>
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
