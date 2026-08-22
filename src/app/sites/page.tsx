import { SitesList } from "@/components/sites-list";

export const dynamic = "force-dynamic";

export default function SitesPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Monitored sites</h1>
        <p className="text-[var(--muted)]">
          Tracked sites are re-crawled daily. Each site keeps a snapshot history and serves its latest
          file at a stable URL you can proxy from <code className="font-mono">/llms.txt</code>.
        </p>
      </div>
      <SitesList />
    </div>
  );
}
