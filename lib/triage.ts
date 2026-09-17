import { DOMAINS, type CaptureKind, type Domain, type ThoughtKind } from "./types";

export type TriagePayload = {
  kind: CaptureKind;
  body?: string;
  name?: string;
  domain?: string;
  outcome?: string;
  nextAction?: string;
  projectId?: string | null;
};

export type QueuedTriage = TriagePayload & {
  id: string;
  receivedAt: string;
};

const globalQueue = globalThis as typeof globalThis & {
  __focusOsTriageQueue?: QueuedTriage[];
};

function queue(): QueuedTriage[] {
  if (!globalQueue.__focusOsTriageQueue) {
    globalQueue.__focusOsTriageQueue = [];
  }
  return globalQueue.__focusOsTriageQueue;
}

export function resetTriageQueue(): void {
  globalQueue.__focusOsTriageQueue = [];
}

export function enqueueTriage(payload: TriagePayload): QueuedTriage {
  const prefix = payload.kind === "project" ? "proj" : "thought";
  const item: QueuedTriage = {
    ...payload,
    id: `${prefix}-${crypto.randomUUID()}`,
    receivedAt: new Date().toISOString(),
  };
  queue().push(item);
  return item;
}

export function drainTriage(): QueuedTriage[] {
  const items = [...queue()];
  globalQueue.__focusOsTriageQueue = [];
  return items;
}

export function coerceDomain(value: string | undefined): Domain {
  if (value && (DOMAINS as readonly string[]).includes(value)) {
    return value as Domain;
  }
  return "Work";
}

export function coerceThoughtKind(value: string | undefined): ThoughtKind {
  return value === "todo" ? "todo" : "idea";
}

export function parseTriagePayload(input: unknown): TriagePayload | { error: string } {
  if (!input || typeof input !== "object") {
    return { error: "Expected a JSON object." };
  }
  const raw = input as Record<string, unknown>;
  const kind = raw.kind;
  if (kind !== "idea" && kind !== "todo" && kind !== "project") {
    return { error: "kind must be idea, todo, or project." };
  }

  const payload: TriagePayload = { kind };

  if (typeof raw.body === "string") payload.body = raw.body;
  if (typeof raw.name === "string") payload.name = raw.name;
  if (typeof raw.domain === "string") payload.domain = raw.domain;
  if (typeof raw.outcome === "string") payload.outcome = raw.outcome;
  if (typeof raw.nextAction === "string") payload.nextAction = raw.nextAction;
  if (raw.projectId === null) payload.projectId = null;
  if (typeof raw.projectId === "string") payload.projectId = raw.projectId;

  if (kind === "project") {
    if (!payload.name?.trim()) {
      return { error: "Projects need a name." };
    }
  } else if (!payload.body?.trim()) {
    return { error: "Ideas and todos need a body." };
  }

  return payload;
}

export function secretFromRequest(request: Request): string | null {
  const header = request.headers.get("x-triage-secret")?.trim();
  if (header) return header;
  const auth = request.headers.get("authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}

export function secretsMatch(provided: string | null, expected: string): boolean {
  if (!provided || !expected) return false;
  return provided === expected;
}

export function isSelfTriageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/\/$/, "") === "/api/triage";
  } catch {
    return false;
  }
}

export async function forwardTriage(
  payload: TriagePayload,
  url: string,
  secret: string,
): Promise<boolean> {
  if (isSelfTriageUrl(url)) return false;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-triage-secret": secret } : {}),
    },
    body: JSON.stringify(payload),
  });
  return response.ok;
}

export async function notifyLocalCapture(payload: TriagePayload): Promise<void> {
  try {
    await fetch("/api/triage", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-triage-source": "local",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Optional fan-out. Local IndexedDB already has the capture.
  }
}
