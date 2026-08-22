import { describe, expect, it } from "vitest";
import { type AuditCheck, gradeOf, scoreOf } from "../src/lib/audit";
import { parseRobots } from "../src/lib/robots";

const ROBOTS = `
User-agent: *
Allow: /

User-agent: GPTBot
Disallow: /

User-agent: PerplexityBot
Disallow: /pricing
`;

describe("parseRobots per agent", () => {
  it("applies the group that matches the given agent", () => {
    expect(parseRobots(ROBOTS, "gptbot").isAllowed("https://x.com/docs")).toBe(false);
    expect(parseRobots(ROBOTS, "claudebot").isAllowed("https://x.com/docs")).toBe(true);
    expect(parseRobots(ROBOTS, "perplexitybot").isAllowed("https://x.com/pricing")).toBe(false);
    expect(parseRobots(ROBOTS, "perplexitybot").isAllowed("https://x.com/docs")).toBe(true);
  });

  it("falls back to the wildcard group for unknown agents", () => {
    expect(parseRobots(ROBOTS, "oai-searchbot").isAllowed("https://x.com/")).toBe(true);
  });
});

describe("scoring", () => {
  const checks: AuditCheck[] = [
    { id: "a", label: "a", status: "pass", weight: 50, detail: "" },
    { id: "b", label: "b", status: "warn", weight: 30, detail: "" },
    { id: "c", label: "c", status: "fail", weight: 20, detail: "" },
  ];

  it("weights pass, warn and fail", () => {
    expect(scoreOf(checks)).toBe(65);
  });

  it("maps scores to grades", () => {
    expect(gradeOf(95)).toBe("A");
    expect(gradeOf(65)).toBe("C");
    expect(gradeOf(10)).toBe("F");
  });
});
