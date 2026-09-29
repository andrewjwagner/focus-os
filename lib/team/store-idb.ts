import { getAll, getOne, openDb, put, putMany, remove, txDone } from "../idb";
import { decryptJson, encryptJson } from "./crypto";
import { classifyMomentRule } from "./rules";
import type {
  ActionItem,
  CachedAnalysis,
  CoachingItem,
  Envelope,
  Moment,
  Person,
  PulseRating,
  TalkingPoints,
  TeamNote,
  VaultMeta,
} from "./types";

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
  ownerEdited?: boolean;
  edited?: boolean;
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
  | "title"
  | "webUrl"
  | "summaryMarkdown"
  | "summaryText"
  | "transcript"
  | "createdAt"
  | "ownerName"
  | "ownerEmail"
>;
type ItemSecret = Pick<ActionItem, "text" | "owner" | "due"> &
  Partial<Pick<ActionItem, "detail" | "ownerKind" | "ownerHint">>;
type MomentSecret = Pick<Moment, "text" | "tag"> & Partial<Pick<Moment, "type" | "typeEdited">>;

export const META_VAULT = "team.vault";
export const META_DIGEST_VIEWED = "team.digestViewedAt";
export const META_SELF_NAME = "team.selfName";

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

/** "Your name" from Team settings. Local only. */
export async function loadSelfName(): Promise<string> {
  return (await getMeta(META_SELF_NAME)) ?? "";
}

export async function saveSelfName(name: string): Promise<void> {
  await setMeta(META_SELF_NAME, name.trim());
}

/** Stores that hold ciphertext made with the passphrase key. */
export const ENCRYPTED_TEAM_STORES = [
  "teamNotes",
  "teamItems",
  "teamMoments",
  "teamPulse",
  "teamCoaching",
  "teamDerived",
] as const;

/**
 * Forgotten passphrase: permanently delete everything encrypted with the old
 * key (synced notes cache, action items and owner edits, moments, pulse
 * ratings, coaching plan, AI results) plus the vault salt and verifier.
 *
 * Kept on purpose: the people list (names, roles, Granola folder names, not
 * encrypted) so Granola can re-sync, with lastSync cleared so the next sync
 * pulls every note again. Your name and the digest timestamp stay too.
 * Capture data (projects, thoughts, lanes, other meta) is never touched.
 * One transaction, so a failure leaves nothing half deleted.
 */
export async function resetTeamVault(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([...ENCRYPTED_TEAM_STORES, "teamPeople", "meta"], "readwrite");
  for (const store of ENCRYPTED_TEAM_STORES) tx.objectStore(store).clear();
  tx.objectStore("meta").delete(META_VAULT);
  const people = tx.objectStore("teamPeople");
  const request = people.getAll();
  request.onsuccess = () => {
    for (const person of request.result as Person[]) people.put({ ...person, lastSync: null });
  };
  await txDone(tx);
}

export async function deleteItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDb();
  const tx = db.transaction("teamItems", "readwrite");
  for (const id of ids) tx.objectStore("teamItems").delete(id);
  await txDone(tx);
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
  const stores = [
    "teamPeople",
    "teamNotes",
    "teamItems",
    "teamMoments",
    "teamPulse",
    "teamCoaching",
    "teamDerived",
  ] as const;
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
    ownerName: note.ownerName,
    ownerEmail: note.ownerEmail,
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
  const secret: ItemSecret = {
    text: item.text,
    detail: item.detail,
    owner: item.owner,
    ownerKind: item.ownerKind,
    ownerHint: item.ownerHint,
    due: item.due,
  };
  return {
    id: item.id,
    personId: item.personId,
    noteId: item.noteId,
    done: item.done,
    ownerEdited: item.ownerEdited,
    edited: item.edited,
    createdAt: item.createdAt,
    enc: await encryptJson(key, secret),
  };
}

export async function decryptItem(key: CryptoKey, stored: StoredItem): Promise<ActionItem> {
  const secret = await decryptJson<ItemSecret>(key, stored.enc);
  // Items stored before owner kinds existed: infer from the old owner string.
  const legacyKind = secret.owner === "me" ? "me" : secret.owner ? "other" : "unassigned";
  return {
    id: stored.id,
    personId: stored.personId,
    noteId: stored.noteId,
    done: stored.done,
    ownerEdited: stored.ownerEdited ?? false,
    edited: stored.edited ?? false,
    createdAt: stored.createdAt,
    text: secret.text,
    detail: secret.detail ?? "",
    owner: secret.owner,
    ownerKind: secret.ownerKind ?? legacyKind,
    ownerHint: secret.ownerHint ?? secret.owner,
    due: secret.due,
  };
}

export async function encryptMoment(key: CryptoKey, moment: Moment): Promise<StoredMoment> {
  const secret: MomentSecret = {
    text: moment.text,
    tag: moment.tag,
    type: moment.type,
    typeEdited: moment.typeEdited,
  };
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
    text: secret.text,
    tag: secret.tag,
    // Moments saved before types existed: classify with rules.
    type: secret.type ?? classifyMomentRule(secret.text, secret.tag),
    typeEdited: secret.typeEdited ?? false,
  };
}

/** Generic encrypted record: plain id + personId for filtering, rest encrypted. */
export type StoredSecret = { id: string; personId: string; enc: Envelope };

type SecretStore = "teamPulse" | "teamCoaching" | "teamDerived";

async function saveSecret<T extends { id: string; personId: string }>(
  key: CryptoKey,
  store: SecretStore,
  values: T[],
): Promise<void> {
  const stored = await Promise.all(
    values.map(async (value) => ({ id: value.id, personId: value.personId, enc: await encryptJson(key, value) })),
  );
  await putMany(store, stored);
}

async function loadSecrets<T>(key: CryptoKey, store: SecretStore): Promise<T[]> {
  const stored = await getAll<StoredSecret>(store);
  return Promise.all(stored.map((record) => decryptJson<T>(key, record.enc)));
}

export type DerivedRecord =
  | ({ id: string; kind: "analysis" } & CachedAnalysis)
  | ({ id: string; kind: "talking" } & TalkingPoints)
  | { id: string; personId: string; kind: "recap"; noteId: string; text: string };

export const analysisId = (noteId: string) => `analysis:${noteId}`;
export const recapId = (noteId: string) => `recap:${noteId}`;
export const talkingId = (personId: string) => `talking:${personId}`;

export async function savePulses(key: CryptoKey, ratings: PulseRating[]): Promise<void> {
  await saveSecret(key, "teamPulse", ratings);
}

export async function deletePulse(id: string): Promise<void> {
  await remove("teamPulse", id);
}

export async function saveCoaching(key: CryptoKey, items: CoachingItem[]): Promise<void> {
  await saveSecret(key, "teamCoaching", items);
}

export async function deleteCoaching(id: string): Promise<void> {
  await remove("teamCoaching", id);
}

export async function deleteDerivedRecord(id: string): Promise<void> {
  await remove("teamDerived", id);
}

export async function saveDerived(key: CryptoKey, records: DerivedRecord[]): Promise<void> {
  await saveSecret(key, "teamDerived", records);
}

export async function loadTeamData(key: CryptoKey): Promise<{
  notes: TeamNote[];
  items: ActionItem[];
  moments: Moment[];
  pulses: PulseRating[];
  coaching: CoachingItem[];
  derived: DerivedRecord[];
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
    pulses: await loadSecrets<PulseRating>(key, "teamPulse"),
    coaching: await loadSecrets<CoachingItem>(key, "teamCoaching"),
    derived: await loadSecrets<DerivedRecord>(key, "teamDerived"),
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
