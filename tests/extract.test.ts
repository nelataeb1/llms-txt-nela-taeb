import { describe, expect, it } from "vitest";
import { extractPage } from "@/lib/extract";
import { classifyPage, scorePage } from "@/lib/classify";
import { normalizeUrl } from "@/lib/url";
import type { CrawledPage } from "@/lib/types";

const HTML = `<!doctype html>
<html lang="en">
  <head>
    <title>Pricing | Acme</title>
    <meta property="og:site_name" content="Acme" />
    <meta name="description" content="Simple pricing for teams of every size." />
    <link rel="canonical" href="https://acme.com/pricing" />
    <link rel="alternate" type="text/markdown" href="/pricing.md" />
    <script type="application/ld+json">{"@type":"Organization","name":"Acme Inc"}</script>
  </head>
  <body>
    <nav><a href="/docs">Docs</a></nav>
    <main><p>${"Acme sells widgets to engineering teams that need them. ".repeat(6)}</p>
      <a href="/pricing/enterprise">Enterprise</a>
      <a href="https://twitter.com/acme">Twitter</a>
    </main>
    <script>console.log("ignored")</script>
  </body>
</html>`;

describe("extractPage", () => {
  const page = extractPage(HTML, "https://acme.com/pricing");

  it("drops the site name suffix from the title", () => {
    expect(page.title).toBe("Pricing");
  });

  it("prefers the meta description", () => {
    expect(page.description).toBe("Simple pricing for teams of every size.");
  });

  it("finds the markdown alternate, canonical and site name", () => {
    expect(page.markdownUrl).toBe("https://acme.com/pricing.md");
    expect(page.canonical).toBe("https://acme.com/pricing");
    expect(page.siteName).toBe("Acme");
  });

  it("separates navigation links from body links and ignores scripts", () => {
    expect(page.navLinks).toContain("https://acme.com/docs");
    expect(page.links).toContain("https://acme.com/pricing/enterprise");
    expect(page.text).not.toContain("ignored");
  });

  it("hashes content so re-crawls can detect changes", () => {
    expect(page.contentHash).toHaveLength(16);
    expect(extractPage(HTML.replace("Pricing |", "New pricing |"), "https://acme.com/pricing").contentHash)
      .not.toBe(page.contentHash);
  });
});

describe("url normalisation", () => {
  it("strips tracking params, fragments and trailing slashes", () => {
    expect(normalizeUrl("https://www.acme.com/docs/?utm_source=x#top")).toBe("https://acme.com/docs");
  });

  it("rejects non-http schemes", () => {
    expect(normalizeUrl("mailto:a@b.com")).toBeNull();
  });
});

describe("classification", () => {
  it("maps paths to page kinds", () => {
    expect(classifyPage("https://acme.com")).toBe("home");
    expect(classifyPage("https://acme.com/docs/setup")).toBe("docs");
    expect(classifyPage("https://acme.com/api-reference/users")).toBe("api");
    expect(classifyPage("https://acme.com/legal/privacy")).toBe("legal");
  });

  it("ranks documentation above legal pages", () => {
    const base: CrawledPage = {
      url: "https://acme.com/docs",
      path: "/docs",
      title: "Docs",
      description: "d",
      kind: "docs",
      depth: 1,
      fromSitemap: true,
      inboundLinks: 5,
      inNav: true,
      wordCount: 900,
      contentHash: "x",
    };
    expect(scorePage(base)).toBeGreaterThan(
      scorePage({ ...base, kind: "legal", path: "/legal", inNav: false, inboundLinks: 0 }),
    );
  });
});
