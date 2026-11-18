import { site } from "@/lib/site";

/** Thrown for any non-2xx answer (after retries) or unparseable body. */
export class SourceHttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "SourceHttpError";
  }
}

export type FetchJsonOptions = {
  headers?: Record<string, string>;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Extra attempts after the first for 429/5xx/network errors. */
  retries?: number;
  /** Injected for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Injected for tests; defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 8_000;

export const USER_AGENT = `PainProof/1.0 (+${site.url})`;

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Retry-After seconds (or HTTP date) → ms, capped so a source can't stall us. */
export function retryAfterMs(header: string | null, attempt: number): number {
  const fallback = Math.min(500 * 2 ** attempt, MAX_BACKOFF_MS);
  if (!header) return fallback;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.min(Math.max(seconds * 1000, 0), MAX_BACKOFF_MS);
  }
  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    return Math.min(Math.max(date - Date.now(), 0), MAX_BACKOFF_MS);
  }
  return fallback;
}

/**
 * GET a JSON document from a public source API.
 *
 * Always bypasses the Next.js data cache (`no-store`): evidence must be fresh,
 * and the callers are request-time code. Retries 429/5xx and network errors
 * with bounded backoff, honouring `Retry-After`.
 */
export async function fetchJson(
  url: string,
  options: FetchJsonOptions = {},
): Promise<unknown> {
  const {
    headers = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = 1,
    fetchImpl = fetch,
    sleep = realSleep,
  } = options;

  let lastError: SourceHttpError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
          ...headers,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      lastError = new SourceHttpError(`Request failed: ${reason}`, null);
      if (attempt < retries) await sleep(retryAfterMs(null, attempt));
      continue;
    }

    if (response.ok) {
      try {
        return await response.json();
      } catch {
        throw new SourceHttpError(
          "Response was not valid JSON",
          response.status,
        );
      }
    }

    lastError = new SourceHttpError(
      `HTTP ${response.status} from ${new URL(url).host}`,
      response.status,
    );
    if (!isRetryable(response.status) || attempt === retries) break;
    await sleep(retryAfterMs(response.headers.get("retry-after"), attempt));
  }

  throw lastError ?? new SourceHttpError("Request failed", null);
}
