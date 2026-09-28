import type { TranscriptLine } from "./team/types";

/**
 * Server-only Granola API client. The API key comes from process.env and is
 * never returned, logged, or sent to the browser.
 * Docs: https://docs.granola.ai/api-reference (base https://public-api.granola.ai)
 */

export const GRANOLA_BASE_URL = "https://public-api.granola.ai/v1";
/** Granola allows 5 requests per second. Stay a bit under it. */
export const MIN_REQUEST_INTERVAL_MS = 250;
const MAX_RETRIES = 4;
const MAX_PAGES = 200;
const MAX_TRANSCRIPT_PAGES = 50;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class GranolaError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(`Granola request failed (${status} ${code})`);
  }
}

export type GranolaFolder = { id: string; name: string; parentFolderId: string | null };

export type GranolaNoteRef = { id: string; updatedAt: string };

export type SyncedNote = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  meetingAt: string;
  webUrl: string;
  summaryMarkdown: string;
  summaryText: string;
  transcript: TranscriptLine[] | null;
};

export type GranolaClientOptions = {
  apiKey: string;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  minIntervalMs?: number;
};

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function normalizeFolder(raw: unknown): GranolaFolder | null {
  const data = obj(raw);
  const id = str(data.id);
  const name = str(data.name) || str(data.title);
  if (!id || !name) return null;
  const parent = data.parent_folder_id ?? data.parentFolderId;
  return { id, name, parentFolderId: typeof parent === "string" ? parent : null };
}

export function normalizeTranscript(raw: unknown): TranscriptLine[] {
  if (!Array.isArray(raw)) return [];
  const lines: TranscriptLine[] = [];
  for (const entry of raw) {
    const data = obj(entry);
    const text = str(data.text);
    if (!text) continue;
    const speaker = obj(data.speaker);
    const label =
      str(speaker.name) ||
      str(speaker.diarization_label) ||
      (speaker.attribution === "me" ? "me" : speaker.attribution === "them" ? "them" : "") ||
      str(speaker.source);
    lines.push({ speaker: label, text });
  }
  return lines;
}

export function normalizeNote(raw: unknown): SyncedNote | null {
  const data = obj(raw);
  const id = str(data.id);
  if (!id) return null;
  const createdAt = str(data.created_at) || str(data.createdAt) || new Date(0).toISOString();
  const updatedAt = str(data.updated_at) || str(data.updatedAt) || createdAt;
  const event = obj(data.calendar_event);
  const meetingAt = str(event.scheduled_start_time) || createdAt;
  return {
    id,
    title: str(data.title) || str(event.event_title) || "Untitled meeting",
    createdAt,
    updatedAt,
    meetingAt,
    webUrl: str(data.web_url) || str(data.webUrl),
    summaryMarkdown: str(data.summary_markdown) || str(data.summaryMarkdown),
    summaryText: str(data.summary_text) || str(data.summaryText),
    transcript: Array.isArray(data.transcript) ? normalizeTranscript(data.transcript) : null,
  };
}

export function folderKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export class GranolaClient {
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly minIntervalMs: number;
  private lastRequestAt = 0;
  requestCount = 0;

  constructor(options: GranolaClientOptions) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
    this.minIntervalMs = options.minIntervalMs ?? MIN_REQUEST_INTERVAL_MS;
  }

  private async throttle() {
    const wait = this.lastRequestAt + this.minIntervalMs - this.now();
    if (wait > 0) await this.sleep(wait);
    this.lastRequestAt = this.now();
  }

  /** GET with throttle and 429 backoff. Returns parsed JSON. */
  async get(path: string, params: Record<string, string | undefined> = {}): Promise<unknown> {
    const url = new URL(`${GRANOLA_BASE_URL}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
    }
    for (let attempt = 0; ; attempt += 1) {
      await this.throttle();
      this.requestCount += 1;
      const response = await this.fetchImpl(url.toString(), {
        headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" },
        cache: "no-store",
      });
      if (response.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, 30_000)
            : 500 * 2 ** attempt;
        await this.sleep(delay);
        continue;
      }
      if (!response.ok) {
        let code = "";
        try {
          const body = obj(await response.json());
          code = str(body.code) || str(obj(body.error).code) || str(body.error);
        } catch {
          // Non-JSON error body.
        }
        throw new GranolaError(response.status, code || response.statusText || "error");
      }
      return response.json();
    }
  }

  async listFolders(): Promise<GranolaFolder[]> {
    const folders: GranolaFolder[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const data = obj(await this.get("/folders", { cursor, page_size: "30" }));
      for (const raw of Array.isArray(data.folders) ? data.folders : []) {
        const folder = normalizeFolder(raw);
        if (folder) folders.push(folder);
      }
      cursor = str(data.cursor) || undefined;
      if (!data.hasMore || !cursor) break;
    }
    return folders;
  }

  async listNotes(folderId: string, updatedAfter?: string): Promise<GranolaNoteRef[]> {
    const notes: GranolaNoteRef[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const data = obj(
        await this.get("/notes", {
          folder_id: folderId,
          updated_after: updatedAfter,
          cursor,
          page_size: "30",
        }),
      );
      for (const raw of Array.isArray(data.notes) ? data.notes : []) {
        const note = obj(raw);
        const id = str(note.id);
        if (id) notes.push({ id, updatedAt: str(note.updated_at) });
      }
      cursor = str(data.cursor) || undefined;
      if (!data.hasMore || !cursor) break;
    }
    return notes;
  }

  async getTranscript(noteId: string): Promise<TranscriptLine[]> {
    const lines: TranscriptLine[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_TRANSCRIPT_PAGES; page += 1) {
      const data = obj(
        await this.get(`/notes/${encodeURIComponent(noteId)}/transcript`, {
          cursor,
          page_size: "100",
        }),
      );
      lines.push(...normalizeTranscript(data.transcript));
      cursor = str(data.cursor) || undefined;
      if (!data.hasMore || !cursor) break;
    }
    return lines;
  }

  /** Note with transcript. Falls back to the paged endpoint on TRANSCRIPT_TOO_LARGE. */
  async getNote(noteId: string, includeTranscript = true): Promise<SyncedNote | null> {
    const path = `/notes/${encodeURIComponent(noteId)}`;
    if (!includeTranscript) return normalizeNote(await this.get(path));
    try {
      return normalizeNote(await this.get(path, { include: "transcript" }));
    } catch (error) {
      const tooLarge =
        error instanceof GranolaError &&
        (error.status === 413 || error.code === "TRANSCRIPT_TOO_LARGE");
      if (!tooLarge) throw error;
      const note = normalizeNote(await this.get(path));
      if (note) note.transcript = await this.getTranscript(noteId);
      return note;
    }
  }
}

export type SyncTarget = { personId: string; folderName: string; updatedAfter?: string | null };

export type PersonSyncResult = {
  personId: string;
  folderFound: boolean;
  notes: SyncedNote[];
};

/**
 * Sync only the configured folders. Any other Granola folder is ignored and
 * never fetched.
 */
export async function syncFolders(
  client: GranolaClient,
  targets: SyncTarget[],
  { includeTranscript = true } = {},
): Promise<PersonSyncResult[]> {
  const folders = await client.listFolders();
  const byName = new Map<string, GranolaFolder>();
  for (const folder of folders) {
    const key = folderKey(folder.name);
    if (!byName.has(key)) byName.set(key, folder);
  }
  const results: PersonSyncResult[] = [];
  for (const target of targets) {
    const folder = byName.get(folderKey(target.folderName));
    if (!folder) {
      results.push({ personId: target.personId, folderFound: false, notes: [] });
      continue;
    }
    const refs = await client.listNotes(folder.id, target.updatedAfter ?? undefined);
    const notes: SyncedNote[] = [];
    for (const ref of refs) {
      const note = await client.getNote(ref.id, includeTranscript);
      if (note) notes.push(note);
    }
    results.push({ personId: target.personId, folderFound: true, notes });
  }
  return results;
}

export function parseSyncTargets(json: unknown): SyncTarget[] | null {
  const data = obj(json);
  if (!Array.isArray(data.targets) || data.targets.length > 50) return null;
  const targets: SyncTarget[] = [];
  for (const raw of data.targets) {
    const entry = obj(raw);
    const personId = str(entry.personId).slice(0, 200);
    const folderName = str(entry.folderName).trim().slice(0, 200);
    if (!personId || !folderName) return null;
    const updatedAfter = str(entry.updatedAfter);
    targets.push({
      personId,
      folderName,
      updatedAfter: updatedAfter && !Number.isNaN(Date.parse(updatedAfter)) ? updatedAfter : null,
    });
  }
  return targets;
}
