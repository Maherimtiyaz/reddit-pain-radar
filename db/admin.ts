import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { relations } from "./schema";

/**
 * Privileged (RLS-bypassing) client for system paths.
 *
 * Row-level security on the tenant tables means a non-owner app role cannot
 * read `api_keys`/`orgs` before `app.current_org_id` is known, and cannot
 * create the first org + membership during signup. Those system paths use
 * `adminDb`, which connects with `DATABASE_ADMIN_URL` — a role that owns the
 * tables (or a superuser) so policies are bypassed.
 *
 * Falls back to `DATABASE_URL` when no separate admin URL is configured, which
 * is fine locally where the connecting role is typically the table owner.
 * Never expose this client to org-scoped request handling; use `withTenant`.
 */
const globalForAdmin = globalThis as unknown as {
  __painRadarAdminPool?: Pool;
};

export const adminPool =
  globalForAdmin.__painRadarAdminPool ??
  new Pool({
    connectionString:
      process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  globalForAdmin.__painRadarAdminPool = adminPool;
}

export const adminDb = drizzle({ client: adminPool, relations });
