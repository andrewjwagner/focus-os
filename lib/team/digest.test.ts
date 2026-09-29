import { describe, expect, it } from "vitest";
import { shouldHighlightDigest } from "./digest";

// 2026-09-27 is a Sunday. ET is UTC-4 in September.
describe("weekly digest highlight", () => {
  it("is off on Sunday before 5pm ET when viewed last week", () => {
    const now = new Date("2026-09-27T20:59:00Z"); // 4:59pm ET
    expect(shouldHighlightDigest(now, "2026-09-21T12:00:00Z")).toBe(false);
  });

  it("turns on Sunday at 5pm ET", () => {
    const now = new Date("2026-09-27T21:00:00Z"); // 5:00pm ET
    expect(shouldHighlightDigest(now, "2026-09-21T12:00:00Z")).toBe(true);
  });

  it("stays on through the week until viewed", () => {
    const now = new Date("2026-09-30T14:00:00Z"); // Wednesday
    expect(shouldHighlightDigest(now, "2026-09-27T20:00:00Z")).toBe(true);
    expect(shouldHighlightDigest(now, "2026-09-27T21:30:00Z")).toBe(false);
  });

  it("highlights when never viewed", () => {
    expect(shouldHighlightDigest(new Date("2026-09-29T12:00:00Z"), null)).toBe(true);
  });

  it("handles winter time (UTC-5)", () => {
    // 2026-12-06 is a Sunday. 5pm EST is 22:00Z.
    const viewed = "2026-11-30T12:00:00Z";
    expect(shouldHighlightDigest(new Date("2026-12-06T21:59:00Z"), viewed)).toBe(false);
    expect(shouldHighlightDigest(new Date("2026-12-06T22:00:00Z"), viewed)).toBe(true);
  });
});
