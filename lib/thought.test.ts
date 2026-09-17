import { describe, expect, it } from "vitest";
import {
  normalizeThought,
  thoughtNeedsMigration,
  projectDomainMap,
} from "./thought";

describe("normalizeThought", () => {
  it("fills kind and domain on a legacy thought", () => {
    const thought = normalizeThought({
      id: "thought-legacy",
      body: "Park this.",
      projectId: null,
      createdAt: "2026-09-16T12:00:00.000Z",
    });
    expect(thought).toEqual({
      id: "thought-legacy",
      kind: "idea",
      body: "Park this.",
      domain: "Ideas",
      projectId: null,
      createdAt: "2026-09-16T12:00:00.000Z",
    });
    expect(
      thoughtNeedsMigration({
        id: "thought-legacy",
        body: "Park this.",
        projectId: null,
        createdAt: "2026-09-16T12:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("inherits domain from an attached project when missing", () => {
    const thought = normalizeThought(
      {
        id: "thought-note",
        body: "Batch drills.",
        projectId: "proj-daily-drill",
        createdAt: "2026-09-16T12:00:00.000Z",
      },
      { "proj-daily-drill": "Side project" },
    );
    expect(thought?.kind).toBe("idea");
    expect(thought?.domain).toBe("Side project");
  });

  it("keeps an already migrated idea or todo", () => {
    const raw = {
      id: "todo-1",
      kind: "todo",
      body: "Call the school.",
      domain: "Home",
      projectId: null,
      createdAt: "2026-09-16T12:00:00.000Z",
    };
    expect(thoughtNeedsMigration(raw)).toBe(false);
    expect(normalizeThought(raw)).toEqual(raw);
  });

  it("drops records without an id or body", () => {
    expect(normalizeThought({ body: "x" })).toBeNull();
    expect(normalizeThought({ id: "x" })).toBeNull();
  });

  it("builds a project domain map", () => {
    expect(
      projectDomainMap([{ id: "p1", domain: "Health" }]),
    ).toEqual({ p1: "Health" });
  });
});
