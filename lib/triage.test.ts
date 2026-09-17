import { afterEach, describe, expect, it } from "vitest";
import {
  coerceDomain,
  drainTriage,
  enqueueTriage,
  isSelfTriageUrl,
  parseTriagePayload,
  resetTriageQueue,
  secretFromRequest,
  secretsMatch,
} from "./triage";

describe("triage payload", () => {
  it("accepts ideas, todos, and named projects", () => {
    expect(parseTriagePayload({ kind: "idea", body: "Ship it" })).toEqual({
      kind: "idea",
      body: "Ship it",
    });
    expect(parseTriagePayload({ kind: "todo", body: "Call Alex" })).toEqual({
      kind: "todo",
      body: "Call Alex",
    });
    expect(
      parseTriagePayload({
        kind: "project",
        name: "Demo",
        domain: "Work",
      }),
    ).toMatchObject({ kind: "project", name: "Demo", domain: "Work" });
  });

  it("rejects missing fields", () => {
    expect(parseTriagePayload({ kind: "idea" })).toEqual({
      error: "Ideas and todos need a body.",
    });
    expect(parseTriagePayload({ kind: "project" })).toEqual({
      error: "Projects need a name.",
    });
    expect(parseTriagePayload({})).toEqual({
      error: "kind must be idea, todo, or project.",
    });
  });

  it("coerces unknown domains to Work", () => {
    expect(coerceDomain("Home")).toBe("Home");
    expect(coerceDomain("Work/Bread")).toBe("Work");
    expect(coerceDomain(undefined)).toBe("Work");
  });
});

describe("triage auth helpers", () => {
  it("reads x-triage-secret or Bearer token", () => {
    const headerReq = new Request("http://localhost/api/triage", {
      headers: { "x-triage-secret": "abc" },
    });
    expect(secretFromRequest(headerReq)).toBe("abc");
    const bearerReq = new Request("http://localhost/api/triage", {
      headers: { authorization: "Bearer xyz" },
    });
    expect(secretFromRequest(bearerReq)).toBe("xyz");
    expect(secretsMatch("abc", "abc")).toBe(true);
    expect(secretsMatch("abc", "nope")).toBe(false);
    expect(secretsMatch(null, "abc")).toBe(false);
  });

  it("treats this app's /api/triage as a self URL", () => {
    expect(isSelfTriageUrl("http://localhost:3000/api/triage")).toBe(true);
    expect(isSelfTriageUrl("https://example.com/hooks/focus")).toBe(false);
    expect(isSelfTriageUrl("not a url")).toBe(false);
  });
});

describe("triage queue", () => {
  afterEach(() => {
    resetTriageQueue();
  });

  it("enqueues and drains items", () => {
    enqueueTriage({ kind: "idea", body: "One" });
    enqueueTriage({ kind: "todo", body: "Two" });
    const items = drainTriage();
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.body)).toEqual(["One", "Two"]);
    expect(drainTriage()).toEqual([]);
  });
});
