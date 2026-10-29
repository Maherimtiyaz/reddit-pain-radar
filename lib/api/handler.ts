import { authenticate, type ApiPrincipal } from "./auth";
import { apiError, serviceUnavailable, unauthorized } from "./http";

/** The global `db` client needs `DATABASE_URL`; the API is unusable without it. */
export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Error codes that mean "the database cannot be reached right now": Node socket
 * failures, plus PostgreSQL SQLSTATE `08xxx` (connection exception) and the
 * shutdown / cannot-connect / too-many-clients family. Drizzle wraps driver
 * errors, so the chain is walked through `cause`.
 */
const UNAVAILABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "57P01",
  "57P02",
  "57P03",
  "53300",
]);

function isDatabaseUnavailable(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < 6; depth += 1) {
    const code = (current as { code?: unknown } | null)?.code;
    if (
      typeof code === "string" &&
      (UNAVAILABLE_CODES.has(code) || code.startsWith("08"))
    ) {
      return true;
    }

    current = (current as { cause?: unknown } | null)?.cause;
  }

  return false;
}

/**
 * Next's control-flow errors (prerender bailouts, redirects, not-found) carry a
 * `NEXT_*` digest and must reach the framework instead of becoming a JSON 500.
 */
function isFrameworkControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

type Handler<Ctx> = (
  request: Request,
  principal: ApiPrincipal,
  ctx: Ctx,
) => Promise<Response>;

/**
 * Shared preamble for every v1 route handler: fail fast with a JSON `503` when
 * the database is not configured, authenticate the `Bearer` key (`401`), then
 * convert unexpected errors into a JSON `500` instead of the framework's HTML
 * error page.
 *
 * Authentication runs inside the `try` as well, because resolving a key hits
 * the database — a database outage there must still produce the documented
 * `{ error: { message, code } }` envelope rather than an empty framework 500.
 */
export function withAuth<Ctx = unknown>(handler: Handler<Ctx>) {
  return async (request: Request, ctx: Ctx): Promise<Response> => {
    if (!databaseConfigured()) {
      return serviceUnavailable("API unavailable: database is not configured.");
    }

    try {
      const principal = await authenticate(request);
      if (!principal) return unauthorized();

      return await handler(request, principal, ctx);
    } catch (error) {
      if (isFrameworkControlFlow(error)) throw error;

      if (isDatabaseUnavailable(error)) {
        console.error("[api] database unavailable", error);
        return serviceUnavailable(
          "Service temporarily unavailable: the database is unreachable.",
        );
      }

      console.error("[api] unhandled error", error);
      return apiError(500, "Internal server error.", "internal_error");
    }
  };
}
