import type { Job, JobHeartbeat, JobSummary, Site, Snapshot, Store } from "./types";

interface MemoryData {
  jobs: Map<string, Job>;
  heartbeats: Map<string, JobHeartbeat>;
  sites: Map<string, Site>;
  snapshots: Map<string, Snapshot[]>;
}

// Survives hot reloads in development; a single process only.
const globalData = globalThis as unknown as { __llmsTxtStore?: MemoryData };
const data: MemoryData = (globalData.__llmsTxtStore ??= {
  jobs: new Map(),
  heartbeats: new Map(),
  sites: new Map(),
  snapshots: new Map(),
});

/** Zero-config fallback used when DATABASE_URL is not configured. */
export class MemoryStore implements Store {
  async createJob(job: Job) {
    data.jobs.set(job.id, job);
    this.evictOldJobs();
  }

  async getJob(id: string) {
    return data.jobs.get(id) ?? null;
  }

  async updateJob(job: Job) {
    data.jobs.set(job.id, job);
  }

  async setJobHeartbeat(id: string, heartbeat: JobHeartbeat) {
    data.heartbeats.set(id, heartbeat);
  }

  async getJobSummary(id: string): Promise<JobSummary | null> {
    const job = data.jobs.get(id);
    if (!job) return null;
    return {
      id: job.id,
      status: job.status,
      target: job.options.maxPages,
      fetched: job.state.pages.length,
      queued: job.state.frontier.length,
      updatedAt: job.updatedAt,
      error: job.error,
      heartbeat: data.heartbeats.get(id) ?? null,
    };
  }

  async upsertSite(site: Site) {
    const existing = [...data.sites.values()].find((candidate) => candidate.url === site.url);
    const merged = existing ? { ...existing, ...site, id: existing.id } : site;
    data.sites.set(merged.id, merged);
    return merged;
  }

  async getSite(id: string) {
    return data.sites.get(id) ?? null;
  }

  async getSiteByUrl(url: string) {
    return [...data.sites.values()].find((site) => site.url === url) ?? null;
  }

  async listSites() {
    return [...data.sites.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async setSiteMonitoring(id: string, monitoring: boolean) {
    const site = data.sites.get(id);
    if (site) data.sites.set(id, { ...site, monitoring });
  }

  async markSiteChecked(id: string, at: string) {
    const site = data.sites.get(id);
    if (site) data.sites.set(id, { ...site, lastCheckedAt: at });
  }

  async deleteSite(id: string) {
    data.sites.delete(id);
    data.snapshots.delete(id);
  }

  async addSnapshot(snapshot: Snapshot) {
    const list = data.snapshots.get(snapshot.siteId) ?? [];
    list.unshift(snapshot);
    data.snapshots.set(snapshot.siteId, list.slice(0, 50));
  }

  async latestSnapshot(siteId: string) {
    return data.snapshots.get(siteId)?.[0] ?? null;
  }

  async listSnapshots(siteId: string, limit = 20) {
    return (data.snapshots.get(siteId) ?? []).slice(0, limit);
  }

  private evictOldJobs() {
    if (data.jobs.size <= 50) return;
    const oldest = [...data.jobs.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const job of oldest.slice(0, data.jobs.size - 50)) {
      data.jobs.delete(job.id);
      data.heartbeats.delete(job.id);
    }
  }
}
