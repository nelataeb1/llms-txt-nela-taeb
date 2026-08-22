import { fetchText } from "./http";
import { parseRobots } from "./robots";
import type { CrawledPage, GenerationResult } from "./types";
import { validateLlmsTxt } from "./validate";

export type CheckStatus = "pass" | "warn" | "fail";

export interface AuditCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** What the site owner should change. Omitted when the check passes. */
  fix?: string;
  weight: number;
}

export interface BotAccess {
  name: string;
  /** True when robots.txt allows this agent to fetch the entry URL. */
  robotsAllowed: boolean;
  /** HTTP status the agent gets, or null when the request failed outright. */
  status: number | null;
  /** Server answers this agent differently than a plain browser-like request. */
  contentShrunk: boolean;
}

export interface ExistingFile {
  present: boolean;
  valid: boolean;
  /** Links in the live file that no longer resolve to a crawled page. */
  staleLinks: number;
  /** Crawled pages the live file never mentions. */
  missingPages: number;
}

export interface AuditReport {
  url: string;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  bots: BotAccess[];
  existing: ExistingFile;
  checks: AuditCheck[];
}

/**
 * The agents that matter for AI answer engines. `Google-Extended` is a policy
 * token rather than a crawler, so it is only evaluated against robots.txt.
 */
const BOTS: { name: string; token: string; userAgent: string; fetches: boolean }[] = [
  {
    name: "GPTBot",
    token: "gptbot",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot",
    fetches: true,
  },
  {
    name: "OAI-SearchBot",
    token: "oai-searchbot",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot",
    fetches: true,
  },
  {
    name: "ChatGPT-User",
    token: "chatgpt-user",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
    fetches: true,
  },
  {
    name: "ClaudeBot",
    token: "claudebot",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ClaudeBot/1.0; +claudebot@anthropic.com",
    fetches: true,
  },
  {
    name: "PerplexityBot",
    token: "perplexitybot",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot",
    fetches: true,
  },
  { name: "Google-Extended", token: "google-extended", userAgent: "Google-Extended", fetches: false },
];

const THIN_PAGE_WORDS = 120;
const SHORT_DESCRIPTION = 50;

/** Runs the live checks (robots, bot fetches, existing llms.txt) for a result. */
export async function auditSite(result: GenerationResult): Promise<AuditReport> {
  const entryUrl = result.site.baseUrl;
  const origin = new URL(entryUrl).origin;

  const [robotsBody, baseline, existingBody] = await Promise.all([
    body(new URL("/robots.txt", origin).toString()),
    fetchText(entryUrl).catch(() => null),
    body(new URL("/llms.txt", origin).toString()),
  ]);

  const bots = await Promise.all(
    BOTS.map((bot) => probeBot(bot, entryUrl, robotsBody, baseline?.body.length ?? 0)),
  );
  const existing = describeExisting(existingBody, result.pages);
  const checks = buildChecks(result, bots, existing, robotsBody);
  const score = scoreOf(checks);

  return { url: entryUrl, score, grade: gradeOf(score), bots, existing, checks };
}

async function probeBot(
  bot: (typeof BOTS)[number],
  entryUrl: string,
  robotsBody: string | null,
  baselineLength: number,
): Promise<BotAccess> {
  const robotsAllowed = robotsBody
    ? parseRobots(robotsBody, bot.token).isAllowed(entryUrl)
    : true;
  if (!bot.fetches) return { name: bot.name, robotsAllowed, status: null, contentShrunk: false };

  try {
    const response = await fetchText(entryUrl, { headers: { "user-agent": bot.userAgent } });
    return {
      name: bot.name,
      robotsAllowed,
      status: response.status,
      // Edge rules sometimes serve bots a stub page instead of a hard block.
      contentShrunk:
        baselineLength > 0 && response.status < 400 && response.body.length < baselineLength * 0.6,
    };
  } catch {
    return { name: bot.name, robotsAllowed, status: null, contentShrunk: false };
  }
}

function describeExisting(text: string | null, pages: CrawledPage[]): ExistingFile {
  if (!text || !text.trimStart().startsWith("#")) {
    return { present: false, valid: false, staleLinks: 0, missingPages: pages.length };
  }
  const linked = new Set(
    [...text.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((match) => match[1].replace(/\/$/, "")),
  );
  const crawled = new Set(pages.map((page) => page.url.replace(/\/$/, "")));
  const valid = validateLlmsTxt(text).issues.every((issue) => issue.level !== "error");

  return {
    present: true,
    valid,
    staleLinks: [...linked].filter((url) => !crawled.has(url)).length,
    missingPages: [...crawled].filter((url) => !linked.has(url)).length,
  };
}

function buildChecks(
  result: GenerationResult,
  bots: BotAccess[],
  existing: ExistingFile,
  robotsBody: string | null,
): AuditCheck[] {
  const pages = result.pages;
  const total = Math.max(pages.length, 1);

  const blocked = bots.filter((bot) => !bot.robotsAllowed || (bot.status ?? 200) >= 400);
  const shrunk = bots.filter((bot) => bot.contentShrunk);
  const described = pages.filter((page) => page.description.length >= SHORT_DESCRIPTION).length;
  const thin = pages.filter((page) => page.wordCount < THIN_PAGE_WORDS).length;
  const duplicates = countDuplicates(pages);
  const markdown = pages.filter((page) => page.markdownUrl).length;

  return [
    {
      id: "bot-access",
      label: "AI crawler access",
      weight: 25,
      ...(blocked.length === 0
        ? { status: "pass" as const, detail: "All major AI crawlers can fetch the site." }
        : {
            status: "fail" as const,
            detail: `${blocked.map((bot) => bot.name).join(", ")} ${blocked.length === 1 ? "is" : "are"} blocked by robots.txt or the edge.`,
            fix: "Allow these agents in robots.txt and in any WAF/bot-management rules — a block here removes the site from AI answers entirely.",
          }),
    },
    {
      id: "bot-parity",
      label: "Same content for bots",
      weight: 10,
      ...(shrunk.length === 0
        ? { status: "pass" as const, detail: "Bots receive the same page a browser does." }
        : {
            status: "warn" as const,
            detail: `${shrunk.map((bot) => bot.name).join(", ")} received a much smaller response than a normal request.`,
            fix: "Check bot-management rules and JS-only rendering: agents do not execute JavaScript, so serve them server-rendered HTML.",
          }),
    },
    {
      id: "robots",
      label: "robots.txt published",
      weight: 5,
      ...(robotsBody
        ? { status: "pass" as const, detail: "robots.txt is reachable." }
        : {
            status: "warn" as const,
            detail: "No robots.txt found.",
            fix: "Publish robots.txt with a Sitemap: line so crawlers can discover the URL set.",
          }),
    },
    {
      id: "sitemap",
      label: "Sitemap coverage",
      weight: 15,
      ...(result.stats.sitemapUrls >= pages.length
        ? { status: "pass" as const, detail: `${result.stats.sitemapUrls} URLs advertised in sitemaps.` }
        : result.stats.sitemapUrls > 0
          ? {
              status: "warn" as const,
              detail: `Sitemaps list ${result.stats.sitemapUrls} URLs but crawling found ${pages.length} pages.`,
              fix: "Regenerate the sitemap so every indexable page is listed; agents rely on it to find content fast.",
            }
          : {
              status: "fail" as const,
              detail: "No usable sitemap — pages were found by following links.",
              fix: "Publish /sitemap.xml and reference it from robots.txt.",
            }),
    },
    {
      id: "descriptions",
      label: "Page descriptions",
      weight: 20,
      ...(ratioCheck(described / total, {
        pass: `${described}/${pages.length} pages have a usable meta description.`,
        fail: `Only ${described}/${pages.length} pages have a meta description of ${SHORT_DESCRIPTION}+ characters.`,
        fix: "Write a distinct one-sentence description per page — this is the text an agent reads before deciding to fetch it.",
      })),
    },
    {
      id: "thin-content",
      label: "Server-rendered content",
      weight: 15,
      ...(ratioCheck(1 - thin / total, {
        pass: `${pages.length - thin}/${pages.length} pages return substantive HTML.`,
        fail: `${thin}/${pages.length} pages returned under ${THIN_PAGE_WORDS} words of HTML.`,
        fix: "Server-render or pre-render the main content — client-only pages look empty to AI crawlers.",
      })),
    },
    {
      id: "duplicates",
      label: "Canonical hygiene",
      weight: 5,
      ...(duplicates === 0
        ? { status: "pass" as const, detail: "No duplicate page content detected." }
        : {
            status: "warn" as const,
            detail: `${duplicates} pages duplicate another page's content.`,
            fix: "Add rel=canonical so agents index one URL per piece of content.",
          }),
    },
    {
      id: "llms-txt",
      label: "Existing /llms.txt",
      weight: 5,
      ...(!existing.present
        ? {
            status: "warn" as const,
            detail: "The site does not publish /llms.txt yet.",
            fix: "Publish the file generated here at /llms.txt and keep it in sync.",
          }
        : !existing.valid
          ? {
              status: "warn" as const,
              detail: "The published /llms.txt does not match the llmstxt.org structure.",
              fix: "Replace it with the spec-valid file generated here.",
            }
          : existing.staleLinks > 0 || existing.missingPages > 0
            ? {
                status: "warn" as const,
                detail: `Published file has ${existing.staleLinks} stale links and misses ${existing.missingPages} crawled pages.`,
                fix: "Regenerate it — monitoring here keeps it current automatically.",
              }
            : { status: "pass" as const, detail: "Published /llms.txt is valid and current." }),
    },
    {
      id: "markdown",
      label: "Markdown alternates",
      weight: 5,
      ...(markdown > 0
        ? { status: "pass" as const, detail: `${markdown} pages advertise a markdown version.` }
        : {
            status: "warn" as const,
            detail: "No .md alternates advertised.",
            fix: "Serve a markdown copy of key pages (rel=alternate type=text/markdown) so agents skip HTML parsing.",
          }),
    },
  ];
}

function ratioCheck(
  ratio: number,
  copy: { pass: string; fail: string; fix: string },
): { status: CheckStatus; detail: string; fix?: string } {
  if (ratio >= 0.9) return { status: "pass", detail: copy.pass };
  if (ratio >= 0.6) return { status: "warn", detail: copy.fail, fix: copy.fix };
  return { status: "fail", detail: copy.fail, fix: copy.fix };
}

function countDuplicates(pages: CrawledPage[]): number {
  const seen = new Map<string, number>();
  for (const page of pages) seen.set(page.contentHash, (seen.get(page.contentHash) ?? 0) + 1);
  return [...seen.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0);
}

export function scoreOf(checks: AuditCheck[]): number {
  const earned = checks.reduce(
    (sum, check) => sum + check.weight * (check.status === "pass" ? 1 : check.status === "warn" ? 0.5 : 0),
    0,
  );
  const available = checks.reduce((sum, check) => sum + check.weight, 0);
  return Math.round((earned / Math.max(available, 1)) * 100);
}

export function gradeOf(score: number): AuditReport["grade"] {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 45) return "D";
  return "F";
}

async function body(url: string): Promise<string | null> {
  try {
    const response = await fetchText(url, { accept: "text/plain", timeoutMs: 8000 });
    return response.status >= 400 ? null : response.body;
  } catch {
    return null;
  }
}
