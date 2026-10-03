import { RetryOptions } from "./types";

export const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 5,
  baseDelayMs: 200,
  maxDelayMs: 10_000,
};

export const backoffDelay = (attempt: number, o: RetryOptions) =>
  Math.min(o.baseDelayMs * 2 ** attempt, o.maxDelayMs);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs `fn`, retrying with exponential backoff; rethrows the last error. */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions,
  onRetry?: (error: unknown, attempt: number) => void,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt >= options.maxRetries) throw error;
      onRetry?.(error, attempt);
      await sleep(backoffDelay(attempt, options));
    }
  }
}
