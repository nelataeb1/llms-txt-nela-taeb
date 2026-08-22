import { SiteDetail } from "@/components/site-detail";

export const dynamic = "force-dynamic";

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SiteDetail siteId={id} />;
}
