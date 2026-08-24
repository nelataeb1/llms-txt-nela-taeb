export type PageKind =
  | "home"
  | "docs"
  | "api"
  | "guide"
  | "blog"
  | "product"
  | "company"
  | "support"
  | "legal"
  | "other";

export interface CrawledPage {
  url: string;
  path: string;
  title: string;
  description: string;
  kind: PageKind;
  /** Depth from the entry URL, 0 for the entry page itself. */
  depth: number;
  /** True when the URL was advertised in a sitemap. */
  fromSitemap: boolean;
  /** Number of distinct internal pages linking here. */
  inboundLinks: number;
  /** True when the page is linked from the site header/footer navigation. */
  inNav: boolean;
  wordCount: number;
  /** Markdown alternate advertised by the page (rel=alternate) or discovered. */
  markdownUrl?: string;
  /** Hash of the extracted content, used to detect changes between runs. */
  contentHash: string;
  /** Plain-text body, only kept when the caller asks for llms-full.txt. */
  text?: string;
}

export interface SiteProfile {
  /** Origin plus base path the llms.txt file covers, e.g. https://x.com/docs/ */
  baseUrl: string;
  name: string;
  summary: string;
  /** Extra context lines rendered between the blockquote and the first H2. */
  details: string[];
}

export interface CrawlOptions {
  maxPages: number;
  maxDepth: number;
  /** Restrict the crawl to URLs under the entry path. */
  scopeToPath: boolean;
  respectRobots: boolean;
  includeFullText: boolean;
  useLlm: boolean;
}

export const DEFAULT_CRAWL_OPTIONS: CrawlOptions = {
  maxPages: 500,
  maxDepth: 3,
  scopeToPath: false,
  respectRobots: true,
  includeFullText: false,
  useLlm: true,
};

export interface CrawlStats {
  fetched: number;
  failed: number;
  skipped: number;
  sitemapUrls: number;
  discoveredVia: "sitemap" | "links" | "sitemap+links";
}

export interface LlmsSection {
  name: string;
  links: LlmsLink[];
}

export interface LlmsLink {
  title: string;
  url: string;
  notes?: string;
}

export interface LlmsDocument {
  title: string;
  summary?: string;
  details: string[];
  sections: LlmsSection[];
}

export interface GenerationResult {
  site: SiteProfile;
  document: LlmsDocument;
  llmsTxt: string;
  llmsFullTxt?: string;
  pages: CrawledPage[];
  stats: CrawlStats;
  enrichedByLlm: boolean;
  warnings: string[];
}
