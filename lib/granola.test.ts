import { describe, expect, it } from "vitest";
import { GranolaClient, normalizeNote, parseSyncTargets, syncFolders } from "./granola";

type Route = (url: URL) => { status?: number; body: unknown; headers?: Record<string, string> };

function fakeFetch(route: Route) {
  const calls: { url: URL; auth: string | null }[] = [];
  const fetchImpl = async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, auth: headers.get("authorization") });
    const result = route(url);
    return new Response(JSON.stringify(result.body), {
      status: result.status ?? 200,
      headers: { "content-type": "application/json", ...result.headers },
    });
  };
  return { fetchImpl, calls };
}

function makeClient(route: Route) {
  const { fetchImpl, calls } = fakeFetch(route);
  let clock = 0;
  const sleeps: number[] = [];
  const client = new GranolaClient({
    apiKey: "test-key",
    fetch: fetchImpl,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
  });
  return { client, calls, sleeps };
}

const FOLDERS_PAGE_1 = {
  folders: [{ id: "fol_aaaaaaaaaaaaaa", object: "folder", name: "Demo 1:1 Alex", parent_folder_id: null }],
  hasMore: true,
  cursor: "c2",
};
const FOLDERS_PAGE_2 = {
  folders: [
    { id: "fol_bbbbbbbbbbbbbb", object: "folder", name: "Other private folder", parent_folder_id: null },
  ],
  hasMore: false,
  cursor: null,
};

function noteBody(id: string) {
  return {
    id,
    object: "note",
    title: "Weekly",
    owner: { name: "Test Owner", email: "owner@example.com" },
    created_at: "2026-03-02T15:00:00Z",
    updated_at: "2026-03-02T16:00:00Z",
    web_url: `https://notes.granola.ai/d/${id}`,
    calendar_event: { scheduled_start_time: "2026-03-02T14:30:00Z" },
    summary_markdown: "## Next steps\n- Alex to ship",
    summary_text: "Alex to ship",
    transcript: [{ speaker: { source: "microphone", attribution: "me" }, text: "hi" }],
  };
}

describe("GranolaClient", () => {
  it("syncs only configured folders, follows cursors, and sends bearer auth", async () => {
    const { client, calls } = makeClient((url) => {
      if (url.pathname === "/v1/folders") {
        return { body: url.searchParams.get("cursor") === "c2" ? FOLDERS_PAGE_2 : FOLDERS_PAGE_1 };
      }
      if (url.pathname === "/v1/notes") {
        expect(url.searchParams.get("folder_id")).toBe("fol_aaaaaaaaaaaaaa");
        return url.searchParams.get("cursor")
          ? { body: { notes: [{ id: "not_2" }], hasMore: false, cursor: null } }
          : { body: { notes: [{ id: "not_1" }], hasMore: true, cursor: "n2" } };
      }
      const id = url.pathname.split("/").pop()!;
      return { body: noteBody(id) };
    });

    const results = await syncFolders(client, [
      { personId: "p1", folderName: "  demo 1:1 ALEX " },
      { personId: "p2", folderName: "Missing folder" },
    ]);

    expect(results[0].folderFound).toBe(true);
    expect(results[0].notes.map((note) => note.id)).toEqual(["not_1", "not_2"]);
    expect(results[0].notes[0].meetingAt).toBe("2026-03-02T14:30:00Z");
    expect(results[0].notes[0].transcript).toEqual([{ speaker: "me", text: "hi" }]);
    expect(results[1]).toEqual({ personId: "p2", folderFound: false, notes: [] });
    expect(calls.every((call) => call.auth === "Bearer test-key")).toBe(true);
    expect(calls.some((call) => call.url.searchParams.get("folder_id") === "fol_bbbbbbbbbbbbbb")).toBe(false);
    expect(calls.every((call) => call.url.origin === "https://public-api.granola.ai")).toBe(true);
  });

  it("passes updated_after for incremental sync", async () => {
    const { client, calls } = makeClient((url) => {
      if (url.pathname === "/v1/folders") return { body: FOLDERS_PAGE_2 };
      return { body: { notes: [], hasMore: false, cursor: null } };
    });
    await syncFolders(client, [
      { personId: "p1", folderName: "Other private folder", updatedAfter: "2026-03-01T00:00:00.000Z" },
    ]);
    const list = calls.find((call) => call.url.pathname === "/v1/notes");
    expect(list?.url.searchParams.get("updated_after")).toBe("2026-03-01T00:00:00.000Z");
  });

  it("throttles to at most one request per 250ms and backs off on 429", async () => {
    let hits = 0;
    const { client, sleeps } = makeClient(() => {
      hits += 1;
      if (hits === 1) return { status: 429, body: {}, headers: { "retry-after": "2" } };
      return { body: { folders: [], hasMore: false, cursor: null } };
    });
    await client.listFolders();
    await client.listFolders();
    expect(hits).toBe(3);
    expect(sleeps).toContain(2000);
    expect(sleeps.every((ms) => ms <= 2000)).toBe(true);
    expect(sleeps.filter((ms) => ms === 250).length).toBeGreaterThanOrEqual(1);
  });

  it("falls back to the paged transcript endpoint on TRANSCRIPT_TOO_LARGE", async () => {
    const { client, calls } = makeClient((url) => {
      if (url.pathname.endsWith("/transcript")) {
        return url.searchParams.get("cursor")
          ? { body: { transcript: [{ speaker: { source: "speaker", attribution: "them" }, text: "b" }], hasMore: false, cursor: null } }
          : { body: { transcript: [{ speaker: { source: "microphone", attribution: "me" }, text: "a" }], hasMore: true, cursor: "t2" } };
      }
      if (url.searchParams.get("include") === "transcript") {
        return { status: 413, body: { code: "TRANSCRIPT_TOO_LARGE" } };
      }
      return { body: { ...noteBody("not_big"), transcript: null } };
    });
    const note = await client.getNote("not_big");
    expect(note?.transcript).toEqual([
      { speaker: "me", text: "a" },
      { speaker: "them", text: "b" },
    ]);
    expect(calls.map((call) => call.url.pathname)).toEqual([
      "/v1/notes/not_big",
      "/v1/notes/not_big",
      "/v1/notes/not_big/transcript",
      "/v1/notes/not_big/transcript",
    ]);
  });

  it("surfaces auth errors without leaking the key", async () => {
    const { client } = makeClient(() => ({ status: 401, body: { error: "unauthorized" } }));
    const error = await client.listFolders().catch((err: Error) => err);
    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).message)).not.toContain("test-key");
  });
});

describe("normalizers", () => {
  it("codes defensively around missing fields", () => {
    expect(normalizeNote({})).toBeNull();
    const note = normalizeNote({ id: "not_x", summary_markdown: null });
    expect(note?.title).toBe("Untitled meeting");
    expect(note?.summaryMarkdown).toBe("");
    expect(note?.transcript).toBeNull();
  });

  it("validates sync targets", () => {
    expect(parseSyncTargets({})).toBeNull();
    expect(parseSyncTargets({ targets: [{ personId: "p1" }] })).toBeNull();
    expect(
      parseSyncTargets({ targets: [{ personId: "p1", folderName: " A ", updatedAfter: "nope" }] }),
    ).toEqual([{ personId: "p1", folderName: "A", updatedAfter: null }]);
  });
});
