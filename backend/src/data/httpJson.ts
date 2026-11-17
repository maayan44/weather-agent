import { HTTP_MAX_RETRIES, HTTP_TIMEOUT_MS } from "../config/dataSources";

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

// A failure that retrying cannot fix, such as a 404 or a 400.
class PermanentHttpError extends Error {}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Free APIs rate-limit and hiccup, so every outside call shares one retry policy.
export async function fetchJson(url: string): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
      if (response.ok) return await response.json();
      const message = `Request failed with status ${response.status}: ${url}`;
      if (!RETRYABLE_STATUSES.has(response.status)) throw new PermanentHttpError(message);
      throw new Error(message);
    } catch (error) {
      if (error instanceof PermanentHttpError || attempt >= HTTP_MAX_RETRIES) throw error;
    }
    await wait(500 * 2 ** attempt);
  }
}
