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
import { fetchAiStatus, noteContentForAi, runAi, type AiStatus } from "./ai-client";
import { createVault, unlockVault } from "./crypto";
import {
  analysesFrom,
  coachingInput,
  fallbackCoaching,
  fallbackTalkingPoints,
  notesNeedingAnalysis,
  personView,
  talkingPointsInput,
  type TeamSnapshot,
} from "./insights";
import { clampScore } from "./pulse";
import { classifyMomentRule } from "./rules";
import { shouldHighlightDigest } from "./digest";
import { DEMO_MOMENTS, DEMO_NOTES, DEMO_PEOPLE, demoItems } from "./seed";
import {
  deleteItem as deleteItemRecord,
  deleteMoment as deleteMomentRecord,
  analysisId,
  deleteCoaching,
  deleteItems,
  deletePersonCascade,
  deleteDerivedRecord,
  deletePulse,
  recapId,
  saveCoaching,
  saveDerived,
  savePulses,
  talkingId,
  type DerivedRecord,
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
  resetTeamVault,
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
  CoachingItem,
  Moment,
  MomentType,
  OwnerKind,
  PulseRating,
  PulseScores,
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
  /** Forgot passphrase: wipe encrypted Team data, then ask for a new passphrase and re-sync. */
  resetTeam: () => Promise<void>;
  /** True between a reset and the first sync after the new passphrase. */
  resetPending: boolean;
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
  addMoment: (input: {
    personId: string;
    date: string;
    text: string;
    tag: string;
    type: MomentType | "auto";
  }) => Promise<void>;
  removeMoment: (id: string) => Promise<void>;
  setMomentType: (id: string, type: MomentType) => Promise<void>;
  pulses: PulseRating[];
  coaching: CoachingItem[];
  derived: Record<string, DerivedRecord>;
  ai: AiStatus;
  aiBusy: boolean;
  addPulse: (personId: string, date: string, scores: PulseScores) => Promise<void>;
  removePulse: (id: string) => Promise<void>;
  addCoaching: (personId: string, text: string) => Promise<void>;
  updateCoaching: (id: string, patch: Partial<Pick<CoachingItem, "text" | "done">>) => Promise<void>;
  removeCoaching: (id: string) => Promise<void>;
  suggestCoaching: (personId: string) => Promise<number>;
  regenerateTalkingPoints: (personId: string) => Promise<void>;
  saveRecap: (noteId: string, personId: string, text: string) => Promise<void>;
  resetRecap: (noteId: string) => Promise<void>;
  analyzeNotes: () => Promise<void>;
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

/** Ollama counts only when it is running and the model is pulled; otherwise rules. */
function aiUsable(status: AiStatus): boolean {
  if (status.provider === "off") return false;
  return status.provider !== "ollama" || status.health === "ready";
}

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
  const [pulses, setPulses] = useState<PulseRating[]>([]);
  const [coaching, setCoaching] = useState<CoachingItem[]>([]);
  const [derived, setDerived] = useState<Record<string, DerivedRecord>>({});
  const [ai, setAi] = useState<AiStatus>({ provider: "off", model: "" });
  const [aiBusy, setAiBusy] = useState(false);
  const derivedRef = useRef<Record<string, DerivedRecord>>({});
  const aiRef = useRef<AiStatus>({ provider: "off", model: "" });
  const analyzing = useRef(false);
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
    derivedRef.current = derived;
  }, [derived]);

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
    void fetchAiStatus().then((status) => {
      if (cancelled) return;
      aiRef.current = status;
      setAi(status);
    });
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      cancelled = true;
      clearInterval(tick);
    };
  }, []);

  /** Re-derive note-backed items (ownership, new and stale items) and persist. */
  const rederive = useCallback(
    async (sessionKey: CryptoKey, input: { notes: TeamNote[]; people: Person[]; selfName: string }) => {
      const result = deriveItems({
        ...input,
        items: itemsRef.current,
        analyses: analysesFrom(derivedRef.current),
      });
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
      const derivedMap = Object.fromEntries(data.derived.map((record) => [record.id, record]));
      derivedRef.current = derivedMap;
      setNotes(data.notes);
      setItems(data.items);
      setMoments(data.moments);
      setPulses(data.pulses);
      setCoaching(data.coaching);
      setDerived(derivedMap);
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

  const resyncAfterReset = useRef(false);
  const [resetPending, setResetPending] = useState(false);

  const lock = useCallback(() => {
    setKey(null);
    setNotes([]);
    setItems([]);
    setMoments([]);
    setPulses([]);
    setCoaching([]);
    setDerived({});
    derivedRef.current = {};
  }, []);

  const resetTeam = useCallback<TeamState["resetTeam"]>(async () => {
    await resetTeamVault();
    lock();
    itemsRef.current = [];
    notesRef.current = [];
    const cleared = peopleRef.current.map((person) => ({ ...person, lastSync: null }));
    peopleRef.current = cleared;
    setPeople(cleared);
    setVault(null);
    resyncAfterReset.current = true;
    setResetPending(true);
  }, [lock]);

  const putDerived = useCallback(async (sessionKey: CryptoKey, records: DerivedRecord[]) => {
    if (records.length === 0) return;
    await saveDerived(sessionKey, records);
    const next = { ...derivedRef.current };
    for (const record of records) next[record.id] = record;
    derivedRef.current = next;
    setDerived(next);
  }, []);

  /**
   * One AI pass per note (cached by note id + updatedAt, encrypted). Skipped
   * when AI is off; rules cover everything then. Manual edits still win
   * because deriveItems keeps edited items.
   */
  const analyzePending = useCallback(
    async (sessionKey: CryptoKey) => {
      if (!aiUsable(aiRef.current) || analyzing.current) return;
      const pending = notesNeedingAnalysis(notesRef.current, derivedRef.current);
      if (pending.length === 0) return;
      analyzing.current = true;
      setAiBusy(true);
      try {
        for (const note of pending) {
          const person = peopleRef.current.find((entry) => entry.id === note.personId);
          if (!person) continue;
          const content = noteContentForAi(note);
          if (!content.trim()) continue;
          const response = await runAi("analyzeNote", {
            selfName: selfNameRef.current || note.ownerName || "",
            personName: person.name,
            role: person.role,
            title: note.title,
            meetingAt: note.meetingAt,
            content,
          });
          if (!response) continue;
          await putDerived(sessionKey, [
            {
              id: analysisId(note.id),
              kind: "analysis",
              noteId: note.id,
              personId: note.personId,
              noteUpdatedAt: note.updatedAt,
              provider: response.provider,
              analysis: response.result,
            },
          ]);
        }
        await rederive(sessionKey, {
          notes: notesRef.current,
          people: peopleRef.current,
          selfName: selfNameRef.current,
        });
      } finally {
        analyzing.current = false;
        setAiBusy(false);
      }
    },
    [putDerived, rederive],
  );

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
    setPulses((prev) => prev.filter((rating) => rating.personId !== id));
    setCoaching((prev) => prev.filter((item) => item.personId !== id));
    const nextDerived = Object.fromEntries(
      Object.entries(derivedRef.current).filter(([, record]) => record.personId !== id),
    );
    derivedRef.current = nextDerived;
    setDerived(nextDerived);
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
        void analyzePending(key);
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
    [key, rederive, analyzePending],
  );

  // After a reset and a new passphrase, pull every Granola note again.
  useEffect(() => {
    if (!key || !resyncAfterReset.current) return;
    resyncAfterReset.current = false;
    const timer = setTimeout(() => {
      void syncNow().finally(() => setResetPending(false));
    }, 0);
    return () => clearTimeout(timer);
  }, [key, syncNow]);

  // AI pass on unlock too (covers notes synced while AI was off, and demo notes).
  useEffect(() => {
    if (!key || !aiUsable(ai)) return;
    const timer = setTimeout(() => void analyzePending(key), 500);
    return () => clearTimeout(timer);
  }, [key, ai, analyzePending]);

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
      let type: MomentType = input.type === "auto" ? classifyMomentRule(input.text, input.tag) : input.type;
      if (input.type === "auto" && aiUsable(aiRef.current)) {
        const response = await runAi("classifyMoment", { text: input.text.trim(), tag: input.tag.trim() });
        if (response) type = response.result.type;
      }
      const moment: Moment = {
        id: newId("moment"),
        personId: input.personId,
        date: input.date,
        text: input.text.trim(),
        tag: input.tag.trim(),
        type,
        typeEdited: input.type !== "auto",
        createdAt: stamp(),
      };
      setMoments((prev) => [...prev, moment]);
      await saveMoment(key, moment);
    },
    [key],
  );

  const setMomentType = useCallback<TeamState["setMomentType"]>(
    async (id, type) => {
      if (!key) return;
      let updated: Moment | undefined;
      setMoments((prev) =>
        prev.map((moment) => {
          if (moment.id !== id) return moment;
          updated = { ...moment, type, typeEdited: true };
          return updated;
        }),
      );
      if (updated) await saveMoment(key, updated);
    },
    [key],
  );

  const addPulse = useCallback<TeamState["addPulse"]>(
    async (personId, date, scores) => {
      if (!key) return;
      const rating: PulseRating = {
        id: newId("pulse"),
        personId,
        date,
        scores: {
          engagement: clampScore(scores.engagement),
          workload: clampScore(scores.workload),
          growth: clampScore(scores.growth),
          relationship: clampScore(scores.relationship),
          delivery: clampScore(scores.delivery),
        },
        createdAt: stamp(),
      };
      setPulses((prev) => [...prev, rating]);
      await savePulses(key, [rating]);
    },
    [key],
  );

  const removePulse = useCallback<TeamState["removePulse"]>(async (id) => {
    setPulses((prev) => prev.filter((rating) => rating.id !== id));
    await deletePulse(id);
  }, []);

  const addCoachingItems = useCallback(
    async (personId: string, texts: string[], source: CoachingItem["source"]) => {
      if (!key || texts.length === 0) return;
      const created = texts.map((text, index) => ({
        id: newId("coach"),
        personId,
        text: text.trim(),
        done: false,
        source,
        createdAt: new Date(Date.now() + index).toISOString(),
      }));
      setCoaching((prev) => [...prev, ...created]);
      await saveCoaching(key, created);
    },
    [key],
  );

  const addCoaching = useCallback<TeamState["addCoaching"]>(
    async (personId, text) => {
      if (text.trim()) await addCoachingItems(personId, [text], "manual");
    },
    [addCoachingItems],
  );

  const updateCoaching = useCallback<TeamState["updateCoaching"]>(
    async (id, patch) => {
      if (!key) return;
      let updated: CoachingItem | undefined;
      setCoaching((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          updated = { ...item, ...patch };
          return updated;
        }),
      );
      if (updated) await saveCoaching(key, [updated]);
    },
    [key],
  );

  const removeCoaching = useCallback<TeamState["removeCoaching"]>(async (id) => {
    setCoaching((prev) => prev.filter((item) => item.id !== id));
    await deleteCoaching(id);
  }, []);

  const snapshotRef = useRef<TeamSnapshot>({
    notes: [],
    items: [],
    moments: [],
    pulses: [],
    coaching: [],
    derived: {},
  });
  useEffect(() => {
    snapshotRef.current = { notes, items, moments, pulses, coaching, derived };
  }, [notes, items, moments, pulses, coaching, derived]);

  const suggestCoaching = useCallback<TeamState["suggestCoaching"]>(
    async (personId) => {
      const person = peopleRef.current.find((entry) => entry.id === personId);
      if (!key || !person) return 0;
      const view = personView(personId, snapshotRef.current);
      let suggestions: string[] = [];
      let source: CoachingItem["source"] = "rules";
      if (aiUsable(aiRef.current)) {
        setAiBusy(true);
        const response = await runAi("coachingPlan", coachingInput(person, view));
        setAiBusy(false);
        if (response) {
          suggestions = response.result.items;
          source = "ai";
        }
      }
      if (suggestions.length === 0) suggestions = fallbackCoaching(view);
      const existing = new Set(view.coaching.map((item) => item.text.toLowerCase()));
      const fresh = suggestions.filter((text) => !existing.has(text.toLowerCase()));
      await addCoachingItems(personId, fresh, source);
      return fresh.length;
    },
    [key, addCoachingItems],
  );

  const regenerateTalkingPoints = useCallback<TeamState["regenerateTalkingPoints"]>(
    async (personId) => {
      const person = peopleRef.current.find((entry) => entry.id === personId);
      if (!key || !person) return;
      const view = personView(personId, snapshotRef.current);
      let points: string[] | null = null;
      let provider: AiStatus["provider"] | "rules" = "rules";
      if (aiUsable(aiRef.current)) {
        setAiBusy(true);
        const response = await runAi("talkingPoints", talkingPointsInput(person, view, selfNameRef.current));
        setAiBusy(false);
        if (response) {
          points = response.result.points;
          provider = response.provider;
        }
      }
      if (!points) points = fallbackTalkingPoints(person, view);
      await putDerived(key, [
        { id: talkingId(personId), kind: "talking", personId, points, generatedAt: stamp(), provider },
      ]);
    },
    [key, putDerived],
  );

  const saveRecap = useCallback<TeamState["saveRecap"]>(
    async (noteId, personId, text) => {
      if (!key) return;
      await putDerived(key, [{ id: recapId(noteId), kind: "recap", noteId, personId, text }]);
    },
    [key, putDerived],
  );

  const resetRecap = useCallback<TeamState["resetRecap"]>(async (noteId) => {
    const next = { ...derivedRef.current };
    delete next[recapId(noteId)];
    derivedRef.current = next;
    setDerived(next);
    await deleteDerivedRecord(recapId(noteId));
  }, []);

  const analyzeNotes = useCallback<TeamState["analyzeNotes"]>(async () => {
    if (key) await analyzePending(key);
  }, [key, analyzePending]);

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
      resetTeam,
      resetPending,
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
      setMomentType,
      pulses,
      coaching,
      derived,
      ai,
      aiBusy,
      addPulse,
      removePulse,
      addCoaching,
      updateCoaching,
      removeCoaching,
      suggestCoaching,
      regenerateTalkingPoints,
      saveRecap,
      resetRecap,
      analyzeNotes,
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
      resetTeam,
      resetPending,
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
      setMomentType,
      pulses,
      coaching,
      derived,
      ai,
      aiBusy,
      addPulse,
      removePulse,
      addCoaching,
      updateCoaching,
      removeCoaching,
      suggestCoaching,
      regenerateTalkingPoints,
      saveRecap,
      resetRecap,
      analyzeNotes,
    ],
  );

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export function useTeam(): TeamState {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error("useTeam must be used inside TeamProvider");
  return ctx;
}
