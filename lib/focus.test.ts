import { describe, expect, it } from "vitest";
import {
  applyFocus,
  applyReplaceFocus,
  applyStatus,
  canAddToFocus,
  focusedProjects,
} from "./focus";
import { seedProjects } from "./seed";
import { MAX_FOCUS } from "./types";

describe("focus cap", () => {
  it("seeds exactly three focus-next projects", () => {
    expect(focusedProjects(seedProjects)).toHaveLength(MAX_FOCUS);
  });

  it("allows no fourth focus item until one is demoted", () => {
    const extra = seedProjects.find((project) => !project.focusNext)!;
    expect(canAddToFocus(seedProjects, extra.id)).toBe(false);
    const blocked = applyFocus(seedProjects, extra.id);
    expect(blocked.result.ok).toBe(false);
    if (blocked.result.ok) throw new Error("expected cap");
    expect(blocked.result.focused).toHaveLength(3);
  });

  it("replaces a focus slot without growing past three", () => {
    const focused = focusedProjects(seedProjects);
    const extra = seedProjects.find((project) => !project.focusNext)!;
    const next = applyReplaceFocus(seedProjects, focused[0].id, extra.id);
    const after = focusedProjects(next);
    expect(after).toHaveLength(3);
    expect(after.some((project) => project.id === extra.id)).toBe(true);
    expect(after.some((project) => project.id === focused[0].id)).toBe(false);
  });

  it("clears focus when a project is tabled or done", () => {
    const focused = focusedProjects(seedProjects)[0];
    const tabled = applyStatus(seedProjects, focused.id, "tabled");
    expect(tabled.find((project) => project.id === focused.id)?.focusNext).toBe(
      false,
    );
    const done = applyStatus(seedProjects, focused.id, "done");
    expect(done.find((project) => project.id === focused.id)?.status).toBe(
      "done",
    );
    expect(done.find((project) => project.id === focused.id)?.focusNext).toBe(
      false,
    );
  });
});
