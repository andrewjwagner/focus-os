import { extractItems, itemId, parseDue, toActionItem } from "./extract";
import { identityFor, resolveOwner, type Identity } from "./owner";
import type { ActionItem, CachedAnalysis, NoteAnalysis, Person, TeamNote } from "./types";

/** Action items from a cached AI analysis, with owners mapped to kinds. */
export function itemsFromAnalysis(
  note: TeamNote,
  analysis: NoteAnalysis,
  identity: Identity,
): ActionItem[] {
  const seen = new Set<string>();
  const items: ActionItem[] = [];
  for (const entry of analysis.items) {
    const id = itemId(note.id, entry.text);
    if (seen.has(id)) continue;
    seen.add(id);
    let ownerKind: ActionItem["ownerKind"] = "unassigned";
    let owner = "";
    if (entry.owner === "me") {
      ownerKind = "me";
      owner = "me";
    } else if (entry.owner === "them") {
      ownerKind = "them";
      owner = identity.person.name;
    } else if (entry.owner === "other" && entry.ownerName) {
      // The model may name someone we know (even me or them): resolve it.
      const resolved = resolveOwner(entry.ownerName, identity);
      ownerKind = resolved.kind === "unassigned" ? "other" : resolved.kind;
      owner = resolved.kind === "unassigned" ? entry.ownerName : resolved.name;
    }
    const reference = new Date(note.meetingAt);
    items.push({
      id,
      personId: note.personId,
      noteId: note.id,
      text: entry.text,
      detail: "",
      ownerKind,
      owner,
      ownerHint: entry.ownerName ?? entry.owner,
      ownerEdited: false,
      edited: false,
      due: entry.due ?? (Number.isNaN(reference.getTime()) ? null : parseDue(entry.text, reference)),
      done: false,
      createdAt: note.meetingAt,
    });
  }
  return items;
}

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
  /** Cached AI analyses by note id. When present (and current) they replace rule parsing. */
  analyses?: Record<string, CachedAnalysis | undefined>;
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
    const cached = input.analyses?.[note.id];
    const freshItems =
      cached && cached.noteUpdatedAt === note.updatedAt
        ? itemsFromAnalysis(note, cached.analysis, identity)
        : extractItems(note).map((extracted) => toActionItem(extracted, identity));
    for (const fresh of freshItems) {
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
