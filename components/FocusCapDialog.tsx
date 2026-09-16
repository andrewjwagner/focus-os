"use client";

import type { Project } from "@/lib/types";

export function FocusCapDialog({
  open,
  focused,
  onCancel,
  onReplace,
}: {
  open: boolean;
  focused: Project[];
  onCancel: () => void;
  onReplace: (demoteId: string) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        role="dialog"
        aria-labelledby="focus-cap-title"
        className="w-full max-w-md rounded-2xl border border-line bg-card p-5 shadow-2xl"
      >
        <h2 id="focus-cap-title" className="font-display text-2xl text-ink">
          Focus next is full
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Hard cap is 3. Demote one to make room, or cancel.
        </p>
        <ul className="mt-4 space-y-2">
          {focused.map((project) => (
            <li
              key={project.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-bg-elev px-3 py-2"
            >
              <div>
                <p className="text-sm text-ink">{project.name}</p>
                <p className="text-xs text-muted">{project.domain}</p>
              </div>
              <button
                type="button"
                onClick={() => onReplace(project.id)}
                className="shrink-0 rounded-full border border-focus/40 px-3 py-1 text-xs text-focus hover:bg-focus/10"
              >
                Demote
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 w-full rounded-full border border-line px-3 py-2 text-sm text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
