import { describe, expect, it } from "vitest";
import { inboxThoughts, seedLanes, seedProjects, seedThoughts } from "./seed";
import { DOMAINS } from "./types";
import { focusedProjects } from "./focus";

const PRIVATE_LIFE = /Bread|Pocket PM|Wilson|HYROX|deal-one|Macy|andrew\.wagner|Wyomissing|Idea Guy|Head of Growth/i;

describe("seed data", () => {
  it("has 8 to 12 projects with mixed statuses", () => {
    expect(seedProjects.length).toBeGreaterThanOrEqual(8);
    expect(seedProjects.length).toBeLessThanOrEqual(12);
    expect(seedProjects.some((project) => project.status === "active")).toBe(
      true,
    );
    expect(seedProjects.some((project) => project.status === "tabled")).toBe(
      true,
    );
    expect(focusedProjects(seedProjects).length).toBeGreaterThanOrEqual(2);
    expect(focusedProjects(seedProjects).length).toBeLessThanOrEqual(3);
  });

  it("includes inbox thoughts and at least one attached note", () => {
    expect(inboxThoughts(seedThoughts).length).toBeGreaterThanOrEqual(2);
    expect(seedThoughts.some((thought) => thought.projectId !== null)).toBe(
      true,
    );
    expect(seedLanes.length).toBeGreaterThan(0);
  });

  it("uses generic demo copy, not private life details", () => {
    const blob = JSON.stringify({ seedProjects, seedLanes, seedThoughts, DOMAINS });
    expect(blob).not.toMatch(PRIVATE_LIFE);
    expect(DOMAINS).toContain("Work");
    expect(DOMAINS).not.toContain("Work/Bread");
  });
});
