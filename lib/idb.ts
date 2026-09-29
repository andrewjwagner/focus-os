import { DB_NAME, DB_VERSION } from "./constants";
import { seedLanes, seedProjects, seedThoughts } from "./seed";
import {
  normalizeThought,
  projectDomainMap,
  thoughtNeedsMigration,
} from "./thought";
import type { Lane, Project, Thought } from "./types";

export type StoreName =
  | "projects"
  | "thoughts"
  | "lanes"
  | "meta"
  | "teamPeople"
  | "teamNotes"
  | "teamItems"
  | "teamMoments"
  | "teamPulse"
  | "teamCoaching"
  | "teamDerived";

type Meta = { key: string; value: string };

export const TEAM_STORES = [
  "teamPeople",
  "teamNotes",
  "teamItems",
  "teamMoments",
  "teamPulse",
  "teamCoaching",
  "teamDerived",
] as const;

/**
 * Additive schema upgrades only, so existing projects, thoughts, lanes, and meta
 * survive every version bump.
 * v1: projects, thoughts, lanes, meta.
 * v2: thought records gain kind + domain in loadSnapshot (no new stores).
 * v3: Team tab stores (people, encrypted notes, action items, encrypted moments).
 * v4: Team pulse ratings, coaching plan, and derived AI results (all encrypted).
 */
export function upgradeSchema(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains("projects")) {
    db.createObjectStore("projects", { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains("thoughts")) {
    db.createObjectStore("thoughts", { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains("lanes")) {
    db.createObjectStore("lanes", { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains("meta")) {
    db.createObjectStore("meta", { keyPath: "key" });
  }
  for (const name of TEAM_STORES) {
    if (!db.objectStoreNames.contains(name)) {
      db.createObjectStore(name, { keyPath: "id" });
    }
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => upgradeSchema(request.result);
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
  dbPromise = opening;
  opening.catch(() => {
    dbPromise = null;
  });
  return opening;
}

/** Test hook: forget the cached connection. */
export function resetDbCache(): void {
  dbPromise = null;
}

export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getAll<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

export async function put<T>(storeName: StoreName, value: T): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).put(value);
  await txDone(tx);
}

export async function putMany<T>(storeName: StoreName, values: T[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  for (const value of values) store.put(value);
  await txDone(tx);
}

export async function remove(storeName: StoreName, id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).delete(id);
  await txDone(tx);
}

export async function getOne<T>(storeName: StoreName, key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function loadSnapshot(): Promise<{
  projects: Project[];
  thoughts: Thought[];
  lanes: Lane[];
}> {
  const db = await openDb();
  const seeded = await new Promise<Meta | undefined>((resolve, reject) => {
    const tx = db.transaction("meta", "readonly");
    const request = tx.objectStore("meta").get("seeded");
    request.onsuccess = () => resolve(request.result as Meta | undefined);
    request.onerror = () => reject(request.error);
  });

  if (!seeded) {
    await putMany("projects", seedProjects);
    await putMany("thoughts", seedThoughts);
    await putMany("lanes", seedLanes);
    await put("meta", { key: "seeded", value: "v1" });
  }

  const [projects, rawThoughts, lanes] = await Promise.all([
    getAll<Project>("projects"),
    getAll<unknown>("thoughts"),
    getAll<Lane>("lanes"),
  ]);

  const domainByProject = projectDomainMap(projects);
  const thoughts: Thought[] = [];
  let migrated = false;
  for (const raw of rawThoughts) {
    const thought = normalizeThought(raw, domainByProject);
    if (!thought) continue;
    thoughts.push(thought);
    if (thoughtNeedsMigration(raw)) migrated = true;
  }
  if (migrated) await putMany("thoughts", thoughts);

  return { projects, thoughts, lanes };
}

export async function saveProject(project: Project): Promise<void> {
  await put("projects", project);
}

export async function saveProjects(projects: Project[]): Promise<void> {
  await putMany("projects", projects);
}

export async function saveThought(thought: Thought): Promise<void> {
  await put("thoughts", thought);
}

export async function deleteThought(id: string): Promise<void> {
  await remove("thoughts", id);
}

export async function saveLane(lane: Lane): Promise<void> {
  await put("lanes", lane);
}

export async function deleteLane(id: string): Promise<void> {
  await remove("lanes", id);
}
