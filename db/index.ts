import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { relations } from "./schema";

/**
 * Reuse a single connection pool across hot reloads in development so we
 * don't exhaust Postgres connections on every HMR pass.
 */
const globalForDb = globalThis as unknown as { __painRadarPool?: Pool };

export const pool =
  globalForDb.__painRadarPool ??
  new Pool({ connectionString: process.env.DATABASE_URL });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__painRadarPool = pool;
}

/**
 * Untenanted client. Use for global tables (`raw_posts`, `pain_signals`) and
 * system operations that are not scoped to a single org. Anything org-scoped
 * should go through `withTenant` in `db/tenant.ts` so RLS applies.
 */
export const db = drizzle({ client: pool, relations });
