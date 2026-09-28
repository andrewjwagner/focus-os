import { describe, expect, it } from "vitest";
import {
  buildPrepBrief,
  extractActionItems,
  extractThemes,
  noteTopics,
  parseDue,
  classifyActionHeading,
  extractItems,
  findOwnerHint,
} from "./extract";
import type { Identity } from "./owner";
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
  const identity: Identity = {
    selfNames: ["Jordan Park"],
    selfEmails: [],
    person: { id: "p1", name: "Alex Rivera" },
    others: [{ id: "p2", name: "Sam Lee" }],
  };

  it("pulls items only from action sections with owners, dues, and done state", () => {
    const items = extractActionItems(note("n1", REF.toISOString(), md), identity);
    expect(items.map((item) => [item.text, item.ownerKind, item.owner, item.due, item.done])).toEqual([
      ["Draft the onboarding form by Friday", "them", "Alex Rivera", "2026-03-06", false],
      ["I'll send the notes", "me", "me", null, true],
      ["Confirm budget", "other", "Sam Lee", null, false],
      ["Share hiring plan by 3/9", "other", "Sam Lee", "2026-03-09", false],
      ["Book a design review", "unassigned", "", null, false],
      ["Follow up with legal", "me", "me", null, false],
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

const ME = "Jordan Park";
// Manager and direct report share a first name on purpose.
const MANAGER = { id: "p1", name: "Alex Morgan" };
const DIRECT = { id: "p2", name: "Alex Rivera" };
const managerPage: Identity = {
  selfNames: [ME],
  selfEmails: ["jordan@example.com"],
  person: MANAGER,
  others: [DIRECT, { id: "p3", name: "Priya Shah" }],
};

function owners(markdown: string, identity: Identity = managerPage) {
  return extractActionItems(note("n1", REF.toISOString(), markdown), identity).map((item) => [
    item.text,
    item.ownerKind,
    item.ownerKind === "other" ? item.owner : "",
  ]);
}

describe("findOwnerHint", () => {
  it("reads the common Granola owner patterns", () => {
    expect(findOwnerHint("Alex Morgan: draft the plan")).toMatchObject({ hint: "Alex Morgan", text: "Draft the plan" });
    expect(findOwnerHint("Alex to confirm budget")).toMatchObject({ hint: "Alex", text: "Confirm budget" });
    expect(findOwnerHint("Send the deck @Rivera")).toMatchObject({ hint: "Rivera", text: "Send the deck" });
    expect(findOwnerHint("Update roadmap (owner: me)")).toMatchObject({ hint: "me", text: "Update roadmap" });
    expect(findOwnerHint("Owner: Priya Shah - write the brief")?.hint).toBe("Priya Shah");
    expect(findOwnerHint("Write the brief - Priya")).toMatchObject({ hint: "Priya", strength: "weak", text: "Write the brief" });
    expect(findOwnerHint("Write the brief (Priya)")).toMatchObject({ hint: "Priya", strength: "weak" });
    expect(findOwnerHint("I will share the doc")?.hint).toBe("me");
    expect(findOwnerHint("Context from last week; Jordan should book the room")?.hint).toBe("Jordan");
  });

  it("ignores verbs and labels that look like names", () => {
    expect(findOwnerHint("Book a design review")).toBeNull();
    expect(findOwnerHint("Plan: finish the rollout")).toBeNull();
    expect(findOwnerHint("Introduce Jordan to the platform lead")).toBeNull();
    expect(findOwnerHint("The team to review")).toBeNull();
    expect(findOwnerHint("Ship by (Friday)")).toBeNull();
  });
});

describe("classifyActionHeading", () => {
  it("only treats real action headings as action sections", () => {
    expect(classifyActionHeading("Next Steps").action).toBe(true);
    expect(classifyActionHeading("Action items:").action).toBe(true);
    expect(classifyActionHeading("Next steps and decisions").action).toBe(true);
    expect(classifyActionHeading("Alex's next steps")).toEqual({ action: true, owner: "Alex" });
    expect(classifyActionHeading("Action items for Jordan")).toEqual({ action: true, owner: "Jordan" });
    expect(classifyActionHeading("Transition to New Tooling and Team Owners").action).toBe(false);
    expect(classifyActionHeading("Hiring tasks and budget planning").action).toBe(false);
    expect(classifyActionHeading("Follow up from the offsite on roadmap scope").action).toBe(false);
  });
});

describe("ownership in a manager note", () => {
  it("splits me, them, other, and unassigned", () => {
    const md = [
      "## Action items",
      "- Alex to send the budget by Friday",
      "- Jordan: write up the hiring plan",
      "- I'll book the offsite",
      "- Priya Shah to review the design",
      "- @Rivera share the launch notes",
      "- Morgan to confirm headcount",
      "- Book a design review",
      "- Casey Nguyen: set up the vendor call",
    ].join("\n");
    expect(owners(md)).toEqual([
      ["Send the budget by Friday", "them", ""],
      ["Write up the hiring plan", "me", ""],
      ["I'll book the offsite", "me", ""],
      ["Review the design", "other", "Priya Shah"],
      ["Share the launch notes", "other", "Alex Rivera"],
      ["Confirm headcount", "them", ""],
      ["Book a design review", "unassigned", ""],
      ["Set up the vendor call", "other", "Casey Nguyen"],
    ]);
  });

  it("maps a shared bare first name to the person whose page it is", () => {
    const md = "## Next steps\n- Alex to draft the plan";
    expect(owners(md)).toEqual([["Draft the plan", "them", ""]]);
    const directPage: Identity = { ...managerPage, person: DIRECT, others: [MANAGER] };
    expect(owners(md, directPage)).toEqual([["Draft the plan", "them", ""]]);
    // Full or last name disambiguates to the other Alex.
    expect(owners("## Next steps\n- Alex Rivera to draft the plan")).toEqual([
      ["Draft the plan", "other", "Alex Rivera"],
    ]);
    expect(owners("## Next steps\n- Rivera to draft the plan", directPage)).toEqual([
      ["Draft the plan", "them", ""],
    ]);
    expect(owners("## Next steps\n- Morgan to draft the plan", directPage)).toEqual([
      ["Draft the plan", "other", "Alex Morgan"],
    ]);
  });

  it("inherits owners from per-person sub-headings, bold lines, and name bullets", () => {
    const md = [
      "# Next Steps",
      "## Alex",
      "- Confirm the budget",
      "- Share hiring plan by 3/9",
      "## Jordan",
      "- Draft the one pager",
      "**Priya Shah:**",
      "- Review the vendor contract",
      "- **Jordan Park**",
      "  - Book the offsite",
      "Alex Morgan:",
      "- Approve the headcount (Jordan)",
    ].join("\n");
    expect(owners(md)).toEqual([
      ["Confirm the budget", "them", ""],
      ["Share hiring plan by 3/9", "them", ""],
      ["Draft the one pager", "me", ""],
      ["Review the vendor contract", "other", "Priya Shah"],
      ["Book the offsite", "me", ""],
      ["Approve the headcount", "them", ""],
    ]);
  });

  it("handles bold title bullets with continuation lines (Granola next steps)", () => {
    const md = [
      "# Weekly Priorities",
      "- Alex will send notes to Jordan",
      "# Transition to New Tooling and Team Owners",
      "- Tooling owners: Alex, Priya, Casey",
      "- Plan: Jordan to meet with Alex and Priya",
      "# Next Steps",
      "- **Schedule the roadmap review for Casey Nguyen and Priya Shah**",
      "  Book a room and send the pre-read to attendees",
      "- **Finalize the migration plan**",
      "  Align with platform on timing; Jordan should circulate the draft",
      "- **Introduce Jordan to the data team** (Alex)",
      "  Alex offered to make the intro this week",
      "- **Refresh the quarterly metrics**",
      "  Alex needs to pull the numbers by Friday",
    ].join("\n");
    const items = extractActionItems(note("n9", REF.toISOString(), md), managerPage);
    expect(items.map((item) => [item.text, item.ownerKind])).toEqual([
      ["Schedule the roadmap review for Casey Nguyen and Priya Shah", "unassigned"],
      ["Finalize the migration plan", "me"],
      ["Introduce Jordan to the data team", "them"],
      ["Refresh the quarterly metrics", "them"],
    ]);
    expect(items[1].detail).toContain("circulate the draft");
    expect(items[3].due).toBe("2026-03-06");
  });

  it("uses the note owner email and self words for me", () => {
    const byEmail: Identity = { ...managerPage, selfNames: [] };
    const [item] = extractItems(note("n2", REF.toISOString(), "## Action items\n- Review the doc (owner: jordan@example.com)"));
    expect(item.ownerHint).toBe("jordan@example.com");
    expect(owners("## Action items\n- Review the doc (owner: jordan@example.com)", byEmail)[0][1]).toBe("me");
    expect(owners("## Action items\n- Me: review the doc", byEmail)[0][1]).toBe("me");
  });
});

describe("themes and prep brief", () => {
  const notes = [
    note("a", "2026-03-02T15:00:00Z", "## Hiring\n- panel\n## Onboarding\n- funnel drop\n## Next steps\n- Alex to fix funnel"),
    note("b", "2026-03-09T15:00:00Z", "## Onboarding\n- funnel test live\n## Summary\n- ok\n## Action items\n- I will review funnel data\n- Check the numbers"),
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

  it("assembles my open items, their commitments, last topics, and moments since", () => {
    const identity: Identity = {
      selfNames: ["Jordan Park"],
      selfEmails: [],
      person: { id: "p1", name: "Alex Rivera" },
      others: [],
    };
    const items = notes.flatMap((entry) => extractActionItems(entry, identity));
    const moments: Moment[] = [
      { id: "m1", personId: "p1", date: "2026-03-10", text: "Great demo", tag: "win", type: "win", typeEdited: false, createdAt: "" },
      { id: "m2", personId: "p1", date: "2026-03-01", text: "Old", tag: "", type: "note", typeEdited: false, createdAt: "" },
    ];
    const brief = buildPrepBrief({ notes, items, moments });
    expect(brief.lastNote?.id).toBe("b");
    expect(brief.theirCommitments.map((item) => item.text)).toEqual(["Fix funnel"]);
    expect(brief.followUps.map((item) => item.text)).toEqual(["I will review funnel data"]);
    expect(brief.unassigned.map((item) => item.text)).toEqual(["Check the numbers"]);
    expect(brief.lastTopics).toEqual(["Onboarding"]);
    expect(brief.momentsSince.map((moment) => moment.id)).toEqual(["m1"]);
  });
});
