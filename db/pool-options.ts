import type { PoolConfig } from "pg";

/**
 * Connection settings shared by the app and admin pools.
 *
 * Serverless deployments run one pool per function instance, so the default
 * `max` is deliberately small: a handful of instances times a ten-connection
 * pool is how a hosted Postgres runs out of slots. Raise `PG_POOL_MAX` when
 * connecting to a server that can take it, or keep it low and point
 * `DATABASE_URL` at a pooler (Neon's `-pooler` host, PgBouncer). Hosted URLs
 * should carry `?sslmode=require`.
 */
export function poolOptions(connectionString: string | undefined): PoolConfig {
  const configured = Number(process.env.PG_POOL_MAX);
  const max = Number.isFinite(configured) && configured > 0 ? configured : 3;

  return {
    connectionString,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };
}
