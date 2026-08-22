const TRACKING_PARAMS = /^(utm_|fbclid|gclid|mc_[ce]id|ref|source|hsa_)/i;

const NON_PAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif", ".ico", ".bmp",
  ".css", ".js", ".mjs", ".map", ".json", ".xml", ".rss", ".atom",
  ".pdf", ".zip", ".gz", ".tar", ".dmg", ".exe", ".pkg", ".woff", ".woff2", ".ttf",
  ".mp4", ".webm", ".mp3", ".wav", ".mov", ".csv", ".txt",
]);

/** Strips fragments, tracking params and trailing slashes so URLs dedupe cleanly. */
export function normalizeUrl(input: string, base?: string): string | null {
  let url: URL;
  try {
    url = new URL(input, base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  url.hash = "";
  url.username = "";
  url.password = "";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  url.hostname = url.hostname.replace(/^www\./, "");
  return url.toString();
}

export function isLikelyPage(url: string): boolean {
  const { pathname } = new URL(url);
  const dot = pathname.lastIndexOf(".");
  if (dot === -1) return true;
  const extension = pathname.slice(dot).toLowerCase();
  if (!NON_PAGE_EXTENSIONS.has(extension)) return true;
  return [".html", ".htm", ".php", ".asp", ".aspx"].includes(extension);
}

/** Same registrable host, ignoring the www prefix. */
export function isSameSite(url: string, base: string): boolean {
  try {
    const a = new URL(url).hostname.replace(/^www\./, "");
    const b = new URL(base).hostname.replace(/^www\./, "");
    return a === b;
  } catch {
    return false;
  }
}

export function pathSegments(url: string): string[] {
  return new URL(url).pathname.split("/").filter(Boolean);
}

/** The directory the entry URL sits in; llms.txt covers everything below it. */
export function basePathOf(url: string): string {
  const parsed = new URL(url);
  const path = parsed.pathname;
  if (path.endsWith("/")) return path;
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return "/";
  const last = segments[segments.length - 1];
  return last.includes(".") ? `/${segments.slice(0, -1).join("/")}` : `${path}/`;
}

export function ensureUrl(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return new URL(withScheme).toString();
}

/** Human readable label derived from the last path segment. */
export function titleFromPath(url: string): string {
  const segments = pathSegments(url);
  const last = segments[segments.length - 1] ?? "Home";
  return last
    .replace(/\.[a-z]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
