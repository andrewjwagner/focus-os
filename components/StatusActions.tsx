"use client";

import { useState } from "react";
import { FocusCapDialog } from "@/components/FocusCapDialog";
import { useStore } from "@/lib/store";
import type { Project, Status } from "@/lib/types";
import { btnClass } from "@/lib/ui";

const ACTIONS: { status: Status; label: string }[] = [
  { status: "active", label: "Active" },
  { status: "tabled", label: "Table" },
  { status: "done", label: "Done" },
];

export function StatusActions({ project }: { project: Project }) {
  const store = useStore();
  const [capOpen, setCapOpen] = useState(false);
  const [focused, setFocused] = useState<Project[]>([]);

  async function onFocus() {
    if (project.focusNext) {
      await store.unsetFocus(project.id);
      return;
    }
    const result = await store.setFocus(project.id);
    if (!result.ok) {
      setFocused(result.focused);
      setCapOpen(true);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((action) => {
          const selected = project.status === action.status;
          return (
            <button
              key={action.status}
              type="button"
              onClick={() => void store.setStatus(project.id, action.status)}
              className={`${btnClass} border ${
                selected
                  ? "border-ink bg-ink text-bg"
                  : "border-line text-muted hover:text-ink"
              }`}
            >
              {action.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => void onFocus()}
          className={`${btnClass} border ${
            project.focusNext
              ? "border-focus bg-focus text-bg"
              : "border-focus/40 text-focus hover:bg-focus/10"
          }`}
        >
          {project.focusNext ? "Unset focus" : "Set as focus"}
        </button>
      </div>
      <FocusCapDialog
        open={capOpen}
        focused={focused}
        onCancel={() => setCapOpen(false)}
        onReplace={(demoteId) => {
          void store.replaceFocus(demoteId, project.id);
          setCapOpen(false);
        }}
      />
    </>
  );
}
