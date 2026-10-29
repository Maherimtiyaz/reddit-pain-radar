import { Resend } from "resend";

import { site } from "@/lib/site";

/**
 * Magic-link sign-in email (server-only).
 *
 * Mirrors `lib/email/welcome.ts`: without `RESEND_API_KEY` the link is printed
 * to the server log instead of sent, so local development works with zero
 * email configuration. Auth.js only hands us the one-time URL; everything
 * about how it is delivered lives here.
 */

export type MagicLinkEmailInput = {
  to: string;
  url: string;
};

export type MagicLinkDelivery = {
  delivered: boolean;
  /** Present when delivery was skipped so devs can still sign in. */
  url?: string;
};

let resend: Resend | null = null;

export async function sendMagicLinkEmail(
  input: MagicLinkEmailInput,
): Promise<MagicLinkDelivery> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "[auth] RESEND_API_KEY not set — magic link logged, not sent",
      { to: input.to, url: input.url },
    );
    return { delivered: false, url: input.url };
  }

  resend ??= new Resend(apiKey);
  const from =
    process.env.EMAIL_FROM ?? "Reddit Pain Radar <onboarding@resend.dev>";

  const { data, error } = await resend.emails.send({
    from,
    to: input.to,
    subject: "Sign in to Reddit Pain Radar",
    text: magicLinkText(input),
    html: magicLinkHtml(input),
  });

  if (error) {
    // Let Auth.js surface the failure (the sign-in form shows a retry message).
    throw new Error(`[email] failed to send magic link: ${error.message}`);
  }

  console.log("[auth] magic link sent", { to: input.to, resendId: data?.id });
  return { delivered: true };
}

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

function magicLinkText({ url }: MagicLinkEmailInput): string {
  return [
    "Sign in to Reddit Pain Radar",
    "",
    "Use the link below to sign in to your dashboard. It expires in 1 hour",
    "and can only be used once.",
    "",
    `  ${url}`,
    "",
    "If you did not request this, you can safely ignore this email.",
    "",
    `— ${site.name}`,
  ].join("\n");
}

function magicLinkHtml({ url }: MagicLinkEmailInput): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px;background:#0a0a0a;color:#fafafa;font-family:Geist,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.6">
    <div style="max-width:520px;margin:0 auto">
      <p style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#818cf8;font-weight:600">Reddit Pain Radar</p>
      <h1 style="font-size:22px;margin:8px 0 16px">Sign in to your dashboard</h1>
      <p style="color:#a1a1aa;margin:0 0 24px">Use the button below to sign in. This link expires in 1 hour and can only be used once.</p>
      <a href="${escapeHtml(url)}" style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">Sign in</a>
      <p style="color:#82828b;margin:24px 0 0;font-size:13px;word-break:break-all">Or paste this URL into your browser:<br /><a href="${escapeHtml(url)}" style="color:#818cf8">${escapeHtml(url)}</a></p>
      <p style="color:#82828b;margin:24px 0 0;font-size:13px">If you did not request this email, you can safely ignore it.</p>
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
