"use client";

import Link from "next/link";
import { useEffect } from "react";
import { TeamGate } from "@/components/team/TeamGate";
import { TeamNav } from "@/components/team/TeamNav";
import { useTeam } from "@/lib/team/context";
import type { Person } from "@/lib/team/types";
import { openItemsFor, roleLabel, shortDate } from "@/lib/team/view";

function PersonCard({ person }: { person: Person }) {
  const team = useTeam();
  const open = openItemsFor(team.items, person.id);
  const noteCount = team.notes.filter((note) => note.personId === person.id).length;
  return (
    <Link
      href={`/team/${person.id}`}
      className="block rounded-2xl border border-line bg-card p-4 transition-colors hover:border-focus/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">{person.name}</p>
          <p className="mt-1 text-xs text-muted">
            {roleLabel(person.role)} · {noteCount} note{noteCount === 1 ? "" : "s"}
            {person.lastSync ? ` · synced ${shortDate(person.lastSync)}` : ""}
          </p>
        </div>
        <span className="rounded-full bg-focus/15 px-2 py-0.5 text-[11px] text-focus">
          {open.length} open
        </span>
      </div>
      {open[0] ? (
        <p className="mt-3 truncate text-sm text-muted">Next: {open[0].text}</p>
      ) : null}
    </Link>
  );
}

function TeamHome() {
  const team = useTeam();
  const { syncNow } = team;

  // Sync when the Team tab opens (skip if a sync just ran).
  useEffect(() => {
    void syncNow({ ifOlderThanMs: 60_000 });
  }, [syncNow]);

  const managers = team.people.filter((person) => person.role === "manager");
  const directs = team.people.filter((person) => person.role === "direct");
  const hasFolders = team.people.some((person) => person.granolaFolderName);

  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs uppercase tracking-[0.2em] text-focus">Team</p>
        <h1 className="mt-2 font-display text-4xl text-ink">Your people</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          Open loops, themes, and 1:1 prep from your Granola notes. Everything stays in this
          browser, encrypted.
        </p>
        <div className="mt-4">
          <TeamNav />
        </div>
      </section>

      {team.digestHighlighted ? (
        <Link
          href="/team/digest"
          className="block rounded-2xl border border-focus/50 bg-focus/10 px-4 py-3 text-sm text-ink"
        >
          Your weekly Team digest is ready. Review open loops before the week starts.
        </Link>
      ) : null}

      {hasFolders ? (
        <section className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <button
            type="button"
            disabled={team.sync.running}
            onClick={() => void team.syncNow()}
            className="rounded-full border border-line px-3 py-1 text-ink hover:border-focus/60 disabled:opacity-50"
          >
            {team.sync.running ? "Syncing…" : "Sync Granola"}
          </button>
          {team.sync.error ? <span className="text-danger">{team.sync.error}</span> : null}
          {!team.sync.error && team.sync.message ? <span>{team.sync.message}</span> : null}
          <span>Auto sync every 30 minutes while the app is open.</span>
        </section>
      ) : null}

      {team.people.length === 0 ? (
        <section className="space-y-3 rounded-2xl border border-dashed border-line px-4 py-5 text-sm text-muted">
          <p>No people yet. Add your manager and direct reports, with the Granola folder that holds your 1:1 notes for each.</p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/team/settings"
              className="rounded-full bg-focus px-3 py-1.5 text-sm font-medium text-bg"
            >
              Add people
            </Link>
            <button
              type="button"
              onClick={() => void team.loadDemoTeam()}
              className="rounded-full border border-line px-3 py-1.5 text-sm text-ink"
            >
              Load demo team
            </button>
          </div>
        </section>
      ) : (
        <>
          {managers.length > 0 ? (
            <section className="space-y-3">
              <h2 className="font-display text-2xl text-ink">Manager</h2>
              {managers.map((person) => (
                <PersonCard key={person.id} person={person} />
              ))}
            </section>
          ) : null}
          {directs.length > 0 ? (
            <section className="space-y-3">
              <h2 className="font-display text-2xl text-ink">Direct reports</h2>
              {directs.map((person) => (
                <PersonCard key={person.id} person={person} />
              ))}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function TeamPage() {
  return (
    <TeamGate>
      <TeamHome />
    </TeamGate>
  );
}
