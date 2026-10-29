import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";

import { authAdapter } from "@/lib/auth/adapter";
import { sendMagicLinkEmail } from "@/lib/email/magic-link";

/**
 * Email magic-link auth (Auth.js v5 + Drizzle).
 *
 * Sessions are database-backed, so signing out / revoking a session is a row
 * delete and the dashboard can resolve `session.user.id` server-side. The
 * adapter reuses our existing `users` table: a Stripe checkout already created
 * the row by email, so a later magic-link sign-in links to that same user
 * instead of creating a duplicate.
 *
 * `AUTH_SECRET` is required. `trustHost` is on because the app is deployed
 * behind Vercel's proxy and run on a non-default local port (3100).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: authAdapter,
  session: { strategy: "database" },
  trustHost: true,
  pages: {
    signIn: "/login",
    // Auth.js appends `?provider=...&type=email`, so this must stay query-free.
    verifyRequest: "/login",
  },
  providers: [
    Resend({
      from:
        process.env.EMAIL_FROM ?? "Reddit Pain Radar <onboarding@resend.dev>",
      apiKey: process.env.RESEND_API_KEY,
      // Replace the provider's Resend call so local development can log the
      // link instead of sending it (matching the other transactional email).
      async sendVerificationRequest({ identifier, url }) {
        await sendMagicLinkEmail({ to: identifier, url });
      },
    }),
  ],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
