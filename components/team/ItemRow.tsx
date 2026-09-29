"use client";

import Link from "next/link";
import { useState } from "react";
import { useTeam } from "@/lib/team/context";
import { ownerLabel } from "@/lib/team/owner";
import type { ActionItem, OwnerKind, TeamNote } from "@/lib/team/types";
import { isOverdue, shortDate, todayIso } from "@/lib/team/view";

const inlineField =
  "rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-muted outline-none hover:border-line focus:border-focus focus:text-ink";

function OwnerPicker({ item, personName }: { item: ActionItem; personName: string }) {
  const team = useTeam();
  const [otherOpen, setOtherOpen] = useState(false);
  const themLabel = personName.split(/\s+/)[0] || "Them";
  const options: { kind: OwnerKind; label: string }[] = [
    { kind: "me", label: "Me" },
    { kind: "them", label: themLabel },
    { kind: "other", label: item.ownerKind === "other" && item.owner ? item.owner : "Other" },
  ];

  return (
    <span className="flex flex-wrap items-center gap-1" role="group" aria-label="Owner">
      {options.map((option) => {
        const active = item.ownerKind === option.kind;
        return (
          <button
            key={option.kind}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (option.kind === "other") setOtherOpen(true);
              else void team.setItemOwner(item.id, option.kind);
            }}
            className={`rounded-full border px-2 py-0.5 text-[11px] ${
              active ? "border-focus/60 bg-focus/15 text-ink" : "border-line text-muted hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
      {otherOpen ? (
        <input
          autoFocus
          className={`${inlineField} w-28 border-line`}
          placeholder="Name"
          defaultValue={item.ownerKind === "other" ? item.owner : ""}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOtherOpen(false);
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          onBlur={(event) => {
            const name = event.target.value.trim();
            if (name) void team.setItemOwner(item.id, "other", name);
            setOtherOpen(false);
          }}
        />
      ) : null}
      {item.ownerKind !== "unassigned" ? (
        <button
          type="button"
          onClick={() => void team.setItemOwner(item.id, "unassigned")}
          className="px-1 text-[11px] text-muted hover:text-ink"
          title="Mark owner unclear"
        >
          Clear
        </button>
      ) : null}
    </span>
  );
}

export function ItemRow({
  item,
  note,
  personName,
  showPerson,
  editable = true,
}: {
  item: ActionItem;
  note?: TeamNote;
  personName: string;
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
        {item.detail ? <p className="mt-0.5 text-xs leading-5 text-muted">{item.detail}</p> : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {showPerson ? (
            <Link href={`/team/${showPerson.id}`} className="text-focus hover:underline">
              {showPerson.name}
            </Link>
          ) : null}
          {editable ? (
            <>
              <OwnerPicker item={item} personName={personName} />
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
              <span>Owner: {ownerLabel(item, personName)}</span>
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
