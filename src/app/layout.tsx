import type { Metadata } from "next";
import Link from "next/link";
import { Inter, Geist_Mono } from "next/font/google";
import { ProfoundMark } from "@/components/profound-mark";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "llms.txt generator | Profound",
  description:
    "Crawl any website and generate a spec-compliant llms.txt file, then keep it up to date automatically.",
};

const NAV = [
  { href: "/", label: "Generate" },
  { href: "/sites", label: "Monitored sites" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${geistMono.variable} antialiased min-h-screen`}>
        <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-black/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
            <Link href="/" className="flex items-center gap-2.5">
              <ProfoundMark className="h-5 w-5 text-white" />
              <span className="text-[15px] font-medium tracking-tight">Profound</span>
              <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                llms.txt
              </span>
            </Link>
            <nav className="ml-auto flex items-center gap-1 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-full px-3 py-1.5 font-medium text-[var(--muted-dim)] transition-colors hover:bg-[#212121] hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
              <a
                href="https://llmstxt.org/"
                target="_blank"
                rel="noreferrer"
                className="ml-2 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-[#131313] transition-colors hover:bg-[#cdcdcd]"
              >
                Read the spec
              </a>
            </nav>
          </div>
        </header>
        <div className="mx-auto max-w-6xl rails min-h-[calc(100vh-3.5rem)]">
          <main className="px-6 py-12 sm:px-10">{children}</main>
          <footer className="border-t border-[var(--border)] px-6 py-6 text-xs text-[var(--muted-dim)] sm:px-10">
            Crawls respect robots.txt and identify as llms-txt-generator.
          </footer>
        </div>
      </body>
    </html>
  );
}
