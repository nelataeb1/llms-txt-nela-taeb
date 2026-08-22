import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "llms.txt generator",
  description:
    "Crawl any website and generate a spec-compliant llms.txt file, then keep it up to date automatically.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}>
        <header className="border-b border-[var(--border)]">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
              llms.txt generator
            </Link>
            <nav className="flex items-center gap-5 text-sm text-[var(--muted)]">
              <Link href="/" className="hover:text-[var(--foreground)]">Generate</Link>
              <Link href="/sites" className="hover:text-[var(--foreground)]">Monitored sites</Link>
              <a
                href="https://llmstxt.org/"
                target="_blank"
                rel="noreferrer"
                className="hover:text-[var(--foreground)]"
              >
                Spec
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
        <footer className="mx-auto max-w-5xl px-6 pb-10 text-xs text-[var(--muted)]">
          Crawls respect robots.txt and identify as llms-txt-generator.
        </footer>
      </body>
    </html>
  );
}
