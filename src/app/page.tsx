import { Generator } from "@/components/generator";

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="mx-auto max-w-3xl space-y-4 text-center">
        <p className="eyebrow">llms.txt generator</p>
        <h1 className="text-4xl font-medium leading-[1.05] tracking-[-0.03em] sm:text-6xl">
          Make your site
          <br />
          legible to AI agents
        </h1>
        <p className="mx-auto max-w-xl text-[15px] leading-relaxed text-[var(--muted)]">
          Paste in a URL. We&rsquo;ll read the site, work out which pages matter, and write you a{" "}
          <a
            className="text-white underline decoration-[#4b4b4b] underline-offset-4 hover:decoration-white"
            href="https://llmstxt.org/"
            target="_blank"
            rel="noreferrer"
          >
            spec-compliant
          </a>{" "}
          llms.txt. Track the site and we&rsquo;ll keep it current.
        </p>
      </section>
      <Generator />
    </div>
  );
}
