import { DB_NAME, DB_VERSION } from "./constants";
import { seedLanes, seedProjects, seedThoughts } from "./seed";
import type { Lane, Project, Thought } from "./types";

type StoreName = "projects" | "thoughts" | "lanes" | "meta";

type Meta = { key: string; value: string };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
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
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function getAll<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

async function put<T>(storeName: StoreName, value: T): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).put(value);
  await txDone(tx);
}

async function putMany<T>(storeName: StoreName, values: T[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  for (const value of values) store.put(value);
  await txDone(tx);
}

async function remove(storeName: StoreName, id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).delete(id);
  await txDone(tx);
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

  const [projects, thoughts, lanes] = await Promise.all([
    getAll<Project>("projects"),
    getAll<Thought>("thoughts"),
    getAll<Lane>("lanes"),
  ]);
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
