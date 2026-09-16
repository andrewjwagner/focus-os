import { isDomain } from "./thought";
import type { Domain, Project, Thought, TriageKind } from "./types";
import { TRIAGE_KINDS } from "./types";

export const TRIAGE_PAYLOAD_SOURCE = "focus-os" as const;
export const TRIAGE_PAYLOAD_VERSION = 1 as const;

/** Header the server sends to TRIAGE_WEBHOOK_URL. Grok Bot routines expect Bearer. */
export const TRIAGE_WEBHOOK_AUTH_HEADER = "Authorization";
export const TRIAGE_WEBHOOK_AUTH_SCHEME = "Bearer";
export const TRIAGE_WEBHOOK_AUTH_DOC =
  "Authorization: Bearer <TRIAGE_WEBHOOK_SECRET>";

export type TriagePayload = {
  source: typeof TRIAGE_PAYLOAD_SOURCE;
  version: typeof TRIAGE_PAYLOAD_VERSION;
  kind: TriageKind;
  id: string;
  body: string;
  domain: Domain;
  projectId: string | null;
  name?: string;
  createdAt: string;
  capturedAt: string;
};

export function projectCaptureBody(outcome: string, nextAction: string): string {
  return [outcome.trim(), nextAction.trim()].filter(Boolean).join("\n");
}

export function payloadFromThought(
  thought: Thought,
  capturedAt = thought.createdAt,
): TriagePayload {
  return {
    source: TRIAGE_PAYLOAD_SOURCE,
    version: TRIAGE_PAYLOAD_VERSION,
    kind: thought.kind,
    id: thought.id,
    body: thought.body,
    domain: thought.domain,
    projectId: thought.projectId,
    createdAt: thought.createdAt,
    capturedAt,
  };
}

export function payloadFromProject(
  project: Project,
  capturedAt = project.createdAt,
): TriagePayload {
  return {
    source: TRIAGE_PAYLOAD_SOURCE,
    version: TRIAGE_PAYLOAD_VERSION,
    kind: "project",
    id: project.id,
    body: projectCaptureBody(project.outcome, project.nextAction),
    domain: project.domain,
    projectId: null,
    name: project.name,
    createdAt: project.createdAt,
    capturedAt,
  };
}

export function isTriageKind(value: unknown): value is TriageKind {
  return typeof value === "string" && (TRIAGE_KINDS as readonly string[]).includes(value);
}

export function parseTriagePayload(raw: unknown): TriagePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (rec.source !== TRIAGE_PAYLOAD_SOURCE) return null;
  if (rec.version !== TRIAGE_PAYLOAD_VERSION) return null;
  if (!isTriageKind(rec.kind)) return null;
  if (typeof rec.id !== "string" || !rec.id) return null;
  if (typeof rec.body !== "string") return null;
  if (!isDomain(rec.domain)) return null;
  if (rec.projectId !== null && typeof rec.projectId !== "string") return null;
  if (typeof rec.createdAt !== "string" || !rec.createdAt) return null;
  if (typeof rec.capturedAt !== "string" || !rec.capturedAt) return null;
  if (rec.name !== undefined && typeof rec.name !== "string") return null;

  const payload: TriagePayload = {
    source: TRIAGE_PAYLOAD_SOURCE,
    version: TRIAGE_PAYLOAD_VERSION,
    kind: rec.kind,
    id: rec.id,
    body: rec.body,
    domain: rec.domain,
    projectId: rec.projectId,
    createdAt: rec.createdAt,
    capturedAt: rec.capturedAt,
  };
  if (typeof rec.name === "string") payload.name = rec.name;
  return payload;
}

export function triageForwardConfig(env: {
  TRIAGE_WEBHOOK_URL?: string;
  TRIAGE_WEBHOOK_SECRET?: string;
} | NodeJS.ProcessEnv): { enabled: false } | { enabled: true; url: string; secret: string } {
  const url = env.TRIAGE_WEBHOOK_URL?.trim() ?? "";
  const secret = env.TRIAGE_WEBHOOK_SECRET?.trim() ?? "";
  if (!url || !secret) return { enabled: false };
  return { enabled: true, url, secret };
}

export async function forwardTriageCapture(
  payload: TriagePayload,
  env: {
    TRIAGE_WEBHOOK_URL?: string;
    TRIAGE_WEBHOOK_SECRET?: string;
  } | NodeJS.ProcessEnv,
  post: typeof fetch,
): Promise<{ forwarded: boolean }> {
  const cfg = triageForwardConfig(env);
  if (!cfg.enabled) return { forwarded: false };
  try {
    const response = await post(cfg.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [TRIAGE_WEBHOOK_AUTH_HEADER]: `${TRIAGE_WEBHOOK_AUTH_SCHEME} ${cfg.secret}`,
      },
      body: JSON.stringify(payload),
    });
    return { forwarded: response.ok };
  } catch {
    return { forwarded: false };
  }
}
