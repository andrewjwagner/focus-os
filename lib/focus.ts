import { MAX_FOCUS, type Project } from "./types";

export function focusedProjects(projects: Project[]): Project[] {
  return projects
    .filter((project) => project.focusNext)
    .sort((a, b) => (a.focusOrder ?? 99) - (b.focusOrder ?? 99));
}

export function nextFocusOrder(projects: Project[]): number {
  const focused = focusedProjects(projects);
  if (focused.length === 0) return 1;
  return Math.max(...focused.map((project) => project.focusOrder ?? 0)) + 1;
}

export function canAddToFocus(
  projects: Project[],
  projectId: string,
): boolean {
  const focused = focusedProjects(projects);
  if (focused.some((project) => project.id === projectId)) return true;
  return focused.length < MAX_FOCUS;
}

export function applyFocus(
  projects: Project[],
  projectId: string,
): { projects: Project[]; result: { ok: true } | { ok: false; focused: Project[] } } {
  const current = projects.find((project) => project.id === projectId);
  if (!current) {
    return { projects, result: { ok: true } };
  }
  if (current.focusNext) {
    return { projects, result: { ok: true } };
  }
  const focused = focusedProjects(projects);
  if (focused.length >= MAX_FOCUS) {
    return { projects, result: { ok: false, focused } };
  }
  const order = nextFocusOrder(projects);
  return {
    result: { ok: true },
    projects: projects.map((project) =>
      project.id === projectId
        ? {
            ...project,
            focusNext: true,
            focusOrder: order,
            status: project.status === "done" ? "active" : project.status === "tabled" ? "active" : project.status === "inspired" ? "active" : project.status,
            updatedAt: new Date().toISOString(),
          }
        : project,
    ),
  };
}

export function applyUnsetFocus(projects: Project[], projectId: string): Project[] {
  return projects.map((project) =>
    project.id === projectId
      ? {
          ...project,
          focusNext: false,
          focusOrder: null,
          updatedAt: new Date().toISOString(),
        }
      : project,
  );
}

export function applyReplaceFocus(
  projects: Project[],
  demoteId: string,
  promoteId: string,
): Project[] {
  const demoted = applyUnsetFocus(projects, demoteId);
  const { projects: next } = applyFocus(demoted, promoteId);
  return next;
}

export function applyStatus(
  projects: Project[],
  projectId: string,
  status: Project["status"],
): Project[] {
  return projects.map((project) => {
    if (project.id !== projectId) return project;
    const parking = status === "tabled" || status === "done" || status === "inspired";
    return {
      ...project,
      status,
      focusNext: parking ? false : project.focusNext,
      focusOrder: parking ? null : project.focusOrder,
      updatedAt: new Date().toISOString(),
    };
  });
}
