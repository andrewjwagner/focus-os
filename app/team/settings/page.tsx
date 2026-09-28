"use client";

import { FormEvent, useState } from "react";
import { TeamGate } from "@/components/team/TeamGate";
import { TeamNav } from "@/components/team/TeamNav";
import { useTeam } from "@/lib/team/context";
import { TEAM_ROLES, type Person, type TeamRole } from "@/lib/team/types";
import { roleLabel } from "@/lib/team/view";
import { fieldClass } from "@/lib/ui";

type Draft = { name: string; role: TeamRole; granolaFolderName: string };
const EMPTY: Draft = { name: "", role: "direct", granolaFolderName: "" };

function PersonForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Draft;
  submitLabel: string;
  onSubmit: (draft: Draft) => Promise<void>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) {
      setError("Add a name.");
      return;
    }
    setError(null);
    await onSubmit(draft);
    if (!onCancel) setDraft(EMPTY);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_auto]">
      <input
        className={fieldClass}
        placeholder="Name"
        value={draft.name}
        onChange={(event) => setDraft({ ...draft, name: event.target.value })}
      />
      <select
        className={fieldClass}
        value={draft.role}
        onChange={(event) => setDraft({ ...draft, role: event.target.value as TeamRole })}
      >
        {TEAM_ROLES.map((role) => (
          <option key={role} value={role}>
            {roleLabel(role)}
          </option>
        ))}
      </select>
      <input
        className={`${fieldClass} sm:col-span-2`}
        placeholder="Granola folder name (exact, optional)"
        value={draft.granolaFolderName}
        onChange={(event) => setDraft({ ...draft, granolaFolderName: event.target.value })}
      />
      {error ? <p className="text-sm text-danger sm:col-span-2">{error}</p> : null}
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          className="rounded-full bg-focus px-4 py-1.5 text-sm font-medium text-bg"
        >
          {submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-line px-4 py-1.5 text-sm text-muted"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

function PersonRow({ person }: { person: Person }) {
  const team = useTeam();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="rounded-2xl border border-focus/40 bg-card p-4">
        <PersonForm
          initial={{
            name: person.name,
            role: person.role,
            granolaFolderName: person.granolaFolderName,
          }}
          submitLabel="Save"
          onCancel={() => setEditing(false)}
          onSubmit={async (draft) => {
            await team.updatePerson(person.id, draft);
            setEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-card p-4">
      <div>
        <p className="text-sm font-medium text-ink">{person.name}</p>
        <p className="mt-1 text-xs text-muted">
          {roleLabel(person.role)} ·{" "}
          {person.granolaFolderName ? `Folder: ${person.granolaFolderName}` : "No Granola folder"}
        </p>
      </div>
      <div className="flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-full border border-line px-3 py-1 text-muted hover:text-ink"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Remove ${person.name} and their synced notes, items, and moments?`)) {
              void team.removePerson(person.id);
            }
          }}
          className="rounded-full border border-line px-3 py-1 text-muted hover:text-danger"
        >
          Remove
        </button>
      </div>
    </li>
  );
}

function TeamSettings() {
  const team = useTeam();
  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs uppercase tracking-[0.2em] text-focus">Team settings</p>
        <h1 className="mt-2 font-display text-4xl text-ink">People</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          Saved only in this browser. Each Granola folder name must match a folder in your
          Granola account. Folders you do not list here are never synced.
        </p>
        <div className="mt-4">
          <TeamNav />
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-bg-elev p-4">
        <h2 className="mb-3 text-sm font-medium text-ink">Add a person</h2>
        <PersonForm initial={EMPTY} submitLabel="Add" onSubmit={team.addPerson} />
      </section>

      <section>
        {team.people.length === 0 ? (
          <div className="space-y-3 text-sm text-muted">
            <p>Nobody yet.</p>
            <button
              type="button"
              onClick={() => void team.loadDemoTeam()}
              className="rounded-full border border-line px-3 py-1.5 text-ink"
            >
              Load demo team
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {team.people.map((person) => (
              <PersonRow key={person.id} person={person} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function TeamSettingsPage() {
  return (
    <TeamGate>
      <TeamSettings />
    </TeamGate>
  );
}
