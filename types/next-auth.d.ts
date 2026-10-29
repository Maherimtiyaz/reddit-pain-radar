import type { DefaultSession } from "next-auth";

/**
 * Database sessions carry the adapter user id; the `session` callback in
 * `auth.ts` copies it onto `session.user`. Declare it so the dashboard can
 * read `session.user.id` without casts.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
