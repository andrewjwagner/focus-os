"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createVault, unlockVault } from "./crypto";
import { shouldHighlightDigest } from "./digest";
import { DEMO_MOMENTS, DEMO_NOTES, DEMO_PEOPLE, demoItems } from "./seed";
import {
  deleteItem as deleteItemRecord,
  deleteMoment as deleteMomentRecord,
  deleteItems,
  deletePersonCascade,
  loadDigestViewedAt,
  loadSelfName,
  loadPeople,
  loadTeamData,
  loadVaultMeta,
  saveDigestViewedAt,
  saveItems,
  saveMoment,
  saveNotes,
  savePerson,
  saveSelfName,
  saveVaultMeta,
} from "./store-idb";
import {
  SYNC_INTERVAL_MS,
  buildSyncTargets,
  deriveItems,
  mergeSyncResponse,
  type SyncResponse,
} from "./sync";
import type {
  ActionItem,
  Moment,
  OwnerKind,
  Person,
  TeamNote,
  TeamRole,
  VaultMeta,
} from "./types";

export type SyncStatus = {
  running: boolean;
  lastRunAt: string | null;
  message: string | null;
  error: string | null;
};

type PersonInput = { name: string; role: TeamRole; granolaFolderName: string };

type TeamState = {
  ready: boolean;
  hasVault: boolean;
  unlocked: boolean;
  people: Person[];
  notes: TeamNote[];
  items: ActionItem[];
  moments: Moment[];
  sync: SyncStatus;
  digestHighlighted: boolean;
  selfName: string;
  setSelfName: (name: string) => Promise<void>;
  setPassphrase: (passphrase: string) => Promise<void>;
  unlock: (passphrase: string) => Promise<boolean>;
  lock: () => void;
  addPerson: (input: PersonInput) => Promise<void>;
  updatePerson: (id: string, input: PersonInput) => Promise<void>;
  removePerson: (id: string) => Promise<void>;
  loadDemoTeam: () => Promise<void>;
  syncNow: (options?: { ifOlderThanMs?: number }) => Promise<void>;
  updateItem: (id: string, patch: Partial<Pick<ActionItem, "text" | "due" | "done">>) => Promise<void>;
  setItemOwner: (id: string, kind: OwnerKind, name?: string) => Promise<void>;
  addItem: (personId: string, text: string) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  addMoment: (input: { personId: string; date: string; text: string; tag: string }) => Promise<void>;
  removeMoment: (id: string) => Promise<void>;
  markDigestViewed: () => Promise<void>;
};

const TeamContext = createContext<TeamState | null>(null);

const SYNC_ERRORS: Record<string, string> = {
  not_configured: "Granola is not connected. Set GRANOLA_API_KEY in .env.local to sync.",
  unauthorized: "Granola rejected the API key. Check GRANOLA_API_KEY.",
  rate_limited: "Granola rate limit hit. Try again in a minute.",
  upstream_error: "Granola sync failed. Try again later.",
  bad_request: "Sync request was invalid. Check folder names in Team settings.",
};

function stamp() {
  return new Date().toISOString();
}

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function TeamProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [vault, setVault] = useState<VaultMeta | null>(null);
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [notes, setNotes] = useState<TeamNote[]>([]);
  const [items, setItems] = useState<ActionItem[]>([]);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [digestViewedAt, setDigestViewedAt] = useState<string | null>(null);
  const [selfName, setSelfNameState] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [sync, setSync] = useState<SyncStatus>({
    running: false,
    lastRunAt: null,
    message: null,
    error: null,
  });
  const syncing = useRef(false);
  const lastSyncRun = useRef(0);
  const peopleRef = useRef<Person[]>([]);
  const itemsRef = useRef<ActionItem[]>([]);
  const notesRef = useRef<TeamNote[]>([]);
  const selfNameRef = useRef("");

  useEffect(() => {
    peopleRef.current = people;
  }, [people]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);
  useEffect(() => {
    selfNameRef.current = selfName;
  }, [selfName]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadVaultMeta(), loadPeople(), loadDigestViewedAt(), loadSelfName()]).then(
      ([meta, loadedPeople, viewed, name]) => {
        if (cancelled) return;
        setVault(meta);
        setPeople(loadedPeople);
        setDigestViewedAt(viewed);
        setSelfNameState(name);
        setReady(true);
      },
    );
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      cancelled = true;
      clearInterval(tick);
    };
  }, []);

  /** Re-derive note-backed items (ownership, new and stale items) and persist. */
  const rederive = useCallback(
    async (sessionKey: CryptoKey, input: { notes: TeamNote[]; people: Person[]; selfName: string }) => {
      const result = deriveItems({ ...input, items: itemsRef.current });
      if (result.upserts.length === 0 && result.deletes.length === 0) return;
      await saveItems(sessionKey, result.upserts);
      await deleteItems(result.deletes);
      const gone = new Set(result.deletes);
      const changed = new Map(result.upserts.map((item) => [item.id, item]));
      setItems((prev) => {
        const kept = prev.filter((item) => !gone.has(item.id)).map((item) => changed.get(item.id) ?? item);
        const known = new Set(kept.map((item) => item.id));
        return [...kept, ...result.upserts.filter((item) => !known.has(item.id))];
      });
    },
    [],
  );

  const hydrate = useCallback(
    async (sessionKey: CryptoKey) => {
      const data = await loadTeamData(sessionKey);
      itemsRef.current = data.items;
      notesRef.current = data.notes;
      setNotes(data.notes);
      setItems(data.items);
      setMoments(data.moments);
      await rederive(sessionKey, {
        notes: data.notes,
        people: peopleRef.current,
        selfName: selfNameRef.current,
      });
    },
    [rederive],
  );

  const setSelfName = useCallback<TeamState["setSelfName"]>(
    async (name) => {
      const trimmed = name.trim();
      setSelfNameState(trimmed);
      selfNameRef.current = trimmed;
      await saveSelfName(trimmed);
      if (key) {
        await rederive(key, { notes: notesRef.current, people: peopleRef.current, selfName: trimmed });
      }
    },
    [key, rederive],
  );

  const setPassphrase = useCallback<TeamState["setPassphrase"]>(
    async (passphrase) => {
      const created = await createVault(passphrase);
      await saveVaultMeta(created.meta);
      setVault(created.meta);
      setKey(created.key);
      await hydrate(created.key);
    },
    [hydrate],
  );

  const unlock = useCallback<TeamState["unlock"]>(
    async (passphrase) => {
      if (!vault) return false;
      const sessionKey = await unlockVault(passphrase, vault);
      if (!sessionKey) return false;
      await hydrate(sessionKey);
      setKey(sessionKey);
      return true;
    },
    [hydrate, vault],
  );

  const lock = useCallback(() => {
    setKey(null);
    setNotes([]);
    setItems([]);
    setMoments([]);
  }, []);

  const addPerson = useCallback<TeamState["addPerson"]>(async (input) => {
    const person: Person = {
      id: newId("person"),
      name: input.name.trim(),
      role: input.role,
      granolaFolderName: input.granolaFolderName.trim(),
      createdAt: stamp(),
      lastSync: null,
    };
    setPeople((prev) => [...prev, person]);
    await savePerson(person);
  }, []);

  const updatePerson = useCallback<TeamState["updatePerson"]>(async (id, input) => {
    const current = peopleRef.current.find((person) => person.id === id);
    if (!current) return;
    const folderChanged = current.granolaFolderName !== input.granolaFolderName.trim();
    const next: Person = {
      ...current,
      name: input.name.trim(),
      role: input.role,
      granolaFolderName: input.granolaFolderName.trim(),
      lastSync: folderChanged ? null : current.lastSync,
    };
    setPeople((prev) => prev.map((person) => (person.id === id ? next : person)));
    await savePerson(next);
  }, []);

  const removePerson = useCallback<TeamState["removePerson"]>(async (id) => {
    setPeople((prev) => prev.filter((person) => person.id !== id));
    setNotes((prev) => prev.filter((note) => note.personId !== id));
    setItems((prev) => prev.filter((item) => item.personId !== id));
    setMoments((prev) => prev.filter((moment) => moment.personId !== id));
    await deletePersonCascade(id);
  }, []);

  const loadDemoTeam = useCallback<TeamState["loadDemoTeam"]>(async () => {
    if (!key) return;
    const existing = new Set(peopleRef.current.map((person) => person.id));
    const fresh = DEMO_PEOPLE.filter((person) => !existing.has(person.id));
    if (fresh.length === 0) return;
    const ids = new Set(fresh.map((person) => person.id));
    const demoNotes = DEMO_NOTES.filter((note) => ids.has(note.personId));
    const demoItemList = demoItems().filter((item) => ids.has(item.personId));
    const demoMoments = DEMO_MOMENTS.filter((moment) => ids.has(moment.personId));
    for (const person of fresh) await savePerson(person);
    await saveNotes(key, demoNotes);
    await saveItems(key, demoItemList);
    for (const moment of demoMoments) await saveMoment(key, moment);
    setPeople((prev) => [...prev, ...fresh]);
    setNotes((prev) => [...prev, ...demoNotes]);
    setItems((prev) => [...prev, ...demoItemList]);
    setMoments((prev) => [...prev, ...demoMoments]);
  }, [key]);

  const syncNow = useCallback<TeamState["syncNow"]>(
    async (options) => {
      if (!key || syncing.current) return;
      if (options?.ifOlderThanMs && Date.now() - lastSyncRun.current < options.ifOlderThanMs) {
        return;
      }
      const currentPeople = peopleRef.current;
      const targets = buildSyncTargets(currentPeople, notesRef.current);
      if (targets.length === 0) return;
      syncing.current = true;
      lastSyncRun.current = Date.now();
      setSync((prev) => ({ ...prev, running: true, error: null }));
      try {
        const response = await fetch("/api/granola/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targets }),
        });
        const data = (await response.json()) as SyncResponse;
        if (!data.ok) {
          setSync({
            running: false,
            lastRunAt: stamp(),
            message: null,
            error: SYNC_ERRORS[data.reason] ?? SYNC_ERRORS.upstream_error,
          });
          return;
        }
        const merged = mergeSyncResponse(data, currentPeople);
        await saveNotes(key, merged.notes);
        for (const person of merged.people) {
          if (person.lastSync !== currentPeople.find((p) => p.id === person.id)?.lastSync) {
            await savePerson(person);
          }
        }
        const noteIds = new Set(merged.notes.map((note) => note.id));
        const allNotes = [
          ...notesRef.current.filter((note) => !noteIds.has(note.id)),
          ...merged.notes,
        ];
        notesRef.current = allNotes;
        setNotes(allNotes);
        // Re-derive ownership for every stored note, not just new ones.
        await rederive(key, { notes: allNotes, people: merged.people, selfName: selfNameRef.current });
        setPeople((prev) =>
          prev.map((person) => merged.people.find((p) => p.id === person.id) ?? person),
        );
        const total = Object.values(merged.counts).reduce((sum, count) => sum + count, 0);
        setSync({
          running: false,
          lastRunAt: stamp(),
          message:
            merged.missingFolders.length > 0
              ? `Synced ${total} note${total === 1 ? "" : "s"}. Folder not found for ${merged.missingFolders.length} person${merged.missingFolders.length === 1 ? "" : "s"}.`
              : `Synced ${total} new or updated note${total === 1 ? "" : "s"}.`,
          error: null,
        });
      } catch {
        setSync({
          running: false,
          lastRunAt: stamp(),
          message: null,
          error: SYNC_ERRORS.upstream_error,
        });
      } finally {
        syncing.current = false;
      }
    },
    [key, rederive],
  );

  // Background sync every 30 minutes while the app is open and unlocked.
  useEffect(() => {
    if (!key) return;
    const timer = setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [key, syncNow]);

  const updateItem = useCallback<TeamState["updateItem"]>(
    async (id, patch) => {
      if (!key) return;
      const current = itemsRef.current.find((item) => item.id === id);
      if (!current) return;
      const next = { ...current, ...patch, edited: true };
      setItems((prev) => prev.map((item) => (item.id === id ? next : item)));
      await saveItems(key, [next]);
    },
    [key],
  );

  const setItemOwner = useCallback<TeamState["setItemOwner"]>(
    async (id, kind, name) => {
      if (!key) return;
      const current = itemsRef.current.find((item) => item.id === id);
      if (!current) return;
      const person = peopleRef.current.find((entry) => entry.id === current.personId);
      const owner =
        kind === "me" ? "me" : kind === "them" ? (person?.name ?? "") : kind === "other" ? (name ?? "").trim() : "";
      const next: ActionItem = { ...current, ownerKind: kind, owner, ownerEdited: true };
      setItems((prev) => prev.map((item) => (item.id === id ? next : item)));
      await saveItems(key, [next]);
    },
    [key],
  );

  const addItem = useCallback<TeamState["addItem"]>(
    async (personId, text) => {
      if (!key || !text.trim()) return;
      const item: ActionItem = {
        id: newId("item"),
        personId,
        noteId: null,
        text: text.trim(),
        detail: "",
        ownerKind: "unassigned",
        owner: "",
        ownerHint: "",
        ownerEdited: false,
        edited: true,
        due: null,
        done: false,
        createdAt: stamp(),
      };
      setItems((prev) => [...prev, item]);
      await saveItems(key, [item]);
    },
    [key],
  );

  const removeItem = useCallback<TeamState["removeItem"]>(async (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    await deleteItemRecord(id);
  }, []);

  const addMoment = useCallback<TeamState["addMoment"]>(
    async (input) => {
      if (!key || !input.text.trim()) return;
      const moment: Moment = {
        id: newId("moment"),
        personId: input.personId,
        date: input.date,
        text: input.text.trim(),
        tag: input.tag.trim(),
        createdAt: stamp(),
      };
      setMoments((prev) => [...prev, moment]);
      await saveMoment(key, moment);
    },
    [key],
  );

  const removeMoment = useCallback<TeamState["removeMoment"]>(async (id) => {
    setMoments((prev) => prev.filter((moment) => moment.id !== id));
    await deleteMomentRecord(id);
  }, []);

  const markDigestViewed = useCallback(async () => {
    const viewed = stamp();
    setDigestViewedAt(viewed);
    await saveDigestViewedAt(viewed);
  }, []);

  const digestHighlighted = ready && shouldHighlightDigest(now, digestViewedAt);

  const value = useMemo<TeamState>(
    () => ({
      ready,
      hasVault: Boolean(vault),
      unlocked: Boolean(key),
      people,
      notes,
      items,
      moments,
      sync,
      digestHighlighted,
      selfName,
      setSelfName,
      setPassphrase,
      unlock,
      lock,
      addPerson,
      updatePerson,
      removePerson,
      loadDemoTeam,
      syncNow,
      updateItem,
      setItemOwner,
      addItem,
      removeItem,
      addMoment,
      removeMoment,
      markDigestViewed,
    }),
    [
      ready,
      vault,
      key,
      people,
      notes,
      items,
      moments,
      sync,
      digestHighlighted,
      selfName,
      setSelfName,
      setPassphrase,
      unlock,
      lock,
      addPerson,
      updatePerson,
      removePerson,
      loadDemoTeam,
      syncNow,
      updateItem,
      setItemOwner,
      addItem,
      removeItem,
      addMoment,
      removeMoment,
      markDigestViewed,
    ],
  );

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export function useTeam(): TeamState {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error("useTeam must be used inside TeamProvider");
  return ctx;
}
