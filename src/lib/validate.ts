import type { LlmsDocument, LlmsLink, LlmsSection } from "./types";

export interface ValidationIssue {
  level: "error" | "warning";
  line?: number;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  document: LlmsDocument | null;
}

const LINK_PATTERN = /^-\s+\[([^\]]+)\]\(([^)\s]+)\)\s*(?::\s*(.*))?$/;

/**
 * Parses llms.txt and checks it against the structure required by
 * https://llmstxt.org: an H1, an optional blockquote summary, optional
 * non-heading detail blocks, then H2 sections containing link lists.
 */
export function validateLlmsTxt(source: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  const text = source.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);

  let title = "";
  const summaryParts: string[] = [];
  const details: string[] = [];
  const sections: LlmsSection[] = [];
  let current: LlmsSection | null = null;
  let sawTitle = false;
  const seenUrls = new Set<string>();

  lines.forEach((raw, index) => {
    const line = raw.trim();
    const lineNumber = index + 1;
    if (!line) return;

    if (line.startsWith("# ")) {
      if (sawTitle) {
        issues.push({ level: "error", line: lineNumber, message: "Only one H1 title is allowed" });
        return;
      }
      title = line.slice(2).trim();
      sawTitle = true;
      return;
    }
    if (!sawTitle) {
      issues.push({ level: "error", line: lineNumber, message: "Content appears before the H1 title" });
      return;
    }
    if (line.startsWith("## ")) {
      const name = line.slice(3).trim();
      if (!name) issues.push({ level: "error", line: lineNumber, message: "Empty section heading" });
      current = { name, links: [] };
      sections.push(current);
      return;
    }
    if (/^#{3,}\s/.test(line)) {
      issues.push({
        level: "warning",
        line: lineNumber,
        message: "Headings deeper than H2 are not part of the format",
      });
      return;
    }
    if (line.startsWith(">")) {
      if (sections.length > 0 || details.length > 0) {
        issues.push({
          level: "warning",
          line: lineNumber,
          message: "The blockquote summary should directly follow the title",
        });
      }
      summaryParts.push(line.replace(/^>\s?/, "").trim());
      return;
    }
    if (current) {
      const match = LINK_PATTERN.exec(line);
      if (!match) {
        issues.push({
          level: line.startsWith("-") ? "error" : "warning",
          line: lineNumber,
          message: line.startsWith("-")
            ? "List item must look like `- [title](url): optional notes`"
            : "Free text inside a section is ignored by parsers",
        });
        return;
      }
      const [, linkTitle, url, notes] = match;
      const link: LlmsLink = { title: linkTitle.trim(), url: url.trim(), notes: notes?.trim() || undefined };
      if (seenUrls.has(link.url)) {
        issues.push({ level: "warning", line: lineNumber, message: `Duplicate link: ${link.url}` });
      }
      seenUrls.add(link.url);
      if (!/^https?:\/\//i.test(link.url) && !link.url.startsWith("/")) {
        issues.push({ level: "warning", line: lineNumber, message: `Link should be absolute: ${link.url}` });
      }
      current.links.push(link);
      return;
    }
    details.push(line);
  });

  if (!sawTitle) {
    issues.push({ level: "error", message: "Missing required H1 title" });
  }
  if (summaryParts.length === 0) {
    issues.push({ level: "warning", message: "No blockquote summary; agents rely on it for context" });
  }
  if (sections.every((section) => section.links.length === 0)) {
    issues.push({ level: "warning", message: "No link sections found" });
  }

  return {
    valid: issues.every((issue) => issue.level !== "error"),
    issues,
    document: sawTitle
      ? { title, summary: summaryParts.join(" ") || undefined, details, sections }
      : null,
  };
}
