import type { ActionItem, Person } from "./types";

export function roleLabel(role: Person["role"]): string {
  return role === "manager" ? "Manager" : "Direct report";
}

export function openItemsFor(items: ActionItem[], personId: string): ActionItem[] {
  return items
    .filter((item) => item.personId === personId && !item.done)
    .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
}

export function shortDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: iso.length === 10 ? "UTC" : "America/New_York",
  }).format(date);
}

export function isOverdue(due: string | null, today: string): boolean {
  return Boolean(due && due < today);
}

export function todayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
}
