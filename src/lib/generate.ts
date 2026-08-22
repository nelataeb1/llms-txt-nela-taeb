import { firstSentences, normalizeWhitespace } from "./extract";
import { DEFAULT_GROUP_OPTIONS, type GroupOptions, groupPages } from "./group";
import type { CrawledPage, LlmsDocument, SiteProfile } from "./types";

/** Derives the H1 title and blockquote summary from the crawled home page. */
export function buildSiteProfile(
  entryUrl: string,
  pages: CrawledPage[],
  siteName?: string,
): SiteProfile {
  const entry = pages.find((page) => page.url === entryUrl) ?? pages[0];
  const host = new URL(entryUrl).hostname.replace(/^www\./, "");
  const name =
    normalizeWhitespace(siteName || brandFromTitle(entry?.title, host) || host).slice(0, 80) || host;

  const summarySource = entry?.description || entry?.text || "";
  return {
    baseUrl: entryUrl,
    name,
    summary: firstSentences(summarySource, 260),
    details: [],
  };
}

/**
 * Home page titles are usually "Page name | Brand". If one part matches the
 * host we use it as the site name, otherwise the whole title stands.
 */
function brandFromTitle(title: string | undefined, host: string): string | undefined {
  if (!title) return undefined;
  const parts = title.split(/\s+[|\-–—\\/·:]\s+/).filter(Boolean);
  if (parts.length < 2) return title;
  const domain = host.split(".")[0].toLowerCase();
  const branded = parts.find((part) => part.toLowerCase().replace(/\s+/g, "") === domain);
  return branded ?? title;
}

export function buildDocument(
  site: SiteProfile,
  pages: CrawledPage[],
  options: GroupOptions = DEFAULT_GROUP_OPTIONS,
): LlmsDocument {
  const sections = groupPages(pages, site.baseUrl, options).map((section) => ({
    ...section,
    links: section.links.map((link) => ({
      ...link,
      title: stripBrand(link.title, site.name),
      // A note repeating the site summary adds nothing for the reader.
      notes: link.notes && link.notes !== site.summary ? link.notes : undefined,
    })),
  }));

  return {
    title: site.name,
    summary: site.summary || undefined,
    details: site.details,
    sections,
  };
}

/** Drops the repeated "| Brand" suffix that most page titles carry. */
function stripBrand(title: string, brand: string): string {
  if (!brand) return title;
  const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const trimmed = title.replace(new RegExp(`\\s*[|\\-–—\\\\/·:]\\s*${escaped}\\s*$`, "i"), "");
  return trimmed.trim() || title;
}

/**
 * Renders a document as llms.txt: H1 title, optional blockquote summary,
 * optional detail paragraphs, then H2 sections of `- [title](url): notes`.
 */
export function renderLlmsTxt(document: LlmsDocument): string {
  const lines: string[] = [`# ${escapeInline(document.title)}`];

  if (document.summary) {
    lines.push("", `> ${escapeInline(document.summary)}`);
  }
  for (const detail of document.details.filter(Boolean)) {
    lines.push("", escapeInline(detail));
  }
  for (const section of document.sections) {
    if (section.links.length === 0) continue;
    lines.push("", `## ${escapeInline(section.name)}`, "");
    for (const link of section.links) {
      const notes = link.notes ? `: ${escapeInline(link.notes)}` : "";
      lines.push(`- [${escapeLinkText(link.title)}](${encodeURI(link.url)})${notes}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

/** llms-full.txt: the same index followed by the extracted page text. */
export function renderLlmsFullTxt(document: LlmsDocument, pages: CrawledPage[]): string {
  const chunks = [renderLlmsTxt(document)];
  for (const page of pages) {
    if (!page.text) continue;
    chunks.push(
      [
        `# ${escapeInline(page.title)}`,
        "",
        `Source: ${page.url}`,
        "",
        page.text,
        "",
        "---",
      ].join("\n"),
    );
  }
  return chunks.join("\n");
}

/** Headings, blockquotes and list markers must not leak out of a single line. */
function escapeInline(text: string): string {
  return normalizeWhitespace(text).replace(/^([#>\-*])/, "\\$1");
}

function escapeLinkText(text: string): string {
  return normalizeWhitespace(text).replace(/[[\]]/g, "");
}
