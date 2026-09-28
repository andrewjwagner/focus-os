import { extractActionItems } from "./extract";
import type { ActionItem, Person, TeamNote } from "./types";

/** Client-side sync helpers (pure). The fetch itself lives in the Team provider. */

export const SYNC_INTERVAL_MS = 30 * 60 * 1000;

export type SyncTargetInput = {
  personId: string;
  folderName: string;
  updatedAfter: string | null;
};

export type SyncedNotePayload = Omit<TeamNote, "personId">;

export type SyncResponse =
  | {
      ok: true;
      configured: true;
      syncedAt: string;
      results: { personId: string; folderFound: boolean; notes: SyncedNotePayload[] }[];
    }
  | { ok: false; configured?: boolean; reason: string };

export function buildSyncTargets(people: Person[]): SyncTargetInput[] {
  return people
    .filter((person) => person.granolaFolderName.trim())
    .map((person) => ({
      personId: person.id,
      folderName: person.granolaFolderName.trim(),
      updatedAfter: person.lastSync,
    }));
}

export type MergedSync = {
  notes: TeamNote[];
  newItems: ActionItem[];
  people: Person[];
  counts: Record<string, number>;
  missingFolders: string[];
};

/**
 * Turn a sync response into records to upsert. Notes upsert by id. Items are
 * only added when their deterministic id is new, so done toggles and owner or
 * due edits survive re-syncs. Unknown person ids are ignored.
 */
export function mergeSyncResponse(
  response: Extract<SyncResponse, { ok: true }>,
  people: Person[],
  existingItemIds: Set<string>,
): MergedSync {
  const byId = new Map(people.map((person) => [person.id, person]));
  const notes: TeamNote[] = [];
  const newItems: ActionItem[] = [];
  const counts: Record<string, number> = {};
  const missingFolders: string[] = [];
  const updated = new Map<string, Person>();

  for (const result of response.results) {
    const person = byId.get(result.personId);
    if (!person) continue;
    counts[person.id] = result.notes.length;
    if (!result.folderFound) {
      missingFolders.push(person.granolaFolderName);
      continue;
    }
    for (const payload of result.notes) {
      const note: TeamNote = { ...payload, personId: person.id };
      notes.push(note);
      for (const item of extractActionItems(note)) {
        if (existingItemIds.has(item.id)) continue;
        existingItemIds.add(item.id);
        newItems.push(item);
      }
    }
    updated.set(person.id, { ...person, lastSync: response.syncedAt });
  }

  return {
    notes,
    newItems,
    people: people.map((person) => updated.get(person.id) ?? person),
    counts,
    missingFolders,
  };
}

export function isSyncDue(lastSyncAt: string | null, now: Date): boolean {
  if (!lastSyncAt) return true;
  const last = Date.parse(lastSyncAt);
  return Number.isNaN(last) || now.getTime() - last >= SYNC_INTERVAL_MS;
}
