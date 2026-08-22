import { describe, expect, it } from "vitest";
import { parseSitemap } from "@/lib/sitemap";

describe("parseSitemap", () => {
  it("reads urlsets with metadata", () => {
    const { pages } = parseSitemap(
      `<?xml version="1.0"?><urlset><url><loc>https://acme.com/a/</loc><lastmod>2024-01-01</lastmod><priority>0.8</priority></url></urlset>`,
      "https://acme.com",
    );
    expect(pages).toEqual([{ url: "https://acme.com/a", lastModified: "2024-01-01", priority: 0.8 }]);
  });

  it("follows sitemap indexes", () => {
    const { pages, children } = parseSitemap(
      `<sitemapindex><sitemap><loc>https://acme.com/sitemap-1.xml</loc></sitemap></sitemapindex>`,
      "https://acme.com",
    );
    expect(pages).toHaveLength(0);
    expect(children).toEqual(["https://acme.com/sitemap-1.xml"]);
  });

  it("handles CDATA and entity encoded locations", () => {
    const { pages } = parseSitemap(
      `<urlset><url><loc><![CDATA[https://acme.com/x?a=1&amp;b=2]]></loc></url></urlset>`,
      "https://acme.com",
    );
    expect(pages[0].url).toBe("https://acme.com/x?a=1&b=2");
  });

  it("reads plain text sitemaps", () => {
    const { pages } = parseSitemap("https://acme.com/a\nhttps://acme.com/b\n", "https://acme.com");
    expect(pages.map((entry) => entry.url)).toEqual(["https://acme.com/a", "https://acme.com/b"]);
  });
});
