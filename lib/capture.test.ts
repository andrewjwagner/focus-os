import { describe, expect, it } from "vitest";
import { validateCapture } from "./capture";

describe("validateCapture", () => {
  it("requires body and domain for idea and todo", () => {
    expect(
      validateCapture({
        kind: "idea",
        body: "",
        domain: "Ideas",
        projectId: null,
      }),
    ).toEqual({ ok: false, reason: "body" });
    expect(
      validateCapture({
        kind: "todo",
        body: "Call school",
        domain: "",
        projectId: null,
      }),
    ).toEqual({ ok: false, reason: "domain" });
    expect(
      validateCapture({
        kind: "todo",
        body: "Call school",
        domain: "Family/home",
        projectId: null,
      }),
    ).toEqual({ ok: true });
  });

  it("requires a name and domain for project", () => {
    expect(
      validateCapture({
        kind: "project",
        name: "",
        domain: "Ideas",
        outcome: "",
        nextAction: "",
        status: "active",
      }),
    ).toEqual({ ok: false, reason: "name" });
    expect(
      validateCapture({
        kind: "project",
        name: "Bread onboarding",
        domain: "Work/Bread",
        outcome: "Land cleanly",
        nextAction: "Map 30 days",
        status: "active",
      }),
    ).toEqual({ ok: true });
  });
});
