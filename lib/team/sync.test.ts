import { describe, expect, it } from "vitest";
import { DEMO_PEOPLE } from "./seed";
import { buildSyncTargets, isSyncDue, mergeSyncResponse, SYNC_INTERVAL_MS } from "./sync";

const people = [
  ...DEMO_PEOPLE,
  { ...DEMO_PEOPLE[0], id: "person-no-folder", granolaFolderName: "" },
];

const payload = {
  id: "not_demo",
  title: "Weekly",
  createdAt: "2026-03-02T15:00:00Z",
  updatedAt: "2026-03-02T15:00:00Z",
  meetingAt: "2026-03-02T15:00:00Z",
  webUrl: "",
  summaryMarkdown: "## Next steps\n- Alex to ship by Friday\n- Book review",
  summaryText: "",
  transcript: null,
};

describe("team sync helpers", () => {
  it("builds targets only for people with a folder", () => {
    expect(buildSyncTargets(people).map((target) => target.personId)).toEqual([
      "person-demo-alex",
      "person-demo-sam",
    ]);
  });

  it("merges notes, adds only new items, and tracks lastSync per person", () => {
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
    const first = mergeSyncResponse(response, people, new Set());
    expect(first.notes).toHaveLength(1);
    expect(first.notes[0].personId).toBe("person-demo-alex");
    expect(first.newItems.map((item) => item.text)).toEqual(["Ship by Friday", "Book review"]);
    expect(first.people.find((p) => p.id === "person-demo-alex")?.lastSync).toBe(response.syncedAt);
    expect(first.people.find((p) => p.id === "person-demo-sam")?.lastSync).toBeNull();
    expect(first.missingFolders).toEqual(["Demo 1:1 Sam"]);

    const again = mergeSyncResponse(response, people, new Set(first.newItems.map((item) => item.id)));
    expect(again.notes).toHaveLength(1);
    expect(again.newItems).toEqual([]);
  });

  it("knows when a periodic sync is due", () => {
    const now = new Date("2026-03-03T12:00:00Z");
    expect(isSyncDue(null, now)).toBe(true);
    expect(isSyncDue(new Date(now.getTime() - SYNC_INTERVAL_MS + 1000).toISOString(), now)).toBe(false);
    expect(isSyncDue(new Date(now.getTime() - SYNC_INTERVAL_MS).toISOString(), now)).toBe(true);
  });
});
