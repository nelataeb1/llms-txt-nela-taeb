import type { CrawlState } from "../crawl";
import type { CrawlOptions, CrawledPage, GenerationResult } from "../types";

export type JobStatus = "running" | "done" | "error";

export interface Job {
  id: string;
  url: string;
  status: JobStatus;
  options: CrawlOptions;
  state: CrawlState;
  result: GenerationResult | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Site {
  id: string;
  url: string;
  name: string;
  options: CrawlOptions;
  monitoring: boolean;
  createdAt: string;
  lastCheckedAt: string | null;
}

export interface PageChange {
  type: "added" | "removed" | "changed";
  url: string;
  title: string;
  detail?: string;
}

export interface Snapshot {
  id: string;
  siteId: string;
  createdAt: string;
  llmsTxt: string;
  contentHash: string;
  pages: CrawledPage[];
  changes: PageChange[];
  /** True when this snapshot differs from the previous one. */
  changed: boolean;
}

export interface Store {
  createJob(job: Job): Promise<void>;
  getJob(id: string): Promise<Job | null>;
  updateJob(job: Job): Promise<void>;

  upsertSite(site: Site): Promise<Site>;
  getSite(id: string): Promise<Site | null>;
  getSiteByUrl(url: string): Promise<Site | null>;
  listSites(): Promise<Site[]>;
  setSiteMonitoring(id: string, monitoring: boolean): Promise<void>;
  markSiteChecked(id: string, at: string): Promise<void>;
  deleteSite(id: string): Promise<void>;

  addSnapshot(snapshot: Snapshot): Promise<void>;
  latestSnapshot(siteId: string): Promise<Snapshot | null>;
  listSnapshots(siteId: string, limit?: number): Promise<Snapshot[]>;
}
