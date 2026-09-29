import { describe, expect, it, vi } from "vitest";
import { fetchAiStatus, noteContentForAi, runAi } from "./ai-client";
import { highlightCounters } from "./highlights";
import { fallbackCoaching, fallbackTalkingPoints, notesNeedingAnalysis, personView, recapFor, type TeamSnapshot } from "./insights";
import { clampScore, describePulseChanges, radarPoints, smoothClosedPath, sparklinePath } from "./pulse";
import { categorizeTopic, classifyMomentRule, recentTopics } from "./rules";
import { DEMO_NOTES, DEMO_PEOPLE } from "./seed";
import { itemsFromAnalysis } from "./sync";
import type { ActionItem, Moment, NoteAnalysis, PulseRating } from "./types";

const person = DEMO_PEOPLE[0];

function item(partial: Partial<ActionItem>): ActionItem {
  return {
    id: partial.id ?? `item-${Math.random()}`,
    personId: person.id,
    noteId: null,
    text: "Task",
    detail: "",
    ownerKind: "unassigned",
    owner: "",
    ownerHint: "",
    ownerEdited: false,
    edited: false,
    due: null,
    done: false,
    createdAt: "",
    ...partial,
  };
}

function moment(partial: Partial<Moment>): Moment {
  return {
    id: partial.id ?? `m-${Math.random()}`,
    personId: person.id,
    date: "2026-03-01",
    text: "Something",
    tag: "",
    type: "note",
    typeEdited: false,
    createdAt: "",
    ...partial,
  };
}

function pulse(date: string, value: number, workload = value): PulseRating {
  return {
    id: date,
    personId: person.id,
    date,
    scores: { engagement: value, workload, growth: value, relationship: value, delivery: value },
    createdAt: "",
  };
}

function snapshot(partial: Partial<TeamSnapshot> = {}): TeamSnapshot {
  return { notes: [], items: [], moments: [], pulses: [], coaching: [], derived: {}, ...partial };
}

describe("rules fallbacks", () => {
  it("classifies moments by keyword and explicit tag", () => {
    expect(classifyMomentRule("Shipped the beta a week early")).toBe("win");
    expect(classifyMomentRule("Missed the review deadline")).toBe("issue");
    expect(classifyMomentRule("Gave feedback on the demo pacing")).toBe("coaching");
    expect(classifyMomentRule("Quick hallway chat")).toBe("note");
    expect(classifyMomentRule("Quick hallway chat", "win")).toBe("win");
  });

  it("sorts topics into tactical and nurture", () => {
    expect(categorizeTopic("Career goals and promotion path")).toBe("nurture");
    expect(categorizeTopic("Q3 launch timeline")).toBe("tactical");
  });

  it("prefers cached AI topics over rules", () => {
    const note = DEMO_NOTES.find((entry) => entry.personId === person.id)!;
    const cached = {
      noteId: note.id,
      personId: person.id,
      noteUpdatedAt: note.updatedAt,
      provider: "ollama" as const,
      analysis: { summary: "", items: [], topics: [{ text: "Mentoring", category: "nurture" as const }], highlights: [], themes: [], recap: "" },
    };
    const topics = recentTopics([note], { [note.id]: cached });
    expect(topics.nurture.map((topic) => topic.text)).toEqual(["Mentoring"]);
    expect(topics.tactical).toEqual([]);
  });

  it("builds 3 to 5 talking points", () => {
    const view = personView(
      person.id,
      snapshot({
        items: [item({ ownerKind: "them", text: "Send the draft" }), item({ ownerKind: "me", text: "Book the room" })],
        moments: [moment({ type: "win", text: "Great demo" })],
        pulses: [pulse("2026-02-01", 7), pulse("2026-03-01", 7, 4)],
      }),
    );
    const points = fallbackTalkingPoints(person, view);
    expect(points.length).toBeGreaterThanOrEqual(3);
    expect(points.length).toBeLessThanOrEqual(5);
    expect(points[0]).toContain("workload");
    expect(points.join(" ")).toContain("Send the draft");
  });

  it("suggests coaching items from issue and coaching moments only", () => {
    const view = personView(
      person.id,
      snapshot({ moments: [moment({ type: "issue", text: "Missed standup" }), moment({ type: "win", text: "Shipped" })] }),
    );
    const plan = fallbackCoaching(view);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toContain("Missed standup");
  });
});

describe("personView and recaps", () => {
  it("splits open items into they owe, I owe, and to sort", () => {
    const view = personView(
      person.id,
      snapshot({
        items: [
          item({ ownerKind: "them" }),
          item({ ownerKind: "me" }),
          item({ ownerKind: "unassigned" }),
          item({ ownerKind: "me", done: true }),
          item({ ownerKind: "me", personId: "someone-else" }),
        ],
      }),
    );
    expect([view.theyOwe.length, view.iOwe.length, view.toSort.length, view.done.length]).toEqual([1, 1, 1, 1]);
  });

  it("uses the edited recap, then the AI recap, then the template", () => {
    const note = DEMO_NOTES.find((entry) => entry.personId === person.id)!;
    const base = snapshot({ notes: [note] });
    expect(recapFor(note, person, base, "Jordan Park").source).toBe("template");
    expect(recapFor(note, person, base, "Jordan Park").text).toContain("Thanks,\nJordan");
    const withAi = snapshot({
      notes: [note],
      derived: {
        [`analysis:${note.id}`]: {
          id: `analysis:${note.id}`,
          kind: "analysis",
          noteId: note.id,
          personId: person.id,
          noteUpdatedAt: note.updatedAt,
          provider: "xai",
          analysis: { summary: "s", items: [], topics: [], highlights: [], themes: [], recap: "AI recap" },
        },
      },
    });
    expect(recapFor(note, person, withAi, "").text).toBe("AI recap");
    withAi.derived[`recap:${note.id}`] = { id: `recap:${note.id}`, kind: "recap", noteId: note.id, personId: person.id, text: "Mine" };
    expect(recapFor(note, person, withAi, "")).toEqual({ text: "Mine", source: "edited" });
  });

  it("re-analyzes only notes whose cache is missing or stale", () => {
    const [first, second] = DEMO_NOTES;
    const derived: TeamSnapshot["derived"] = {
      [`analysis:${first.id}`]: {
        id: `analysis:${first.id}`,
        kind: "analysis",
        noteId: first.id,
        personId: first.personId,
        noteUpdatedAt: first.updatedAt,
        provider: "ollama",
        analysis: { summary: "s", items: [], topics: [], highlights: [], themes: [], recap: "" },
      },
    };
    expect(notesNeedingAnalysis([first, second], derived).map((note) => note.id)).toEqual([second.id]);
    expect(notesNeedingAnalysis([{ ...first, updatedAt: "2099-01-01T00:00:00Z" }], derived)).toHaveLength(1);
  });

  it("maps AI owners to item kinds", () => {
    const note = DEMO_NOTES.find((entry) => entry.personId === person.id)!;
    const analysis: NoteAnalysis = {
      summary: "",
      items: [
        { text: "Send the deck", owner: "me", ownerName: null, due: null },
        { text: "Draft the plan", owner: "them", ownerName: person.name, due: "2026-03-09" },
        { text: "Review budget", owner: "other", ownerName: "Sam Lee", due: null },
        { text: "Pick a date", owner: "unclear", ownerName: null, due: null },
      ],
      topics: [],
      highlights: [],
      themes: [],
      recap: "",
    };
    const items = itemsFromAnalysis(note, analysis, {
      selfNames: ["Jordan Park"],
      selfEmails: [],
      person,
      others: DEMO_PEOPLE.filter((entry) => entry.id !== person.id),
    });
    expect(items.map((entry) => entry.ownerKind)).toEqual(["me", "them", "other", "unassigned"]);
    expect(items[1].due).toBe("2026-03-09");
    expect(items[2].owner).toBe("Sam Lee");
  });
});

describe("pulse and highlights", () => {
  it("clamps scores and describes changes", () => {
    expect(clampScore(0)).toBe(1);
    expect(clampScore(14)).toBe(10);
    expect(describePulseChanges([pulse("2026-02-01", 6), pulse("2026-03-01", 6, 3)])).toEqual(["Workload down from 6 to 3"]);
  });

  it("produces finite radar and sparkline paths", () => {
    const points = radarPoints(pulse("2026-03-01", 5).scores, 100, 100, 80);
    expect(points).toHaveLength(5);
    expect(smoothClosedPath(points)).toMatch(/^M[\d.\s,-]+C/);
    expect(sparklinePath([3, 5, 8], 60, 14)).not.toContain("NaN");
  });

  it("counts moments for this year and the last 90 days", () => {
    const now = new Date("2026-09-28T16:00:00Z");
    const counters = highlightCounters(
      [
        moment({ date: "2026-09-01", type: "win" }),
        moment({ date: "2026-08-15", type: "issue" }),
        moment({ date: "2026-02-01", type: "coaching" }),
        moment({ date: "2025-12-30", type: "win" }),
      ],
      now,
    );
    expect(counters.thisYear).toEqual({ total: 3, win: 1, issue: 1, coaching: 1 });
    expect(counters.last90).toEqual({ total: 2, win: 1, issue: 1, coaching: 0 });
  });
});

describe("ai-client", () => {
  it("reports off when the route fails", async () => {
    const failing = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await fetchAiStatus(failing)).toEqual({ provider: "off", model: "" });
  });

  it("returns null when the route says not ok so callers use rules", async () => {
    const notOk = vi.fn(async () => new Response(JSON.stringify({ ok: false, provider: "ollama", reason: "timeout" })));
    expect(await runAi("classifyMoment", { text: "x", tag: "" }, notOk)).toBeNull();
  });

  it("sends the summary, and the transcript only when the summary is empty", () => {
    const transcript = [{ speaker: "A", text: "hello" }];
    expect(noteContentForAi({ summaryMarkdown: "## Notes", summaryText: "", transcript })).toBe("## Notes");
    expect(noteContentForAi({ summaryMarkdown: "", summaryText: "", transcript })).toBe("A: hello");
  });
});
