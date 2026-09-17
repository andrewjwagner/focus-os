import { describe, expect, it, vi } from "vitest";
import { seedProjects, seedThoughts } from "./seed";
import {
  TRIAGE_WEBHOOK_AUTH_DOC,
  TRIAGE_WEBHOOK_AUTH_HEADER,
  TRIAGE_WEBHOOK_AUTH_SCHEME,
  forwardTriageCapture,
  parseTriagePayload,
  payloadFromProject,
  payloadFromThought,
  projectCaptureBody,
  triageForwardConfig,
} from "./triage";

const thought = seedThoughts[0];
const project = seedProjects[0];

describe("triage payload", () => {
  it("builds a stable idea payload", () => {
    const payload = payloadFromThought(thought);
    expect(payload).toEqual({
      source: "focus-os",
      version: 1,
      kind: "idea",
      id: thought.id,
      body: thought.body,
      domain: thought.domain,
      projectId: null,
      createdAt: thought.createdAt,
      capturedAt: thought.createdAt,
    });
    expect(parseTriagePayload(payload)).toEqual(payload);
  });

  it("builds a project payload with name and joined body", () => {
    const payload = payloadFromProject(project);
    expect(payload.kind).toBe("project");
    expect(payload.name).toBe(project.name);
    expect(payload.projectId).toBeNull();
    expect(payload.body).toBe(
      projectCaptureBody(project.outcome, project.nextAction),
    );
    expect(payload.body).toContain(project.outcome);
    expect(parseTriagePayload(payload)?.name).toBe(project.name);
  });

  it("rejects a payload with a bad domain or kind", () => {
    const base = payloadFromThought(thought);
    expect(parseTriagePayload({ ...base, domain: "Nope" })).toBeNull();
    expect(parseTriagePayload({ ...base, kind: "thought" })).toBeNull();
    expect(parseTriagePayload({ ...base, source: "other" })).toBeNull();
  });
});

describe("triage webhook forwarding", () => {
  it("skips when URL or secret is unset", () => {
    expect(triageForwardConfig({})).toEqual({ enabled: false });
    expect(
      triageForwardConfig({ TRIAGE_WEBHOOK_URL: "https://example.test" }),
    ).toEqual({ enabled: false });
    expect(
      triageForwardConfig({ TRIAGE_WEBHOOK_SECRET: "crsr_test" }),
    ).toEqual({ enabled: false });
  });

  it("POSTs with Bearer auth and soft-fails transport errors", async () => {
    expect(TRIAGE_WEBHOOK_AUTH_DOC).toBe(
      `${TRIAGE_WEBHOOK_AUTH_HEADER}: ${TRIAGE_WEBHOOK_AUTH_SCHEME} <TRIAGE_WEBHOOK_SECRET>`,
    );
    const payload = payloadFromThought(thought);
    const post = vi.fn().mockResolvedValue({ ok: true });
    const ok = await forwardTriageCapture(
      payload,
      {
        TRIAGE_WEBHOOK_URL: "https://example.test/hook",
        TRIAGE_WEBHOOK_SECRET: "crsr_test",
      },
      post as unknown as typeof fetch,
    );
    expect(ok).toEqual({ forwarded: true });
    expect(post).toHaveBeenCalledWith("https://example.test/hook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer crsr_test",
      },
      body: JSON.stringify(payload),
    });

    const boom = vi.fn().mockRejectedValue(new Error("offline"));
    const skipped = await forwardTriageCapture(
      payload,
      {
        TRIAGE_WEBHOOK_URL: "https://example.test/hook",
        TRIAGE_WEBHOOK_SECRET: "crsr_test",
      },
      boom as unknown as typeof fetch,
    );
    expect(skipped).toEqual({ forwarded: false });

    const quiet = await forwardTriageCapture(payload, {}, post as unknown as typeof fetch);
    expect(quiet).toEqual({ forwarded: false });
    expect(post).toHaveBeenCalledTimes(1);
  });
});
