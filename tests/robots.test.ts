import { describe, expect, it } from "vitest";
import { parseRobots } from "@/lib/robots";

const ROBOTS = `
User-agent: *
Disallow: /private/
Allow: /private/public-page
Crawl-delay: 1

User-agent: BadBot
Disallow: /

Sitemap: https://acme.com/sitemap.xml
`;

describe("parseRobots", () => {
  const robots = parseRobots(ROBOTS);

  it("collects sitemap hints", () => {
    expect(robots.sitemaps).toEqual(["https://acme.com/sitemap.xml"]);
  });

  it("applies the wildcard group to our crawler", () => {
    expect(robots.isAllowed("https://acme.com/docs")).toBe(true);
    expect(robots.isAllowed("https://acme.com/private/secret")).toBe(false);
  });

  it("lets the most specific rule win", () => {
    expect(robots.isAllowed("https://acme.com/private/public-page")).toBe(true);
  });

  it("supports wildcards and end anchors", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /*.pdf$");
    expect(rules.isAllowed("https://acme.com/a/b.pdf")).toBe(false);
    expect(rules.isAllowed("https://acme.com/a/b.pdf?x=1")).toBe(true);
  });

  it("caps crawl delay so a hostile value cannot stall the crawl", () => {
    expect(parseRobots("User-agent: *\nCrawl-delay: 60").crawlDelayMs).toBe(2000);
  });
});
