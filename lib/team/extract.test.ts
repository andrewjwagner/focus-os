import { describe, expect, it } from "vitest";
import {
  buildPrepBrief,
  extractActionItems,
  extractThemes,
  noteTopics,
  parseDue,
  parseOwner,
} from "./extract";
import type { Moment, TeamNote } from "./types";

function note(id: string, meetingAt: string, summaryMarkdown: string): TeamNote {
  return {
    id,
    personId: "p1",
    title: `Meeting ${id}`,
    createdAt: meetingAt,
    updatedAt: meetingAt,
    meetingAt,
    webUrl: "",
    summaryMarkdown,
    summaryText: "",
    transcript: null,
  };
}

// 2026-03-02 is a Monday.
const REF = new Date("2026-03-02T15:00:00Z");

describe("parseDue", () => {
  it("parses weekdays, dates, and shortcuts relative to the note", () => {
    expect(parseDue("send deck by Friday", REF)).toBe("2026-03-06");
    expect(parseDue("send deck by next Friday", REF)).toBe("2026-03-13");
    expect(parseDue("review due 2026-04-01", REF)).toBe("2026-04-01");
    expect(parseDue("ship by 3/9", REF)).toBe("2026-03-09");
    expect(parseDue("ship by Mar 20th", REF)).toBe("2026-03-20");
    expect(parseDue("wrap up by EOW", REF)).toBe("2026-03-06");
    expect(parseDue("ping tomorrow", REF)).toBe("2026-03-03");
    expect(parseDue("no date here", REF)).toBeNull();
  });

  it("rolls past month dates into next year", () => {
    expect(parseDue("plan by Jan 10", REF)).toBe("2027-01-10");
  });
});

describe("parseOwner", () => {
  it("detects owner prefixes", () => {
    expect(parseOwner("Alex Rivera: draft the plan")).toEqual({ owner: "Alex Rivera", text: "Draft the plan" });
    expect(parseOwner("Sam to confirm budget")).toEqual({ owner: "Sam", text: "Confirm budget" });
    expect(parseOwner("I will share the doc").owner).toBe("me");
    expect(parseOwner("Update roadmap (owner: me)")).toEqual({ owner: "me", text: "Update roadmap" });
    expect(parseOwner("Book a design review").owner).toBe("");
    expect(parseOwner("The team to review").owner).toBe("");
  });
});

describe("extractActionItems", () => {
  const md = [
    "## Roadmap",
    "- Discussed Q2 scope",
    "",
    "## Action items",
    "- Alex to draft the onboarding form by Friday",
    "- [x] I'll send the notes",
    "- **Sam Lee**",
    "  - Confirm budget",
    "  - Share hiring plan by 3/9",
    "- Book a design review",
    "",
    "**Next steps:**",
    "1. Me: follow up with legal",
  ].join("\n");

  it("pulls items only from action sections with owners, dues, and done state", () => {
    const items = extractActionItems(note("n1", REF.toISOString(), md));
    expect(items.map((item) => [item.text, item.owner, item.due, item.done])).toEqual([
      ["Draft the onboarding form by Friday", "Alex", "2026-03-06", false],
      ["I'll send the notes", "me", null, true],
      ["Confirm budget", "Sam Lee", null, false],
      ["Share hiring plan by 3/9", "Sam Lee", "2026-03-09", false],
      ["Book a design review", "", null, false],
      ["Follow up with legal", "me", null, false],
    ]);
    expect(items.every((item) => item.noteId === "n1" && item.personId === "p1")).toBe(true);
  });

  it("keeps ids stable across re-extraction", () => {
    const a = extractActionItems(note("n1", REF.toISOString(), md));
    const b = extractActionItems(note("n1", REF.toISOString(), md));
    expect(a.map((item) => item.id)).toEqual(b.map((item) => item.id));
    expect(new Set(a.map((item) => item.id)).size).toBe(a.length);
  });

  it("returns nothing for notes without action sections or summary", () => {
    expect(extractActionItems(note("n2", REF.toISOString(), "## Roadmap\n- Talked"))).toEqual([]);
    expect(extractActionItems(note("n3", REF.toISOString(), ""))).toEqual([]);
  });
});

describe("themes and prep brief", () => {
  const notes = [
    note("a", "2026-03-02T15:00:00Z", "## Hiring\n- panel\n## Onboarding\n- funnel drop\n## Next steps\n- Alex to fix funnel"),
    note("b", "2026-03-09T15:00:00Z", "## Onboarding\n- funnel test live\n## Summary\n- ok\n## Action items\n- I will review funnel data"),
  ];

  it("ranks repeated headings first and skips action and generic headings", () => {
    const themes = extractThemes(notes);
    expect(themes[0]).toEqual({ label: "Onboarding", count: 2 });
    expect(themes.map((theme) => theme.label)).toContain("Hiring");
    expect(themes.map((theme) => theme.label)).not.toContain("Summary");
    expect(themes.map((theme) => theme.label)).toContain("funnel");
    expect(themes.map((theme) => theme.label)).not.toContain("alex");
    const excluded = extractThemes(notes, { exclude: ["Funnel"] });
    expect(excluded.map((theme) => theme.label)).not.toContain("funnel");
    expect(noteTopics(notes[1])).toEqual(["Onboarding"]);
  });

  it("assembles open items, my follow-ups, last topics, and moments since", () => {
    const items = notes.flatMap((entry) => extractActionItems(entry));
    items[0] = { ...items[0], done: false };
    const moments: Moment[] = [
      { id: "m1", personId: "p1", date: "2026-03-10", text: "Great demo", tag: "win", createdAt: "" },
      { id: "m2", personId: "p1", date: "2026-03-01", text: "Old", tag: "", createdAt: "" },
    ];
    const brief = buildPrepBrief({ notes, items, moments });
    expect(brief.lastNote?.id).toBe("b");
    expect(brief.stillOpen.map((item) => item.text)).toEqual(["Fix funnel"]);
    expect(brief.followUps.map((item) => item.text)).toEqual(["I will review funnel data"]);
    expect(brief.lastTopics).toEqual(["Onboarding"]);
    expect(brief.momentsSince.map((moment) => moment.id)).toEqual(["m1"]);
  });
});
