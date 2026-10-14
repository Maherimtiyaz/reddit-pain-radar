import { authenticate, type ApiPrincipal } from "./auth";
import { apiError, unauthorized } from "./http";

/** The global `db` client needs `DATABASE_URL`; the API is unusable without it. */
export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
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
 */
export function withAuth<Ctx = unknown>(handler: Handler<Ctx>) {
  return async (request: Request, ctx: Ctx): Promise<Response> => {
    if (!databaseConfigured()) {
      return apiError(
        503,
        "API unavailable: database is not configured.",
        "unavailable",
      );
    }

    const principal = await authenticate(request);
    if (!principal) return unauthorized();

    try {
      return await handler(request, principal, ctx);
    } catch (error) {
      console.error("[api] unhandled error", error);
      return apiError(500, "Internal server error.", "internal_error");
    }
  };
}
