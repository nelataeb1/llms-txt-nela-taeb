import { USER_AGENT, fetchText } from "./http";

interface Rule {
  allow: boolean;
  pattern: string;
}

export interface Robots {
  sitemaps: string[];
  isAllowed: (url: string) => boolean;
  crawlDelayMs: number;
}

const ALLOW_ALL: Robots = { sitemaps: [], isAllowed: () => true, crawlDelayMs: 0 };

/**
 * Minimal robots.txt parser covering the directives that matter for a crawler:
 * user-agent groups, allow/deny patterns (with `*` and `$`), crawl-delay and
 * sitemap hints. Missing or unreachable robots.txt means "crawl allowed".
 */
export async function loadRobots(origin: string): Promise<Robots> {
  let body = "";
  try {
    const response = await fetchText(new URL("/robots.txt", origin).toString(), {
      accept: "text/plain",
      timeoutMs: 8000,
    });
    if (response.status >= 400) return ALLOW_ALL;
    body = response.body;
  } catch {
    return ALLOW_ALL;
  }
  return parseRobots(body);
}

/**
 * Parses robots.txt from the point of view of `userAgent` (defaults to this
 * crawler), so the audit can ask the same file "what does GPTBot see?".
 */
export function parseRobots(body: string, userAgent = USER_AGENT): Robots {
  const sitemaps: string[] = [];
  const groups = new Map<string, Rule[]>();
  const delays = new Map<string, number>();
  const agents = new Set<string>();
  let activeAgents: string[] = [];
  let previousWasAgent = false;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "sitemap") {
      sitemaps.push(value);
      continue;
    }
    if (field === "user-agent") {
      if (!previousWasAgent) activeAgents = [];
      activeAgents.push(value.toLowerCase());
      agents.add(value.toLowerCase());
      previousWasAgent = true;
      continue;
    }
    previousWasAgent = false;
    if (activeAgents.length === 0) continue;

    for (const agent of activeAgents) {
      if (field === "crawl-delay") {
        const seconds = Number(value);
        if (Number.isFinite(seconds)) delays.set(agent, seconds * 1000);
      } else if (field === "allow" || field === "disallow") {
        if (field === "disallow" && value === "") continue;
        const rules = groups.get(agent) ?? [];
        rules.push({ allow: field === "allow", pattern: value });
        groups.set(agent, rules);
      }
    }
  }

  const ourAgent = userAgent.split("/")[0].trim().toLowerCase();
  const agentKey = [ourAgent, "*"].find((key) => agents.has(key));
  const rules = agentKey ? (groups.get(agentKey) ?? []) : [];
  const crawlDelayMs = agentKey ? (delays.get(agentKey) ?? 0) : 0;

  return {
    sitemaps,
    crawlDelayMs: Math.min(crawlDelayMs, 2000),
    isAllowed: (url: string) => isAllowedByRules(rules, url),
  };
}

function isAllowedByRules(rules: Rule[], url: string): boolean {
  let path: string;
  try {
    const parsed = new URL(url);
    path = parsed.pathname + parsed.search;
  } catch {
    return true;
  }

  // Longest matching pattern wins; allow beats disallow on ties (RFC 9309).
  let best: { rule: Rule; length: number } | null = null;
  for (const rule of rules) {
    if (!matches(rule.pattern, path)) continue;
    const length = rule.pattern.replace(/\*/g, "").length;
    if (!best || length > best.length || (length === best.length && rule.allow)) {
      best = { rule, length };
    }
  }
  return best ? best.rule.allow : true;
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const expression = body
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${expression}${anchored ? "$" : ""}`).test(path);
}
