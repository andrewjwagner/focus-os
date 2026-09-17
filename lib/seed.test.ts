import { describe, expect, it } from "vitest";
import { focusedProjects } from "./focus";
import { inboxThoughts, seedLanes, seedProjects, seedThoughts } from "./seed";

const PRIVATE_MARKERS = [
  "Bread",
  "Pocket PM",
  "Pocket PM Coach",
  "Wilson",
  "HYROX",
  "deal-one",
  "wagner",
  "andrew.wagner",
];

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

  it("includes inbox captures with kind and domain, plus one attached note", () => {
    expect(inboxThoughts(seedThoughts).length).toBeGreaterThanOrEqual(2);
    expect(
      seedThoughts.every((thought) => thought.kind && thought.domain),
    ).toBe(true);
    expect(seedThoughts.some((thought) => thought.kind === "idea")).toBe(true);
    expect(seedThoughts.some((thought) => thought.kind === "todo")).toBe(true);
    expect(seedThoughts.some((thought) => thought.projectId !== null)).toBe(
      true,
    );
    expect(seedLanes.length).toBeGreaterThan(0);
  });

  it("stays free of private Andrew-specific copy", () => {
    const blob = JSON.stringify({
      seedProjects,
      seedLanes,
      seedThoughts,
    }).toLowerCase();
    for (const marker of PRIVATE_MARKERS) {
      expect(blob.includes(marker.toLowerCase())).toBe(false);
    }
  });
});
