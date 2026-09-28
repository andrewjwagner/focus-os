import { extractItems, toActionItem } from "./extract";
import { identityFor } from "./owner";
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

/**
 * One target per person with a folder. Notes stored before the note owner was
 * tracked trigger a full re-fetch so "me" can be identified.
 */
export function buildSyncTargets(people: Person[], notes: TeamNote[] = []): SyncTargetInput[] {
  const legacy = new Set(
    notes.filter((note) => note.ownerName === undefined).map((note) => note.personId),
  );
  return people
    .filter((person) => person.granolaFolderName.trim())
    .map((person) => ({
      personId: person.id,
      folderName: person.granolaFolderName.trim(),
      updatedAfter: legacy.has(person.id) ? null : person.lastSync,
    }));
}

export type MergedSync = {
  notes: TeamNote[];
  people: Person[];
  counts: Record<string, number>;
  missingFolders: string[];
};

/** Turn a sync response into notes to upsert (by id) and per person lastSync. */
export function mergeSyncResponse(
  response: Extract<SyncResponse, { ok: true }>,
  people: Person[],
): MergedSync {
  const byId = new Map(people.map((person) => [person.id, person]));
  const notes: TeamNote[] = [];
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
      notes.push({ ...payload, personId: person.id, ownerName: payload.ownerName ?? "", ownerEmail: payload.ownerEmail ?? "" });
    }
    updated.set(person.id, { ...person, lastSync: response.syncedAt });
  }

  return {
    notes,
    people: people.map((person) => updated.get(person.id) ?? person),
    counts,
    missingFolders,
  };
}

function sameItem(a: ActionItem, b: ActionItem): boolean {
  return (
    a.text === b.text &&
    a.detail === b.detail &&
    a.ownerKind === b.ownerKind &&
    a.owner === b.owner &&
    a.ownerHint === b.ownerHint &&
    a.due === b.due &&
    a.done === b.done
  );
}

/**
 * Re-derive note-backed items from every stored note. New items are added.
 * Existing items get fresh ownership unless the owner was edited by hand, and
 * keep text, due, and done once the user edited them. Untouched items that
 * no longer parse out of their note are removed. Hand-added items are kept.
 */
export function deriveItems(input: {
  notes: TeamNote[];
  items: ActionItem[];
  people: Person[];
  selfName: string;
}): { upserts: ActionItem[]; deletes: string[] } {
  const byPerson = new Map(input.people.map((person) => [person.id, person]));
  const existing = new Map(input.items.map((item) => [item.id, item]));
  const upserts: ActionItem[] = [];
  const keep = new Set<string>();
  const coveredNotes = new Set<string>();

  for (const note of input.notes) {
    const person = byPerson.get(note.personId);
    if (!person) continue;
    coveredNotes.add(note.id);
    const identity = identityFor({
      person,
      people: input.people,
      selfName: input.selfName,
      noteOwnerName: note.ownerName,
      noteOwnerEmail: note.ownerEmail,
    });
    for (const extracted of extractItems(note)) {
      const fresh = toActionItem(extracted, identity);
      keep.add(fresh.id);
      const prior = existing.get(fresh.id);
      if (!prior) {
        upserts.push(fresh);
        continue;
      }
      const next: ActionItem = {
        ...prior,
        detail: prior.edited ? prior.detail : fresh.detail,
        text: prior.edited ? prior.text : fresh.text,
        due: prior.edited ? prior.due : fresh.due,
        done: prior.edited ? prior.done : prior.done || fresh.done,
        ownerHint: fresh.ownerHint,
        ownerKind: prior.ownerEdited ? prior.ownerKind : fresh.ownerKind,
        owner: prior.ownerEdited ? prior.owner : fresh.owner,
      };
      if (!sameItem(prior, next)) upserts.push(next);
    }
  }

  const deletes = input.items
    .filter(
      (item) =>
        item.noteId !== null &&
        coveredNotes.has(item.noteId) &&
        !keep.has(item.id) &&
        !item.edited &&
        !item.ownerEdited &&
        !item.done,
    )
    .map((item) => item.id);

  return { upserts, deletes };
}

export function isSyncDue(lastSyncAt: string | null, now: Date): boolean {
  if (!lastSyncAt) return true;
  const last = Date.parse(lastSyncAt);
  return Number.isNaN(last) || now.getTime() - last >= SYNC_INTERVAL_MS;
}
