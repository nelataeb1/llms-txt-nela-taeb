export const USER_AGENT =
  "llms-txt-generator/1.0 (+https://github.com/nelataeb1/llms-txt-nela-taeb)";

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_BYTES = 3_000_000;

export interface FetchResult {
  url: string;
  status: number;
  contentType: string;
  body: string;
  headers: Headers;
}

export class FetchError extends Error {
  constructor(
    readonly url: string,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

/**
 * Fetches a URL as text with a timeout, a size cap and one retry on transient
 * failures. Redirects are followed so the caller sees the final URL.
 */
export async function fetchText(
  url: string,
  init: RequestInit & { timeoutMs?: number; accept?: string } = {},
): Promise<FetchResult> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, accept, ...rest } = init;
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...rest,
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent": USER_AGENT,
          accept: accept ?? "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
          "accept-language": "en",
          ...(rest.headers ?? {}),
        },
      });

      const contentType = response.headers.get("content-type") ?? "";
      const body = response.ok ? await readCapped(response) : "";
      return {
        url: response.url || url,
        status: response.status,
        contentType,
        body,
        headers: response.headers,
      };
    } catch (error) {
      lastError = error;
      if (controller.signal.aborted) break;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new FetchError(url, describeError(lastError));
}

async function readCapped(response: Response): Promise<string> {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return "";
  const text = await response.text();
  return text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code ? `${error.message} (${cause.code})` : error.message;
  }
  return String(error);
}

/** Runs tasks with a bounded number of concurrent workers, preserving order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}
