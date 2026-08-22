import { neon } from "@neondatabase/serverless";
import type { Job, Site, Snapshot, Store } from "./types";

type Row = Record<string, unknown>;

const SCHEMA = [
  `create table if not exists jobs (
     id text primary key,
     url text not null,
     status text not null,
     options jsonb not null,
     state jsonb not null,
     result jsonb,
     error text,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   )`,
  `create table if not exists sites (
     id text primary key,
     url text not null unique,
     name text not null,
     options jsonb not null,
     monitoring boolean not null default true,
     created_at timestamptz not null default now(),
     last_checked_at timestamptz
   )`,
  `create table if not exists snapshots (
     id text primary key,
     site_id text not null references sites(id) on delete cascade,
     created_at timestamptz not null default now(),
     llms_txt text not null,
     content_hash text not null,
     pages jsonb not null,
     changes jsonb not null,
     changed boolean not null default false
   )`,
  `create index if not exists snapshots_site_created on snapshots (site_id, created_at desc)`,
];

/** Neon/Postgres backed store. The schema is created lazily on first use. */
export class PostgresStore implements Store {
  private readonly sql: ReturnType<typeof neon>;
  private ready: Promise<void> | null = null;

  constructor(connectionString: string) {
    this.sql = neon(connectionString);
  }

  private async init() {
    this.ready ??= (async () => {
      for (const statement of SCHEMA) await this.sql.query(statement);
    })();
    return this.ready;
  }

  private async query(text: string, params: unknown[] = []): Promise<Row[]> {
    await this.init();
    return (await this.sql.query(text, params)) as Row[];
  }

  async createJob(job: Job) {
    await this.query(
      `insert into jobs (id, url, status, options, state, result, error)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [job.id, job.url, job.status, job.options, job.state, job.result, job.error],
    );
  }

  async getJob(id: string) {
    const [row] = await this.query(`select * from jobs where id = $1`, [id]);
    return row ? toJob(row) : null;
  }

  async updateJob(job: Job) {
    await this.query(
      `update jobs set status = $2, state = $3, result = $4, error = $5, updated_at = now() where id = $1`,
      [job.id, job.status, job.state, job.result, job.error],
    );
  }

  async upsertSite(site: Site) {
    const [row] = await this.query(
      `insert into sites (id, url, name, options, monitoring)
       values ($1, $2, $3, $4, $5)
       on conflict (url) do update set name = excluded.name, options = excluded.options
       returning *`,
      [site.id, site.url, site.name, site.options, site.monitoring],
    );
    return toSite(row);
  }

  async getSite(id: string) {
    const [row] = await this.query(`select * from sites where id = $1`, [id]);
    return row ? toSite(row) : null;
  }

  async getSiteByUrl(url: string) {
    const [row] = await this.query(`select * from sites where url = $1`, [url]);
    return row ? toSite(row) : null;
  }

  async listSites() {
    const rows = await this.query(`select * from sites order by created_at desc`);
    return rows.map(toSite);
  }

  async setSiteMonitoring(id: string, monitoring: boolean) {
    await this.query(`update sites set monitoring = $2 where id = $1`, [id, monitoring]);
  }

  async markSiteChecked(id: string, at: string) {
    await this.query(`update sites set last_checked_at = $2 where id = $1`, [id, at]);
  }

  async deleteSite(id: string) {
    await this.query(`delete from sites where id = $1`, [id]);
  }

  async addSnapshot(snapshot: Snapshot) {
    await this.query(
      `insert into snapshots (id, site_id, llms_txt, content_hash, pages, changes, changed)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        snapshot.id,
        snapshot.siteId,
        snapshot.llmsTxt,
        snapshot.contentHash,
        JSON.stringify(snapshot.pages),
        JSON.stringify(snapshot.changes),
        snapshot.changed,
      ],
    );
  }

  async latestSnapshot(siteId: string) {
    const [row] = await this.query(
      `select * from snapshots where site_id = $1 order by created_at desc limit 1`,
      [siteId],
    );
    return row ? toSnapshot(row) : null;
  }

  async listSnapshots(siteId: string, limit = 20) {
    const rows = await this.query(
      `select * from snapshots where site_id = $1 order by created_at desc limit $2`,
      [siteId, limit],
    );
    return rows.map(toSnapshot);
  }
}

function toJob(row: Row): Job {
  return {
    id: String(row.id),
    url: String(row.url),
    status: row.status as Job["status"],
    options: row.options as Job["options"],
    state: row.state as Job["state"],
    result: (row.result ?? null) as Job["result"],
    error: (row.error ?? null) as string | null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toSite(row: Row): Site {
  return {
    id: String(row.id),
    url: String(row.url),
    name: String(row.name),
    options: row.options as Site["options"],
    monitoring: Boolean(row.monitoring),
    createdAt: toIso(row.created_at),
    lastCheckedAt: row.last_checked_at ? toIso(row.last_checked_at) : null,
  };
}

function toSnapshot(row: Row): Snapshot {
  return {
    id: String(row.id),
    siteId: String(row.site_id),
    createdAt: toIso(row.created_at),
    llmsTxt: String(row.llms_txt),
    contentHash: String(row.content_hash),
    pages: row.pages as Snapshot["pages"],
    changes: row.changes as Snapshot["changes"],
    changed: Boolean(row.changed),
  };
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
