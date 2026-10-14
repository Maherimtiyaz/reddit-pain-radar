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
