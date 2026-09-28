import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { DB_NAME, DB_VERSION } from "../constants";
import { getAll, loadSnapshot, resetDbCache, TEAM_STORES } from "../idb";
import { createVault } from "./crypto";
import { DEMO_MOMENTS, DEMO_NOTES, DEMO_PEOPLE, demoItems } from "./seed";
import {
  deletePersonCascade,
  loadTeamData,
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

describe("IndexedDB v3 migration", () => {
  it("bumps to v3, adds Team stores, and keeps existing data", async () => {
    await createV2WithData();
    const snap = await loadSnapshot();
    expect(DB_VERSION).toBe(3);
    expect(snap.projects.map((project) => project.id)).toEqual(["proj-keep"]);
    expect(snap.thoughts.map((thought) => thought.body)).toEqual(["Keep this thought"]);
    for (const store of TEAM_STORES) {
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
});
