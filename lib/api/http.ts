import { NextResponse } from "next/server";

/** Shared JSON response helpers for the v1 API. */

export type ApiErrorBody = { error: { message: string; code: string } };

export function json<T>(data: T, init?: ResponseInit): NextResponse<T> {
  const response = NextResponse.json(data, init);
  // Every v1 response is authenticated and several carry one-time secrets
  // (a freshly minted API key), so no shared cache may store them.
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function apiError(
  status: number,
  message: string,
  code = "error",
): NextResponse<ApiErrorBody> {
  const response = NextResponse.json<ApiErrorBody>(
    { error: { message, code } },
    { status },
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function unauthorized(): NextResponse<ApiErrorBody> {
  return apiError(401, "Missing or invalid API key.", "unauthorized");
}

/** Per-IP throttle response for the unauthenticated edge of the API. */
export function tooManyRequests(
  retryAfterSeconds: number,
): NextResponse<ApiErrorBody> {
  const response = apiError(
    429,
    "Too many requests. Try again shortly.",
    "rate_limited",
  );
  response.headers.set("Retry-After", String(retryAfterSeconds));
  return response;
}

/**
 * A `503` for "the API exists but cannot serve right now" — unset credentials
 * or an unreachable database. The shared `unavailable` code and `Retry-After`
 * tell clients this is transient, not a bug in their request.
 */
export function serviceUnavailable(
  message = "Service temporarily unavailable. Please retry shortly.",
): NextResponse<ApiErrorBody> {
  const response = apiError(503, message, "unavailable");
  response.headers.set("Retry-After", "5");
  return response;
}
