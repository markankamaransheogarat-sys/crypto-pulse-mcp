/** Minimal JSON-over-HTTP client: timeout, bounded retries and a small in-memory TTL cache. */

export class HttpError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface GetJsonOptions {
  /** Cache the parsed response for this long. 0 disables caching. */
  ttlMs?: number;
  timeoutMs?: number;
  /** Extra attempts after the first one, for network errors, 429 and 5xx. */
  retries?: number;
}

const USER_AGENT = "crypto-pulse-mcp/0.1 (+https://github.com/markankamaransheogarat-sys/crypto-pulse-mcp)";
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

const cache = new Map<string, { expires: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export function clearCache(): void {
  cache.clear();
  inflight.clear();
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function fetchOnce(url: string, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new HttpError(`HTTP ${response.status} from ${new URL(url).host}`, url, response.status);
  }
  try {
    return await response.json();
  } catch {
    throw new HttpError(`Invalid JSON from ${new URL(url).host}`, url, response.status);
  }
}

export async function getJson<T>(url: string, options: GetJsonOptions = {}): Promise<T> {
  const { ttlMs = 0, timeoutMs = 10_000, retries = 2 } = options;

  if (ttlMs > 0) {
    const hit = cache.get(url);
    if (hit && hit.expires > Date.now()) return hit.value as T;
    // Several tool calls asking for the same URL at once share one request.
    const pending = inflight.get(url);
    if (pending) return (await pending) as T;
  }

  const run = async (): Promise<T> => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const value = (await fetchOnce(url, timeoutMs)) as T;
        if (ttlMs > 0) cache.set(url, { expires: Date.now() + ttlMs, value });
        return value;
      } catch (error) {
        lastError = error;
        const retryable = !(error instanceof HttpError) || error.status === undefined || RETRYABLE.has(error.status);
        if (!retryable || attempt === retries) break;
        await sleep(250 * 2 ** attempt);
      }
    }
    if (lastError instanceof HttpError) throw lastError;
    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    throw new HttpError(`Request to ${new URL(url).host} failed: ${reason}`, url);
  };

  const promise = run();
  if (ttlMs > 0) {
    inflight.set(url, promise);
    promise.then(
      () => inflight.delete(url),
      () => inflight.delete(url),
    );
  }
  return promise;
}
