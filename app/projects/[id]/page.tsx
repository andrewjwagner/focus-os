"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { StatusActions } from "@/components/StatusActions";
import { isHttpUrl } from "@/lib/format";
import { useStore } from "@/lib/store";
import { DOMAINS, LANE_TYPES, type Domain, type LaneType } from "@/lib/types";
import { DOMAIN_TINT, fieldClass } from "@/lib/ui";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const store = useStore();
  const project = store.projects.find((item) => item.id === params.id);
  const lanes = store.lanes.filter((lane) => lane.projectId === params.id);
  const notes = store.thoughts.filter((thought) => thought.projectId === params.id);

  const [name, setName] = useState<string | null>(null);
  const [domain, setDomain] = useState<Domain | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [nextAction, setNextAction] = useState<string | null>(null);
  const [laneType, setLaneType] = useState<LaneType>("Grok Bot");
  const [laneLabel, setLaneLabel] = useState("");
  const [laneHint, setLaneHint] = useState("");
  const [note, setNote] = useState("");

  if (!store.ready) return <p className="text-muted">Loading…</p>;
  if (!project) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-3xl">Project not found</h1>
        <Link href="/" className="text-sm text-focus hover:underline">
          Back to Today
        </Link>
      </div>
    );
  }

  const current = project;
  const liveProject = {
    ...current,
    name: name ?? current.name,
    domain: domain ?? current.domain,
    outcome: outcome ?? current.outcome,
    nextAction: nextAction ?? current.nextAction,
  };

  function persistField(
    field: "name" | "domain" | "outcome" | "nextAction",
    value: string,
  ) {
    void store.updateProject(current.id, { [field]: value });
  }

  async function onAddLane(event: FormEvent) {
    event.preventDefault();
    if (!laneLabel.trim()) return;
    await store.addLane({
      projectId: current.id,
      laneType,
      label: laneLabel,
      urlOrHint: laneHint,
    });
    setLaneLabel("");
    setLaneHint("");
  }

  async function onAddNote(event: FormEvent) {
    event.preventDefault();
    if (!note.trim()) return;
    await store.addNote(current.id, note);
    setNote("");
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/" className="text-xs uppercase tracking-[0.2em] text-muted hover:text-ink">
          Today
        </Link>
        <div className="mt-3 flex items-start justify-between gap-4">
          <input
            value={liveProject.name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => persistField("name", liveProject.name)}
            className="w-full bg-transparent font-display text-4xl text-ink outline-none"
          />
        </div>
        <p className="mt-2 flex items-center gap-2 text-sm text-muted">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: DOMAIN_TINT[liveProject.domain] }}
          />
          {liveProject.domain}
          {project.focusNext ? <span>· Focus next</span> : null}
        </p>
      </div>

      <StatusActions project={project} />

      <section className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-muted">
          Domain
          <select
            value={liveProject.domain}
            onChange={(event) => {
              const value = event.target.value as Domain;
              setDomain(value);
              persistField("domain", value);
            }}
            className={`${fieldClass} mt-1`}
          >
            {DOMAINS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-muted">
          Status
          <input
            readOnly
            value={project.status}
            className={`${fieldClass} mt-1 capitalize`}
          />
        </label>
        <label className="block text-sm text-muted sm:col-span-2">
          One-line outcome
          <input
            value={liveProject.outcome}
            onChange={(event) => setOutcome(event.target.value)}
            onBlur={() => persistField("outcome", liveProject.outcome)}
            className={`${fieldClass} mt-1`}
          />
        </label>
        <label className="block text-sm text-muted sm:col-span-2">
          Next action
          <input
            value={liveProject.nextAction}
            onChange={(event) => setNextAction(event.target.value)}
            onBlur={() => persistField("nextAction", liveProject.nextAction)}
            className={`${fieldClass} mt-1`}
          />
        </label>
      </section>

      <section>
        <h2 className="font-display text-2xl text-ink">Lanes</h2>
        <p className="mt-1 text-sm text-muted">
          Which bot, doc, sheet, or repo owns this thread.
        </p>
        <ul className="mt-3 space-y-2">
          {lanes.length === 0 ? (
            <li className="rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-muted">
              No lane yet. If scrollback is the only source of truth, add one.
            </li>
          ) : (
            lanes.map((lane) => (
              <li
                key={lane.id}
                className="flex items-start justify-between gap-3 rounded-2xl border border-line bg-card p-4"
              >
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">
                    {lane.laneType}
                  </p>
                  <p className="mt-1 text-sm text-ink">{lane.label}</p>
                  {lane.urlOrHint ? (
                    isHttpUrl(lane.urlOrHint) ? (
                      <a
                        href={lane.urlOrHint}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-sm text-focus hover:underline"
                      >
                        {lane.urlOrHint}
                      </a>
                    ) : (
                      <p className="mt-1 text-sm leading-6 text-muted">
                        {lane.urlOrHint}
                      </p>
                    )
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => void store.removeLane(lane.id)}
                  className="text-xs text-muted hover:text-danger"
                >
                  Remove
                </button>
              </li>
            ))
          )}
        </ul>
        <form onSubmit={onAddLane} className="mt-3 grid gap-2 rounded-2xl border border-line bg-bg-elev p-4 sm:grid-cols-2">
          <select
            value={laneType}
            onChange={(event) => setLaneType(event.target.value as LaneType)}
            className={fieldClass}
          >
            {LANE_TYPES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <input
            value={laneLabel}
            onChange={(event) => setLaneLabel(event.target.value)}
            placeholder="Label (bot name, doc title)"
            className={fieldClass}
          />
          <input
            value={laneHint}
            onChange={(event) => setLaneHint(event.target.value)}
            placeholder="URL or hint"
            className={`${fieldClass} sm:col-span-2`}
          />
          <button
            type="submit"
            className="rounded-full bg-card px-4 py-2 text-sm text-ink sm:col-span-2"
          >
            Add lane
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-display text-2xl text-ink">Notes</h2>
        <ul className="mt-3 space-y-2">
          {notes.length === 0 ? (
            <li className="text-sm text-muted">No notes on this card yet.</li>
          ) : (
            notes.map((item) => (
              <li
                key={item.id}
                className="rounded-2xl border border-line bg-card px-4 py-3 text-sm leading-6 text-ink"
              >
                {item.body}
              </li>
            ))
          )}
        </ul>
        <form onSubmit={onAddNote} className="mt-3 flex gap-2">
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add a note"
            className={fieldClass}
          />
          <button
            type="submit"
            className="rounded-full bg-focus px-4 py-2 text-sm font-medium text-bg"
          >
            Add
          </button>
        </form>
      </section>
    </div>
  );
}
