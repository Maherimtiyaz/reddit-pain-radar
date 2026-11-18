import { Resend } from "resend";

/**
 * "Your weekly draft is ready" — sent to the editor (WEEKLY_EDITOR_EMAIL)
 * with the markdown in the body, ready to review and paste into the
 * newsletter tool. Logged instead when Resend or the editor is not set.
 */
export async function sendWeeklyDraftEmail(input: {
  slug: string;
  title: string;
  markdown: string;
  painCount: number;
}): Promise<{ delivered: boolean }> {
  const to = process.env.WEEKLY_EDITOR_EMAIL?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!to || !apiKey) {
    console.warn(
      "[weekly] draft email skipped (WEEKLY_EDITOR_EMAIL or RESEND_API_KEY not set)",
    );
    return { delivered: false };
  }
  const { error } = await new Resend(apiKey).emails.send({
    from: process.env.EMAIL_FROM ?? "PainProof <onboarding@resend.dev>",
    to,
    subject: `Weekly draft ${input.slug}: ${input.title} (${input.painCount} pains)`,
    text: [
      `Your PainProof Weekly draft for ${input.slug} is ready.`,
      ``,
      `Review it, then publish to the archive:`,
      `  npm run weekly:publish -- ${input.slug}            # or --drop 3,5 to remove pains`,
      ``,
      `Paste the markdown below into your newsletter tool. Open every link before sending.`,
      ``,
      `----------------------------------------------------------------`,
      ``,
      input.markdown,
    ].join("\n"),
  });
  if (error) {
    console.error("[weekly] failed to send draft email", error);
    return { delivered: false };
  }
  return { delivered: true };
}
