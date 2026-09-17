"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

const LINKS = [
  { href: "/", label: "Today" },
  { href: "/capture", label: "Capture" },
  { href: "/tabled", label: "Tabled" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const auth = useAuth();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line/80 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-3">
          <Link href="/" className="font-display text-xl tracking-tight text-ink">
            Focus OS
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {LINKS.map((link) => {
              const active =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-full px-3 py-1.5 ${
                    active
                      ? "bg-card text-ink"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-8">{children}</main>
      <footer className="mx-auto max-w-3xl px-5 pb-10 text-xs text-muted">
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <span>
            {auth.session?.email} · {auth.session?.source === "firebase" ? "Firebase" : "Local browser"}
          </span>
          <button
            type="button"
            onClick={() => void auth.signOut()}
            className="text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Sign out
          </button>
        </div>
      </footer>
    </div>
  );
}
