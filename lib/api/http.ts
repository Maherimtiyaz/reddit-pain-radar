import { NextResponse } from "next/server";

/** Shared JSON response helpers for the v1 API. */

export type ApiErrorBody = { error: { message: string; code: string } };

export function json<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

export function apiError(
  status: number,
  message: string,
  code = "error",
): NextResponse<ApiErrorBody> {
  return NextResponse.json<ApiErrorBody>(
    { error: { message, code } },
    { status },
  );
}

export function unauthorized(): NextResponse<ApiErrorBody> {
  return apiError(401, "Missing or invalid API key.", "unauthorized");
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
