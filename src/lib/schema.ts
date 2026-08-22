import { z } from "zod";
import { DEFAULT_CRAWL_OPTIONS } from "./types";
import { ensureUrl } from "./url";

export const crawlOptionsSchema = z.object({
  maxPages: z.number().int().min(1).max(500).default(DEFAULT_CRAWL_OPTIONS.maxPages),
  maxDepth: z.number().int().min(1).max(6).default(DEFAULT_CRAWL_OPTIONS.maxDepth),
  scopeToPath: z.boolean().default(DEFAULT_CRAWL_OPTIONS.scopeToPath),
  respectRobots: z.boolean().default(DEFAULT_CRAWL_OPTIONS.respectRobots),
  includeFullText: z.boolean().default(DEFAULT_CRAWL_OPTIONS.includeFullText),
  useLlm: z.boolean().default(DEFAULT_CRAWL_OPTIONS.useLlm),
});

export const generateRequestSchema = z.object({
  url: z
    .string()
    .min(3)
    .transform((value, context) => {
      try {
        return ensureUrl(value);
      } catch {
        context.addIssue({ code: "custom", message: "Enter a valid URL" });
        return z.NEVER;
      }
    }),
  options: crawlOptionsSchema.partial().optional(),
  monitor: z.boolean().optional(),
});

export function resolveOptions(partial?: Partial<z.infer<typeof crawlOptionsSchema>>) {
  return crawlOptionsSchema.parse({ ...DEFAULT_CRAWL_OPTIONS, ...(partial ?? {}) });
}
