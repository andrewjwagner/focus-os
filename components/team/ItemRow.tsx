"use client";

import Link from "next/link";
import { useTeam } from "@/lib/team/context";
import type { ActionItem, TeamNote } from "@/lib/team/types";
import { isOverdue, shortDate, todayIso } from "@/lib/team/view";

const inlineField =
  "rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-muted outline-none hover:border-line focus:border-focus focus:text-ink";

export function ItemRow({
  item,
  note,
  showPerson,
  editable = true,
}: {
  item: ActionItem;
  note?: TeamNote;
  showPerson?: { id: string; name: string };
  editable?: boolean;
}) {
  const team = useTeam();
  const overdue = !item.done && isOverdue(item.due, todayIso());

  return (
    <li className="flex items-start gap-3 rounded-xl border border-line bg-card px-3 py-2.5">
      <input
        type="checkbox"
        checked={item.done}
        onChange={() => void team.updateItem(item.id, { done: !item.done })}
        className="mt-1 h-4 w-4 accent-[var(--color-focus)]"
        aria-label={item.done ? "Mark open" : "Mark done"}
      />
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${item.done ? "text-muted line-through" : "text-ink"}`}>
          {item.text}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {showPerson ? (
            <Link href={`/team/${showPerson.id}`} className="text-focus hover:underline">
              {showPerson.name}
            </Link>
          ) : null}
          {editable ? (
            <>
              <label className="flex items-center gap-1">
                Owner
                <input
                  key={`owner-${item.owner}`}
                  className={`${inlineField} w-24`}
                  defaultValue={item.owner}
                  placeholder="unset"
                  onBlur={(event) => {
                    const owner = event.target.value.trim();
                    if (owner !== item.owner) void team.updateItem(item.id, { owner });
                  }}
                />
              </label>
              <label className={`flex items-center gap-1 ${overdue ? "text-danger" : ""}`}>
                Due
                <input
                  type="date"
                  className={inlineField}
                  value={item.due ?? ""}
                  onChange={(event) =>
                    void team.updateItem(item.id, { due: event.target.value || null })
                  }
                />
              </label>
            </>
          ) : (
            <>
              <span>Owner: {item.owner || "unset"}</span>
              {item.due ? (
                <span className={overdue ? "text-danger" : ""}>Due {shortDate(item.due)}</span>
              ) : null}
            </>
          )}
          {note ? (
            note.webUrl ? (
              <a
                href={note.webUrl}
                target="_blank"
                rel="noreferrer"
                className="hover:text-ink hover:underline"
              >
                From {note.title} ({shortDate(note.meetingAt)})
              </a>
            ) : (
              <span>
                From {note.title} ({shortDate(note.meetingAt)})
              </span>
            )
          ) : item.noteId === null ? (
            <span>Added by hand</span>
          ) : null}
          {editable ? (
            <button
              type="button"
              onClick={() => void team.removeItem(item.id)}
              className="ml-auto text-muted hover:text-danger"
            >
              Delete
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
