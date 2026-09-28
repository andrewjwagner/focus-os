"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTeam } from "@/lib/team/context";

const LINKS = [
  { href: "/team", label: "People" },
  { href: "/team/digest", label: "Weekly digest" },
  { href: "/team/settings", label: "Settings" },
];

export function TeamNav() {
  const pathname = usePathname();
  const team = useTeam();
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`rounded-full border px-3 py-1 ${
            pathname === link.href
              ? "border-focus/60 text-ink"
              : "border-line text-muted hover:text-ink"
          }`}
        >
          {link.label}
          {link.href === "/team/digest" && team.digestHighlighted ? (
            <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-focus align-middle" />
          ) : null}
        </Link>
      ))}
      <button
        type="button"
        onClick={team.lock}
        className="ml-auto rounded-full border border-line px-3 py-1 text-muted hover:text-ink"
      >
        Lock
      </button>
    </div>
  );
}
