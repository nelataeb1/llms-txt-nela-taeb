# llms.txt Generator

**Live app: https://llms-txt-nela-taeb.vercel.app**

Paste a website URL, get a spec-compliant [`llms.txt`](https://llmstxt.org/) back — then keep it
monitored so it is regenerated when the site changes.

- **Generate** — crawls the site (sitemaps first, link crawl as fallback), extracts metadata,
  groups pages into sections, and renders `llms.txt` (plus optional `llms-full.txt`).
- **Validate** — every generated file is checked against the spec and the results are shown in the UI.
- **Monitor** — a site can be tracked; a daily cron re-crawls it, diffs the pages, and stores a new
  snapshot only when something actually changed. The latest file is served at `/s/{siteId}/llms.txt`.
- **AI-readiness audit** and **retrieval eval** — see [Beyond the spec](#beyond-the-spec).

## Beyond the spec

A valid `llms.txt` is table stakes: the file only matters if AI crawlers can reach the site and if the
file actually routes an agent to the right page. Two extra tools ship in the result view for that.

**AI-readiness audit** (`POST /api/audit`) — grades the domain the way an answer engine sees it:

- Re-parses `robots.txt` once per bot token (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot,
  PerplexityBot, Google-Extended) instead of assuming the `*` group applies to all of them.
- Re-fetches the entry page with each bot's own user-agent and compares the body size against a
  browser-like baseline, which surfaces 403s, WAF challenges and cloaking a normal crawl never sees.
- Checks sitemap coverage, meta-description coverage, server-rendered content, canonical duplication,
  markdown alternates, and whether an existing `/llms.txt` is present, valid and still current
  (stale links and missing pages are counted against the crawl).
- Every check carries a weight, a verdict (`pass`/`warn`/`fail`) and a concrete fix; the weighted
  total becomes a 0-100 score and an A-F grade.

**Retrieval eval** (`POST /api/eval`) — measures whether the generated file is any good:

- One model call writes realistic user questions from the crawled pages.
- A second call must answer each question by picking a page while seeing *only* the generated index —
  no page content — which is exactly the decision a real agent makes.
- The result is a retrieval-accuracy percentage plus the links whose notes are too ambiguous to
  disambiguate, i.e. the descriptions worth rewriting.

Both are opt-in (six extra network probes / two LLM calls) so generation itself stays fast.

## Screenshots

Generating a file (llmstxt.org, spec compliant, LLM-written descriptions):

![Generate](docs/generate.png)

AI-readiness audit — score, per-crawler access and the weighted checks with fixes:

![AI readiness](docs/ai-readiness.png)
![AI readiness checks](docs/ai-readiness-checks.png)

Retrieval eval — how often an agent picks the right page from the index alone:

![Retrieval eval](docs/retrieval-eval.png)

Monitored sites and a site's snapshot history:

![Monitored sites](docs/monitored-sites.png)
![Site history](docs/site-history.png)

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

No configuration is required: without a database the app keeps jobs and monitored sites in memory,
and without an LLM key it uses heuristics for titles, sections and descriptions.

Other scripts:

```bash
npm run build      # production build
npm run test       # vitest unit tests
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```

## Configuration

All environment variables are optional (see `.env.example`):

| Variable | Purpose | Without it |
| --- | --- | --- |
| `DATABASE_URL` | Neon/Postgres connection string; persists jobs, sites and snapshots | in-memory store, data lost on restart |
| `OPENAI_API_KEY` | Enables LLM-assisted titles, section names and descriptions | heuristic grouping (fully functional) |
| `OPENAI_MODEL` | Model used for enrichment | `gpt-4o-mini` |
| `CRON_SECRET` | Required as `Authorization: Bearer …` on `/api/cron/refresh` | the endpoint is unauthenticated |

Schema creation is automatic — the Postgres store creates its tables on first use.

## Deployment (Vercel + Neon)

1. Push this repo to GitHub and import it in Vercel (framework preset: Next.js).
2. Create a Neon Postgres database and set `DATABASE_URL` in the Vercel project (all environments).
3. Set `CRON_SECRET` to a random string. Vercel sends it automatically to cron routes.
4. Deploy. `vercel.json` registers a daily cron at 03:00 UTC hitting `/api/cron/refresh`, which
   re-crawls every monitored site and stores a snapshot when the content hash changes.

## How it works

```
URL → crawl (robots + sitemap + links) → extract → classify/rank → group → render → validate
                                                                        ↑
                                                            optional LLM enrichment
```

- **`src/lib/robots.ts`** — robots.txt parser (user-agent groups, wildcards, `$`, crawl-delay capped
  at 2s, sitemap hints). Crawling honours it by default.
- **`src/lib/sitemap.ts`** — sitemap discovery from robots.txt and common paths; handles sitemap
  indexes, gzip, XML entities/CDATA and plain-text sitemaps.
- **`src/lib/crawl.ts`** — resumable, serializable crawl state. Each slice fetches a bounded batch
  within a time budget and returns the new state, so a crawl survives serverless request limits.
  Off-site redirects, non-HTML responses, `noindex` pages and out-of-scope URLs are dropped.
- **`src/lib/extract.ts`** — title, description (meta/OG/Twitter/JSON-LD), canonical, markdown
  alternates (`<link rel="alternate" type="text/markdown">` and `Link` headers), body vs. nav links,
  word count and a content hash used for change detection.
- **`src/lib/classify.ts`** — path-based page kinds (docs, api, guide, blog, product, company,
  support, legal…) and a ranking score combining kind, depth, inbound links, nav membership,
  sitemap presence, markdown availability and content length.
- **`src/lib/group.ts` / `generate.ts`** — sections, link budgets, a trailing `Optional` section for
  low-value pages, brand-suffix stripping, and the renderer that emits the H1/blockquote/H2 layout
  required by the spec. Markdown alternates are preferred as link targets.
- **`src/lib/llm.ts`** — optional enrichment. The model only ever picks from numbered candidate
  pages, so it cannot invent URLs; any failure falls back to the heuristic document.
- **`src/lib/validate.ts`** — the spec checker used by the UI and by `/api/validate`.
- **`src/lib/audit.ts`** — the readiness audit. Robots is re-parsed once per bot token, then each bot
  fetches the entry page with its own user-agent and the body size is compared against a browser-like
  baseline to catch blocking, WAF challenges and cloaking that a normal crawl never sees.
- **`src/lib/eval.ts`** — the retrieval eval. Both LLM calls exchange link ids rather than URLs, so a
  hallucinated answer is rejected instead of silently scored.
- **`src/lib/monitor.ts` / `diff.ts`** — snapshots, per-page added/removed/changed diffs, and the
  refresh routine shared by the manual button and the cron job.

### Design decisions

- **Sitemap-first, link-crawl fallback.** Sitemaps give breadth cheaply; link crawling covers sites
  without one and supplies nav/inbound-link signals used for ranking.
- **Slice-based crawling.** Keeps every request under serverless limits and makes progress visible
  in the UI instead of blocking on one long request.
- **Budgeted crawl, not exhaustive.** Discovery is unbounded (the frontier routinely holds thousands
  of URLs) but fetching stops at `maxPages` — 500 by default, adjustable in Options. The frontier is
  ordered sitemap-first and shallow-first, so the budget is spent on the pages an agent would actually
  want. A full crawl would cost minutes and thousands of requests to a stranger's origin, and would
  not change the output: `llms.txt` is a curated index capped at ~120 links so it stays cheap to read
  in a model's context. Paginated archives, tag pages and filter permutations are exactly what inflates
  the queue and exactly what does not belong in the file.
- **LLM optional, never authoritative.** The heuristic path always produces a valid file; the LLM
  only relabels and regroups pages it was given.
- **Hash-based change detection.** Page-level hashes make diffs cheap and let monitoring skip
  writing a snapshot when nothing changed.
- **Audit and eval are opt-in, post-generation.** Both cost extra network round-trips (six bot probes)
  or LLM calls, so they run from their own endpoints behind a button rather than slowing generation.

## API

| Route | Description |
| --- | --- |
| `POST /api/generate` | Starts a crawl, returns job id, progress and the result when done |
| `POST /api/jobs/{id}` | Advances a running crawl by one slice |
| `POST /api/validate` | Validates an arbitrary `llms.txt` document |
| `POST /api/audit` | Runs the AI-readiness audit for a finished job (`{ jobId }`) |
| `POST /api/eval` | Scores retrieval accuracy of a finished job's index (`{ jobId }`, needs `OPENAI_API_KEY`) |
| `GET/POST /api/sites` | Lists monitored sites / adds one with a baseline snapshot |
| `POST /api/sites/{id}/refresh` | Re-crawls a site and diffs it against the last snapshot |
| `GET /s/{id}/llms.txt` | Serves the latest generated file as `text/plain` |
| `GET /api/cron/refresh` | Scheduled refresh of every monitored site |

## Tests

`npm run test` covers robots/sitemap parsing, metadata extraction, URL normalization,
classification and ranking, document generation, spec validation, snapshot diffing, per-bot robots
evaluation and audit scoring/grading.
