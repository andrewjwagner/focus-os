import type { Domain, Status } from "@/lib/types";

export const DOMAIN_TINT: Record<Domain, string> = {
  Work: "var(--tint-work)",
  "Side project": "var(--tint-side)",
  Home: "var(--tint-home)",
  Health: "var(--tint-health)",
  Finance: "var(--tint-finance)",
  Career: "var(--tint-career)",
  Ideas: "var(--tint-ideas)",
};

export function statusLabel(status: Status): string {
  if (status === "inspired") return "Inspired";
  if (status === "tabled") return "Tabled";
  if (status === "done") return "Done";
  return "Active";
}

export const fieldClass =
  "w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-focus";

export const btnClass =
  "inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors";
