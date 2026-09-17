"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyFocus,
  applyReplaceFocus,
  applyStatus,
  applyUnsetFocus,
} from "./focus";
import {
  deleteLane as deleteLaneRecord,
  deleteThought as deleteThoughtRecord,
  loadSnapshot,
  saveLane,
  saveProject,
  saveProjects,
  saveThought,
} from "./idb";
import type {
  CaptureItemKind,
  FocusCapResult,
  Lane,
  LaneType,
  Project,
  Status,
  Thought,
} from "./types";
import { DOMAINS, type Domain } from "./types";

type StoreState = {
  ready: boolean;
  projects: Project[];
  thoughts: Thought[];
  lanes: Lane[];
  captureProject: (input: {
    name: string;
    domain: Domain;
    outcome: string;
    nextAction: string;
    status: Status;
  }) => Promise<Project>;
  captureThought: (input: {
    kind: CaptureItemKind;
    body: string;
    domain: Domain;
    projectId: string | null;
  }) => Promise<Thought>;
  updateProject: (
    id: string,
    patch: Partial<Pick<Project, "name" | "domain" | "outcome" | "nextAction">>,
  ) => Promise<void>;
  setStatus: (id: string, status: Status) => Promise<void>;
  setFocus: (id: string) => Promise<FocusCapResult>;
  unsetFocus: (id: string) => Promise<void>;
  replaceFocus: (demoteId: string, promoteId: string) => Promise<void>;
  addLane: (input: {
    projectId: string;
    laneType: LaneType;
    label: string;
    urlOrHint: string;
  }) => Promise<void>;
  removeLane: (id: string) => Promise<void>;
  attachThought: (thoughtId: string, projectId: string) => Promise<void>;
  addNote: (projectId: string, body: string) => Promise<void>;
  removeThought: (id: string) => Promise<void>;
};

const StoreContext = createContext<StoreState | null>(null);

function stamp() {
  return new Date().toISOString();
}

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [lanes, setLanes] = useState<Lane[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadSnapshot().then((snap) => {
      if (cancelled) return;
      setProjects(snap.projects);
      setThoughts(snap.thoughts);
      setLanes(snap.lanes);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const captureProject = useCallback<StoreState["captureProject"]>(
    async (input) => {
      const project: Project = {
        id: newId("proj"),
        name: input.name.trim(),
        domain: input.domain,
        status: input.status,
        outcome: input.outcome.trim(),
        nextAction: input.nextAction.trim(),
        focusNext: false,
        focusOrder: null,
        createdAt: stamp(),
        updatedAt: stamp(),
      };
      setProjects((prev) => [...prev, project]);
      await saveProject(project);
      return project;
    },
    [],
  );

  const captureThought = useCallback<StoreState["captureThought"]>(
    async (input) => {
      const thought: Thought = {
        id: newId(input.kind),
        kind: input.kind,
        body: input.body.trim(),
        domain: input.domain,
        projectId: input.projectId,
        createdAt: stamp(),
      };
      setThoughts((prev) => [thought, ...prev]);
      await saveThought(thought);
      return thought;
    },
    [],
  );

  const updateProject = useCallback<StoreState["updateProject"]>(
    async (id, patch) => {
      let updated: Project | undefined;
      setProjects((prev) =>
        prev.map((project) => {
          if (project.id !== id) return project;
          updated = { ...project, ...patch, updatedAt: stamp() };
          return updated;
        }),
      );
      if (updated) await saveProject(updated);
    },
    [],
  );

  const setStatus = useCallback<StoreState["setStatus"]>(async (id, status) => {
    setProjects((prev) => {
      const next = applyStatus(prev, id, status);
      void saveProjects(next);
      return next;
    });
  }, []);

  const setFocus = useCallback<StoreState["setFocus"]>(async (id) => {
    let cap: FocusCapResult = { ok: true };
    let persisted: Project[] | null = null;
    setProjects((prev) => {
      const { projects: next, result } = applyFocus(prev, id);
      if (!result.ok) {
        cap = { ok: false, reason: "cap", focused: result.focused };
        return prev;
      }
      persisted = next;
      return next;
    });
    if (!cap.ok) return cap;
    if (persisted) await saveProjects(persisted);
    return { ok: true };
  }, []);

  const unsetFocus = useCallback<StoreState["unsetFocus"]>(async (id) => {
    setProjects((prev) => {
      const next = applyUnsetFocus(prev, id);
      void saveProjects(next);
      return next;
    });
  }, []);

  const replaceFocus = useCallback<StoreState["replaceFocus"]>(
    async (demoteId, promoteId) => {
      setProjects((prev) => {
        const next = applyReplaceFocus(prev, demoteId, promoteId);
        void saveProjects(next);
        return next;
      });
    },
    [],
  );

  const addLane = useCallback<StoreState["addLane"]>(async (input) => {
    const lane: Lane = {
      id: newId("lane"),
      projectId: input.projectId,
      laneType: input.laneType,
      label: input.label.trim(),
      urlOrHint: input.urlOrHint.trim(),
    };
    setLanes((prev) => [...prev, lane]);
    await saveLane(lane);
  }, []);

  const removeLane = useCallback<StoreState["removeLane"]>(async (id) => {
    setLanes((prev) => prev.filter((lane) => lane.id !== id));
    await deleteLaneRecord(id);
  }, []);

  const attachThought = useCallback<StoreState["attachThought"]>(
    async (thoughtId, projectId) => {
      let updated: Thought | undefined;
      setThoughts((prev) =>
        prev.map((thought) => {
          if (thought.id !== thoughtId) return thought;
          updated = { ...thought, projectId };
          return updated;
        }),
      );
      if (updated) await saveThought(updated);
    },
    [],
  );

  const addNote = useCallback<StoreState["addNote"]>(
    async (projectId, body) => {
      const project = projects.find((item) => item.id === projectId);
      await captureThought({
        kind: "idea",
        body,
        domain: project?.domain ?? "Ideas",
        projectId,
      });
    },
    [captureThought, projects],
  );

  const removeThought = useCallback<StoreState["removeThought"]>(async (id) => {
    setThoughts((prev) => prev.filter((thought) => thought.id !== id));
    await deleteThoughtRecord(id);
  }, []);

  const value = useMemo<StoreState>(
    () => ({
      ready,
      projects,
      thoughts,
      lanes,
      captureProject,
      captureThought,
      updateProject,
      setStatus,
      setFocus,
      unsetFocus,
      replaceFocus,
      addLane,
      removeLane,
      attachThought,
      addNote,
      removeThought,
    }),
    [
      addLane,
      addNote,
      attachThought,
      captureProject,
      captureThought,
      lanes,
      projects,
      ready,
      removeLane,
      removeThought,
      replaceFocus,
      setFocus,
      setStatus,
      thoughts,
      unsetFocus,
      updateProject,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreState {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

export { DOMAINS };
