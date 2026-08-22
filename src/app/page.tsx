import { Generator } from "@/components/generator";

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Generate an llms.txt for any website
        </h1>
        <p className="max-w-2xl text-[var(--muted)]">
          Point it at a URL. It reads sitemaps, crawls what is missing, ranks the pages an agent
          actually needs and writes a file that follows the{" "}
          <a className="underline" href="https://llmstxt.org/" target="_blank" rel="noreferrer">
            llmstxt.org
          </a>{" "}
          spec. Track the site and it re-crawls on a schedule and tells you what changed.
        </p>
      </section>
      <Generator />
    </div>
  );
}
