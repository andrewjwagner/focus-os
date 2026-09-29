import { describe, expect, it } from "vitest";
import { DEMO_PEOPLE } from "./seed";
import { buildSyncTargets, deriveItems, isSyncDue, mergeSyncResponse, SYNC_INTERVAL_MS } from "./sync";
import type { ActionItem, Person, TeamNote } from "./types";

const people: Person[] = [
  ...DEMO_PEOPLE,
  { ...DEMO_PEOPLE[0], id: "person-no-folder", name: "Casey Nguyen", granolaFolderName: "" },
];

const payload = {
  id: "not_demo",
  title: "Weekly",
  createdAt: "2026-03-02T15:00:00Z",
  updatedAt: "2026-03-02T15:00:00Z",
  meetingAt: "2026-03-02T15:00:00Z",
  webUrl: "",
  summaryMarkdown: "## Next steps\n- Alex to ship by Friday\n- Book review\n- Jordan: send the recap",
  summaryText: "",
  transcript: null,
  ownerName: "Jordan Park",
  ownerEmail: "jordan@example.com",
};

const response = {
  ok: true as const,
  configured: true as const,
  syncedAt: "2026-03-03T00:00:00.000Z",
  results: [
    { personId: "person-demo-alex", folderFound: true, notes: [payload] },
    { personId: "person-demo-sam", folderFound: false, notes: [] },
    { personId: "unknown", folderFound: true, notes: [payload] },
  ],
};

describe("team sync helpers", () => {
  it("builds targets only for people with a folder, full sync for legacy notes", () => {
    expect(buildSyncTargets(people).map((target) => target.personId)).toEqual([
      "person-demo-alex",
      "person-demo-sam",
    ]);
    const synced = people.map((person) => ({ ...person, lastSync: "2026-03-01T00:00:00.000Z" }));
    const legacy = { ...payload, personId: "person-demo-alex", ownerName: undefined } as TeamNote;
    const targets = buildSyncTargets(synced, [legacy]);
    expect(targets.find((t) => t.personId === "person-demo-alex")?.updatedAfter).toBeNull();
    expect(targets.find((t) => t.personId === "person-demo-sam")?.updatedAfter).toBe("2026-03-01T00:00:00.000Z");
  });

  it("merges notes and tracks lastSync per person", () => {
    const merged = mergeSyncResponse(response, people);
    expect(merged.notes).toHaveLength(1);
    expect(merged.notes[0].personId).toBe("person-demo-alex");
    expect(merged.people.find((p) => p.id === "person-demo-alex")?.lastSync).toBe(response.syncedAt);
    expect(merged.people.find((p) => p.id === "person-demo-sam")?.lastSync).toBeNull();
    expect(merged.missingFolders).toEqual(["Demo 1:1 Sam"]);
  });

  it("derives owned items and keeps manual owner edits across re-syncs", () => {
    const { notes } = mergeSyncResponse(response, people);
    const first = deriveItems({ notes, items: [], people, selfName: "" });
    expect(first.upserts.map((item) => [item.text, item.ownerKind])).toEqual([
      ["Ship by Friday", "them"],
      ["Book review", "unassigned"],
      ["Send the recap", "me"],
    ]);
    expect(first.deletes).toEqual([]);

    const edited: ActionItem[] = first.upserts.map((item) =>
      item.text === "Book review" ? { ...item, ownerKind: "me", owner: "me", ownerEdited: true } : item,
    );
    const again = deriveItems({ notes, items: edited, people, selfName: "" });
    expect(again.upserts).toEqual([]);
    expect(again.deletes).toEqual([]);
  });

  it("re-derives ownership for stored items unless edited, and prunes stale untouched items", () => {
    const { notes } = mergeSyncResponse(response, people);
    const [ship, book] = deriveItems({ notes, items: [], people, selfName: "" }).upserts;
    // Items stored by the old parser: wrong owner, one stale id.
    const stored: ActionItem[] = [
      { ...ship, ownerKind: "me", owner: "me" },
      { ...book, ownerKind: "other", owner: "Someone", ownerEdited: true },
      { ...ship, id: "item-stale", text: "Old text", edited: false, done: false },
      { ...ship, id: "item-stale-done", text: "Old done", done: true },
      { ...ship, id: "item-manual", noteId: null, text: "By hand" },
    ];
    const result = deriveItems({ notes, items: stored, people, selfName: "" });
    const byId = new Map(result.upserts.map((item) => [item.id, item]));
    expect(byId.get(ship.id)?.ownerKind).toBe("them");
    expect(byId.has(book.id)).toBe(false);
    expect(result.deletes).toEqual(["item-stale"]);
  });

  it("knows when a periodic sync is due", () => {
    const now = new Date("2026-03-03T12:00:00Z");
    expect(isSyncDue(null, now)).toBe(true);
    expect(isSyncDue(new Date(now.getTime() - SYNC_INTERVAL_MS + 1000).toISOString(), now)).toBe(false);
    expect(isSyncDue(new Date(now.getTime() - SYNC_INTERVAL_MS).toISOString(), now)).toBe(true);
  });
});
