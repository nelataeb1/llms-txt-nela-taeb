import { describe, expect, it } from "vitest";
import { buildDocument, buildSiteProfile, renderLlmsTxt } from "@/lib/generate";
import { validateLlmsTxt } from "@/lib/validate";
import type { CrawledPage } from "@/lib/types";

function page(partial: Partial<CrawledPage> & { url: string }): CrawledPage {
  return {
    path: new URL(partial.url).pathname,
    title: "Title",
    description: "Description",
    kind: "other",
    depth: 1,
    fromSitemap: true,
    inboundLinks: 1,
    inNav: false,
    wordCount: 400,
    contentHash: "abc",
    ...partial,
  };
}

const PAGES: CrawledPage[] = [
  page({ url: "https://acme.com", title: "Acme", description: "Acme builds robots.", kind: "home", depth: 0 }),
  page({ url: "https://acme.com/docs/start", title: "Getting started", kind: "docs" }),
  page({ url: "https://acme.com/docs/api", title: "API", kind: "api", markdownUrl: "https://acme.com/docs/api.md" }),
  page({ url: "https://acme.com/blog/hello", title: "Hello", kind: "blog" }),
  page({ url: "https://acme.com/legal/terms", title: "Terms", kind: "legal" }),
];

describe("generation", () => {
  const site = buildSiteProfile("https://acme.com", PAGES, "Acme");
  const document = buildDocument(site, PAGES);
  const output = renderLlmsTxt(document);

  it("produces a file that passes validation", () => {
    expect(validateLlmsTxt(output).valid).toBe(true);
  });

  it("titles the file after the site and quotes its summary", () => {
    expect(output.startsWith("# Acme\n")).toBe(true);
    expect(output).toContain("> Acme builds robots.");
  });

  it("prefers markdown alternates for links", () => {
    expect(output).toContain("https://acme.com/docs/api.md");
  });

  it("orders documentation before marketing and puts legal in Optional", () => {
    const sections = document.sections.map((section) => section.name);
    expect(sections.indexOf("Documentation")).toBeLessThan(sections.indexOf("Blog & Updates"));
    expect(sections[sections.length - 1]).toBe("Optional");
    expect(document.sections.at(-1)?.links[0].url).toBe("https://acme.com/legal/terms");
  });

  it("excludes the entry page from the link lists", () => {
    expect(output).not.toContain("](https://acme.com)");
  });

  it("escapes characters that would break the markdown structure", () => {
    const tricky = buildDocument(
      { ...site, name: "# Acme", summary: "> quoted" },
      PAGES,
    );
    expect(validateLlmsTxt(renderLlmsTxt(tricky)).valid).toBe(true);
  });
});
