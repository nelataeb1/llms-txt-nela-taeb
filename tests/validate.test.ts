import { describe, expect, it } from "vitest";
import { validateLlmsTxt } from "@/lib/validate";

const VALID = `# Example

> Example is a widget platform for small teams.

Use the markdown links below.

## Docs

- [Quickstart](https://example.com/docs/quickstart.md): Install and ship in five minutes
- [API](https://example.com/docs/api): Endpoint reference

## Optional

- [Terms](https://example.com/legal/terms)
`;

describe("validateLlmsTxt", () => {
  it("accepts a spec compliant file and parses it back", () => {
    const result = validateLlmsTxt(VALID);
    expect(result.valid).toBe(true);
    expect(result.document?.title).toBe("Example");
    expect(result.document?.summary).toContain("widget platform");
    expect(result.document?.details).toEqual(["Use the markdown links below."]);
    expect(result.document?.sections.map((section) => section.name)).toEqual(["Docs", "Optional"]);
    expect(result.document?.sections[0].links[0]).toEqual({
      title: "Quickstart",
      url: "https://example.com/docs/quickstart.md",
      notes: "Install and ship in five minutes",
    });
  });

  it("rejects a file without an H1", () => {
    const result = validateLlmsTxt("## Docs\n- [A](https://a.com)");
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("H1"))).toBe(true);
  });

  it("flags malformed list items and duplicate links", () => {
    const result = validateLlmsTxt("# T\n\n## S\n\n- not a link\n- [A](https://a.com)\n- [B](https://a.com)");
    expect(result.issues.some((issue) => issue.level === "error")).toBe(true);
    expect(result.issues.some((issue) => issue.message.startsWith("Duplicate"))).toBe(true);
  });

  it("tolerates a byte order mark", () => {
    expect(validateLlmsTxt("\uFEFF# Title\n\n> Summary").valid).toBe(true);
  });
});
