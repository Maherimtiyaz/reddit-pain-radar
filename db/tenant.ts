import { sql } from "drizzle-orm";

import { db } from "./index";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Runs `fn` inside a transaction with the tenant identity set, so every
 * org-scoped table is restricted to `orgId` by Postgres row-level security
 * (see the `tenant_isolation` policies in `db/schema.ts`).
 *
 * The setting is transaction-local (`set_config(..., true)`), so it is reset
 * automatically when the transaction ends — safe to use with a shared pool.
 */
export function withTenant<T>(
  orgId: string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.current_org_id', ${orgId}, true)`,
    );
    return fn(tx);
  });
}
