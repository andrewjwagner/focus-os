import { getAll, getOne, openDb, put, putMany, remove, txDone } from "../idb";
import { decryptJson, encryptJson } from "./crypto";
import type { ActionItem, Envelope, Moment, Person, TeamNote, VaultMeta } from "./types";

/**
 * Team persistence. Note content, action item text, and moments are encrypted
 * with the session key before they touch IndexedDB. People (name, role,
 * folder name) stay readable so sync targets can be built.
 */

type MetaRecord = { key: string; value: string };

export type StoredNote = {
  id: string;
  personId: string;
  updatedAt: string;
  meetingAt: string;
  enc: Envelope;
};

export type StoredItem = {
  id: string;
  personId: string;
  noteId: string | null;
  done: boolean;
  createdAt: string;
  enc: Envelope;
};

export type StoredMoment = {
  id: string;
  personId: string;
  date: string;
  createdAt: string;
  enc: Envelope;
};

type NoteSecret = Pick<
  TeamNote,
  "title" | "webUrl" | "summaryMarkdown" | "summaryText" | "transcript" | "createdAt"
>;
type ItemSecret = Pick<ActionItem, "text" | "owner" | "due">;
type MomentSecret = Pick<Moment, "text" | "tag">;

export const META_VAULT = "team.vault";
export const META_DIGEST_VIEWED = "team.digestViewedAt";

async function getMeta(key: string): Promise<string | null> {
  const record = await getOne<MetaRecord>("meta", key);
  return record?.value ?? null;
}

async function setMeta(key: string, value: string): Promise<void> {
  await put<MetaRecord>("meta", { key, value });
}

export async function loadVaultMeta(): Promise<VaultMeta | null> {
  const raw = await getMeta(META_VAULT);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VaultMeta;
  } catch {
    return null;
  }
}

export async function saveVaultMeta(meta: VaultMeta): Promise<void> {
  await setMeta(META_VAULT, JSON.stringify(meta));
}

export async function loadDigestViewedAt(): Promise<string | null> {
  return getMeta(META_DIGEST_VIEWED);
}

export async function saveDigestViewedAt(iso: string): Promise<void> {
  await setMeta(META_DIGEST_VIEWED, iso);
}

export async function loadPeople(): Promise<Person[]> {
  const people = await getAll<Person>("teamPeople");
  return people.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function savePerson(person: Person): Promise<void> {
  await put("teamPeople", person);
}

/** Delete a person and every note, item, and moment tied to them. */
export async function deletePersonCascade(personId: string): Promise<void> {
  const db = await openDb();
  const stores = ["teamPeople", "teamNotes", "teamItems", "teamMoments"] as const;
  const tx = db.transaction([...stores], "readwrite");
  tx.objectStore("teamPeople").delete(personId);
  for (const name of stores.slice(1)) {
    const store = tx.objectStore(name);
    const request = store.getAll();
    request.onsuccess = () => {
      for (const record of request.result as { id: string; personId: string }[]) {
        if (record.personId === personId) store.delete(record.id);
      }
    };
  }
  await txDone(tx);
}

export async function encryptNote(key: CryptoKey, note: TeamNote): Promise<StoredNote> {
  const secret: NoteSecret = {
    title: note.title,
    webUrl: note.webUrl,
    summaryMarkdown: note.summaryMarkdown,
    summaryText: note.summaryText,
    transcript: note.transcript,
    createdAt: note.createdAt,
  };
  return {
    id: note.id,
    personId: note.personId,
    updatedAt: note.updatedAt,
    meetingAt: note.meetingAt,
    enc: await encryptJson(key, secret),
  };
}

export async function decryptNote(key: CryptoKey, stored: StoredNote): Promise<TeamNote> {
  const secret = await decryptJson<NoteSecret>(key, stored.enc);
  return {
    id: stored.id,
    personId: stored.personId,
    updatedAt: stored.updatedAt,
    meetingAt: stored.meetingAt,
    ...secret,
  };
}

export async function encryptItem(key: CryptoKey, item: ActionItem): Promise<StoredItem> {
  const secret: ItemSecret = { text: item.text, owner: item.owner, due: item.due };
  return {
    id: item.id,
    personId: item.personId,
    noteId: item.noteId,
    done: item.done,
    createdAt: item.createdAt,
    enc: await encryptJson(key, secret),
  };
}

export async function decryptItem(key: CryptoKey, stored: StoredItem): Promise<ActionItem> {
  const secret = await decryptJson<ItemSecret>(key, stored.enc);
  return {
    id: stored.id,
    personId: stored.personId,
    noteId: stored.noteId,
    done: stored.done,
    createdAt: stored.createdAt,
    ...secret,
  };
}

export async function encryptMoment(key: CryptoKey, moment: Moment): Promise<StoredMoment> {
  const secret: MomentSecret = { text: moment.text, tag: moment.tag };
  return {
    id: moment.id,
    personId: moment.personId,
    date: moment.date,
    createdAt: moment.createdAt,
    enc: await encryptJson(key, secret),
  };
}

export async function decryptMoment(key: CryptoKey, stored: StoredMoment): Promise<Moment> {
  const secret = await decryptJson<MomentSecret>(key, stored.enc);
  return {
    id: stored.id,
    personId: stored.personId,
    date: stored.date,
    createdAt: stored.createdAt,
    ...secret,
  };
}

export async function loadTeamData(key: CryptoKey): Promise<{
  notes: TeamNote[];
  items: ActionItem[];
  moments: Moment[];
}> {
  const [notes, items, moments] = await Promise.all([
    getAll<StoredNote>("teamNotes"),
    getAll<StoredItem>("teamItems"),
    getAll<StoredMoment>("teamMoments"),
  ]);
  return {
    notes: await Promise.all(notes.map((note) => decryptNote(key, note))),
    items: await Promise.all(items.map((item) => decryptItem(key, item))),
    moments: await Promise.all(moments.map((moment) => decryptMoment(key, moment))),
  };
}

/** Upsert notes keyed by Granola note id. */
export async function saveNotes(key: CryptoKey, notes: TeamNote[]): Promise<void> {
  const stored = await Promise.all(notes.map((note) => encryptNote(key, note)));
  await putMany("teamNotes", stored);
}

export async function saveItems(key: CryptoKey, items: ActionItem[]): Promise<void> {
  const stored = await Promise.all(items.map((item) => encryptItem(key, item)));
  await putMany("teamItems", stored);
}

export async function deleteItem(id: string): Promise<void> {
  await remove("teamItems", id);
}

export async function saveMoment(key: CryptoKey, moment: Moment): Promise<void> {
  await put("teamMoments", await encryptMoment(key, moment));
}

export async function deleteMoment(id: string): Promise<void> {
  await remove("teamMoments", id);
}
