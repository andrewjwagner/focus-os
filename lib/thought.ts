import { CAPTURE_ITEM_KINDS, DOMAINS, type CaptureItemKind, type Domain, type Thought } from "./types";

export function isDomain(value: unknown): value is Domain {
  return typeof value === "string" && (DOMAINS as readonly string[]).includes(value);
}

export function isCaptureItemKind(value: unknown): value is CaptureItemKind {
  return typeof value === "string" && (CAPTURE_ITEM_KINDS as readonly string[]).includes(value);
}

export function thoughtNeedsMigration(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return true;
  const rec = raw as Record<string, unknown>;
  return !isCaptureItemKind(rec.kind) || !isDomain(rec.domain);
}

export function normalizeThought(
  raw: unknown,
  projectDomainById: Record<string, Domain> = {},
): Thought | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== "string" || !rec.id) return null;
  if (typeof rec.body !== "string") return null;

  const projectId = typeof rec.projectId === "string" ? rec.projectId : null;
  const kind: CaptureItemKind = rec.kind === "todo" ? "todo" : "idea";
  let domain: Domain = "Ideas";
  if (isDomain(rec.domain)) {
    domain = rec.domain;
  } else if (projectId && isDomain(projectDomainById[projectId])) {
    domain = projectDomainById[projectId];
  }

  const createdAt =
    typeof rec.createdAt === "string" && rec.createdAt
      ? rec.createdAt
      : "2026-09-16T12:00:00.000Z";

  return {
    id: rec.id,
    kind,
    body: rec.body,
    domain,
    projectId,
    createdAt,
  };
}

export function projectDomainMap(
  projects: { id: string; domain: Domain }[],
): Record<string, Domain> {
  return Object.fromEntries(projects.map((project) => [project.id, project.domain]));
}

export function captureKindLabel(kind: CaptureItemKind): string {
  return kind === "todo" ? "Todo" : "Idea";
}
