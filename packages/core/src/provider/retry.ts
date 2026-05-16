import { AetherError } from "../errors.js";

export interface RetryOptions {
  /** Max attempts including the first. Default 3. */
  maxAttempts?: number;
  /** Base backoff in ms. Default 500. */
  baseDelayMs?: number;
  /** Optional jitter factor 0..1, default 0.2. */
  jitter?: number;
  /** Predicate: should we retry this error? Default = retriable. */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  /** Optional sleeper to inject for tests. */
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
}

export function isRetriableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}

export function defaultShouldRetry(err: unknown): boolean {
  if (err instanceof AetherError && err.code === "PROVIDER_HTTP_ERROR") {
    const status = (err.cause as { status?: number } | undefined)?.status ?? 0;
    return isRetriableHttpStatus(status);
  }
  if (err instanceof TypeError) return true; // fetch network failure
  return false;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const base = opts.baseDelayMs ?? 500;
  const jitter = opts.jitter ?? 0.2;
  const shouldRetry = opts.shouldRetry ?? defaultShouldRetry;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let attempt = 0;
  let lastErr: unknown;
  while (attempt < maxAttempts) {
    if (opts.signal?.aborted) throw new AetherError("ABORTED", "Aborted");
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      attempt += 1;
      if (attempt >= maxAttempts || !shouldRetry(err, attempt)) {
        throw err;
      }
      const delay = base * 2 ** (attempt - 1);
      const j = 1 + (Math.random() * 2 - 1) * jitter;
      await sleep(Math.round(delay * j));
    }
  }
  throw lastErr;
}
