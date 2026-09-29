import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { DB_NAME, DB_VERSION } from "../constants";
import { getAll, getOne, loadSnapshot, put, resetDbCache, TEAM_STORES } from "../idb";
import { createVault } from "./crypto";
import { DEMO_MOMENTS, DEMO_NOTES, DEMO_PEOPLE, demoItems } from "./seed";
import {
  deletePersonCascade,
  ENCRYPTED_TEAM_STORES,
  loadPeople,
  loadSelfName,
  loadTeamData,
  loadVaultMeta,
  resetTeamVault,
  saveSelfName,
  saveVaultMeta,
  saveCoaching,
  saveDerived,
  savePulses,
  saveItems,
  saveMoment,
  saveNotes,
  savePerson,
  type StoredMoment,
  type StoredNote,
} from "./store-idb";

function deleteDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

/** Build a v2 database the way the previous release left it. */
function createV2WithData(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("projects", { keyPath: "id" });
      db.createObjectStore("thoughts", { keyPath: "id" });
      db.createObjectStore("lanes", { keyPath: "id" });
      const meta = db.createObjectStore("meta", { keyPath: "key" });
      meta.put({ key: "seeded", value: "v1" });
      request.transaction!.objectStore("projects").put({
        id: "proj-keep",
        name: "Keep me",
        domain: "Work",
        status: "active",
        outcome: "",
        nextAction: "",
        focusNext: false,
        focusOrder: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      request.transaction!.objectStore("thoughts").put({
        id: "idea-keep",
        kind: "idea",
        body: "Keep this thought",
        domain: "Ideas",
        projectId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

beforeEach(async () => {
  resetDbCache();
  await deleteDb();
});

/** Build a v3 database (first Team release) with a configured person. */
function createV3WithPerson(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ["projects", "thoughts", "lanes", "teamPeople", "teamNotes", "teamItems", "teamMoments"]) {
        db.createObjectStore(name, { keyPath: "id" });
      }
      db.createObjectStore("meta", { keyPath: "key" }).put({ key: "seeded", value: "v1" });
      request.transaction!.objectStore("teamPeople").put({ ...DEMO_PEOPLE[0] });
      request.transaction!.objectStore("projects").put({ id: "proj-keep", name: "Keep me" });
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

describe("IndexedDB migrations", () => {
  it("v2 to v4: adds Team stores and keeps existing data", async () => {
    await createV2WithData();
    const snap = await loadSnapshot();
    expect(DB_VERSION).toBe(4);
    expect(snap.projects.map((project) => project.id)).toEqual(["proj-keep"]);
    expect(snap.thoughts.map((thought) => thought.body)).toEqual(["Keep this thought"]);
    for (const store of TEAM_STORES) {
      expect(await getAll(store)).toEqual([]);
    }
  });

  it("v3 to v4: adds pulse, coaching, and derived stores and keeps people", async () => {
    await createV3WithPerson();
    const snap = await loadSnapshot();
    expect(snap.projects.map((project) => project.id)).toEqual(["proj-keep"]);
    expect(await getAll("teamPeople")).toHaveLength(1);
    for (const store of ["teamPulse", "teamCoaching", "teamDerived"] as const) {
      expect(await getAll(store)).toEqual([]);
    }
  });
});

describe("encrypted Team storage", () => {
  it("stores note content and moments as ciphertext and decrypts with the key", async () => {
    const { key } = await createVault("correct horse battery", 1000);
    for (const person of DEMO_PEOPLE) await savePerson(person);
    await saveNotes(key, DEMO_NOTES);
    await saveItems(key, demoItems());
    for (const moment of DEMO_MOMENTS) await saveMoment(key, moment);

    const rawNotes = await getAll<StoredNote>("teamNotes");
    const rawMoments = await getAll<StoredMoment>("teamMoments");
    const rawBlob = JSON.stringify([rawNotes, rawMoments, await getAll("teamItems")]);
    expect(rawBlob).not.toContain("Onboarding");
    expect(rawBlob).not.toContain("team demo");
    expect(rawBlob).not.toContain("shorter onboarding form");

    const data = await loadTeamData(key);
    expect(data.notes.map((note) => note.id).sort()).toEqual(DEMO_NOTES.map((note) => note.id).sort());
    expect(data.moments[0].text).toBe(DEMO_MOMENTS[0].text);
    expect(data.items.length).toBe(demoItems().length);

    const { key: otherKey } = await createVault("another passphrase", 1000);
    await expect(loadTeamData(otherKey)).rejects.toThrow();
  });

  it("upserts notes by id and cascades person deletes", async () => {
    const { key } = await createVault("correct horse battery", 1000);
    for (const person of DEMO_PEOPLE) await savePerson(person);
    await saveNotes(key, DEMO_NOTES);
    await saveNotes(key, [{ ...DEMO_NOTES[0], title: "Renamed" }]);
    let data = await loadTeamData(key);
    expect(data.notes).toHaveLength(DEMO_NOTES.length);
    expect(data.notes.find((note) => note.id === DEMO_NOTES[0].id)?.title).toBe("Renamed");

    await deletePersonCascade("person-demo-alex");
    data = await loadTeamData(key);
    expect(data.notes.every((note) => note.personId === "person-demo-sam")).toBe(true);
    expect(await getAll("teamPeople")).toHaveLength(1);
  });

  it("encrypts pulse ratings, coaching items, and AI results, and cascades deletes", async () => {
    const { key } = await createVault("correct horse battery", 1000);
    const personId = DEMO_PEOPLE[0].id;
    await savePulses(key, [
      {
        id: "pulse-1",
        personId,
        date: "2026-03-01",
        scores: { engagement: 7, workload: 4, growth: 6, relationship: 8, delivery: 7 },
        createdAt: "",
      },
    ]);
    await saveCoaching(key, [
      { id: "coach-1", personId, text: "Practice crisp status updates", done: false, source: "manual", createdAt: "" },
    ]);
    await saveDerived(key, [
      { id: "recap:n1", kind: "recap", noteId: "n1", personId, text: "Secret recap body" },
    ]);
    const raw = JSON.stringify([await getAll("teamPulse"), await getAll("teamCoaching"), await getAll("teamDerived")]);
    expect(raw).not.toContain("crisp status");
    expect(raw).not.toContain("Secret recap");
    expect(raw).not.toContain("workload");

    const data = await loadTeamData(key);
    expect(data.pulses[0].scores.workload).toBe(4);
    expect(data.coaching[0].text).toBe("Practice crisp status updates");
    expect(data.derived[0]).toMatchObject({ kind: "recap", text: "Secret recap body" });

    await deletePersonCascade(personId);
    const after = await loadTeamData(key);
    expect([after.pulses.length, after.coaching.length, after.derived.length]).toEqual([0, 0, 0]);
  });
});

describe("forgot passphrase reset", () => {
  async function fillEverything() {
    // Capture data (fictional).
    await createV2WithData();
    await loadSnapshot();
    await put("lanes", { id: "lane-keep", name: "Keep lane" });
    await put("meta", { key: "capture.pref", value: "keep" });
    // Team data encrypted with the old key.
    const { key, meta } = await createVault("forgotten passphrase", 1000);
    await saveVaultMeta(meta);
    await saveSelfName("Jordan Park");
    for (const person of DEMO_PEOPLE) await savePerson({ ...person, lastSync: "2026-03-01T00:00:00.000Z" });
    await saveNotes(key, DEMO_NOTES);
    await saveItems(key, demoItems());
    for (const moment of DEMO_MOMENTS) await saveMoment(key, moment);
    await savePulses(key, [
      {
        id: "pulse-1",
        personId: DEMO_PEOPLE[0].id,
        date: "2026-03-01",
        scores: { engagement: 7, workload: 4, growth: 6, relationship: 8, delivery: 7 },
        createdAt: "",
      },
    ]);
    await saveCoaching(key, [
      { id: "coach-1", personId: DEMO_PEOPLE[0].id, text: "Practice", done: false, source: "manual", createdAt: "" },
    ]);
    await saveDerived(key, [{ id: "recap:n1", kind: "recap", noteId: "n1", personId: DEMO_PEOPLE[0].id, text: "Draft" }]);
    for (const store of ENCRYPTED_TEAM_STORES) expect((await getAll(store)).length).toBeGreaterThan(0);
  }

  it("empties every encrypted Team store and removes the salt and verifier", async () => {
    await fillEverything();
    await resetTeamVault();
    for (const store of ENCRYPTED_TEAM_STORES) expect(await getAll(store)).toEqual([]);
    expect(await loadVaultMeta()).toBeNull();
  });

  it("leaves Capture data untouched", async () => {
    await fillEverything();
    const before = await loadSnapshot();
    await resetTeamVault();
    resetDbCache();
    const after = await loadSnapshot();
    expect(after.projects).toEqual(before.projects);
    expect(after.thoughts).toEqual(before.thoughts);
    expect(after.projects.map((project) => project.id)).toContain("proj-keep");
    expect(after.thoughts.map((thought) => thought.body)).toContain("Keep this thought");
    expect(await getOne("lanes", "lane-keep")).toEqual({ id: "lane-keep", name: "Keep lane" });
    expect(await getOne("meta", "capture.pref")).toEqual({ key: "capture.pref", value: "keep" });
    expect(await getOne("meta", "seeded")).toBeTruthy();
  });

  it("keeps the people list and your name, and clears lastSync so Granola re-syncs everything", async () => {
    await fillEverything();
    await resetTeamVault();
    const people = await loadPeople();
    expect(people.map((person) => person.granolaFolderName)).toEqual(DEMO_PEOPLE.map((person) => person.granolaFolderName));
    expect(people.every((person) => person.lastSync === null)).toBe(true);
    expect(await loadSelfName()).toBe("Jordan Park");
  });

  it("lets a new passphrase start a fresh vault; old ciphertext is gone", async () => {
    await fillEverything();
    await resetTeamVault();
    const { key, meta } = await createVault("brand new passphrase", 1000);
    await saveVaultMeta(meta);
    const data = await loadTeamData(key);
    expect([data.notes.length, data.items.length, data.moments.length, data.pulses.length]).toEqual([0, 0, 0, 0]);
    expect(await loadVaultMeta()).toEqual(meta);
  });
});
