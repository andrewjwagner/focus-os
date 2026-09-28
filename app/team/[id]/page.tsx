"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ItemRow } from "@/components/team/ItemRow";
import { TeamGate } from "@/components/team/TeamGate";
import { TeamNav } from "@/components/team/TeamNav";
import { useTeam } from "@/lib/team/context";
import { buildPrepBrief, extractThemes, sortByMeeting } from "@/lib/team/extract";
import { roleLabel, shortDate, todayIso } from "@/lib/team/view";
import { fieldClass } from "@/lib/ui";

function PersonDetail({ id }: { id: string }) {
  const team = useTeam();
  const person = team.people.find((entry) => entry.id === id);
  const [momentDate, setMomentDate] = useState(() => todayIso());
  const [momentText, setMomentText] = useState("");
  const [momentTag, setMomentTag] = useState("");
  const [newItem, setNewItem] = useState("");
  const [showDone, setShowDone] = useState(false);

  const notes = useMemo(
    () => sortByMeeting(team.notes.filter((note) => note.personId === id)),
    [team.notes, id],
  );
  const items = useMemo(() => team.items.filter((item) => item.personId === id), [team.items, id]);
  const moments = useMemo(
    () =>
      team.moments
        .filter((moment) => moment.personId === id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [team.moments, id],
  );
  const people = team.people;
  const themes = useMemo(() => {
    const name = people.find((entry) => entry.id === id)?.name ?? "";
    const owners = items.map((item) => item.owner).filter((owner) => owner && owner !== "me");
    owners.push(...items.map((item) => item.ownerHint).filter(Boolean));
    return extractThemes(notes, { exclude: [name, ...owners] });
  }, [notes, items, people, id]);
  const brief = useMemo(() => buildPrepBrief({ notes, items, moments }), [notes, items, moments]);
  const noteById = useMemo(() => new Map(notes.map((note) => [note.id, note])), [notes]);

  if (!person) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-3xl">Person not found</h1>
        <Link href="/team" className="text-sm text-focus hover:underline">
          Back to Team
        </Link>
      </div>
    );
  }

  const openItems = items
    .filter((item) => !item.done)
    .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const doneItems = items.filter((item) => item.done);
  const firstName = person.name.split(/\s+/)[0] || "Their";
  const otherItems = openItems.filter((item) => item.ownerKind === "other");
  const otherNames = [...new Set(otherItems.map((item) => item.owner || "Other"))];
  const buckets = [
    { key: "me", title: "My action items", alwaysShow: true, items: openItems.filter((item) => item.ownerKind === "me") },
    { key: "them", title: "Their commitments", alwaysShow: true, items: openItems.filter((item) => item.ownerKind === "them") },
    { key: "unassigned", title: "Unassigned", alwaysShow: false, items: openItems.filter((item) => item.ownerKind === "unassigned") },
    ...otherNames.map((name) => ({
      key: `other-${name}`,
      title: name,
      alwaysShow: false,
      items: otherItems.filter((item) => (item.owner || "Other") === name),
    })),
  ];

  async function onAddMoment(event: FormEvent) {
    event.preventDefault();
    if (!momentText.trim()) return;
    await team.addMoment({ personId: id, date: momentDate, text: momentText, tag: momentTag });
    setMomentText("");
    setMomentTag("");
  }

  async function onAddItem(event: FormEvent) {
    event.preventDefault();
    await team.addItem(id, newItem);
    setNewItem("");
  }

  return (
    <div className="space-y-8">
      <section>
        <Link href="/team" className="text-xs text-muted hover:text-ink">
          Team
        </Link>
        <h1 className="mt-2 font-display text-4xl text-ink">{person.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {roleLabel(person.role)} · {notes.length} note{notes.length === 1 ? "" : "s"}
          {person.lastSync ? ` · synced ${shortDate(person.lastSync)}` : ""}
        </p>
        <div className="mt-4">
          <TeamNav />
        </div>
      </section>

      <section className="rounded-2xl border border-focus/40 bg-bg-elev p-4">
        <h2 className="font-display text-2xl text-ink">Prep for the next 1:1</h2>
        {brief.lastNote ? (
          <p className="mt-1 text-xs text-muted">
            Since {brief.lastNote.title} on {shortDate(brief.lastNote.meetingAt)}
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted">No synced notes yet.</p>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-xs uppercase tracking-wide text-muted">My open items</h3>
            <ul className="mt-2 space-y-1 text-sm text-ink">
              {brief.followUps.length === 0 ? <li className="text-muted">None.</li> : null}
              {brief.followUps.map((item) => (
                <li key={item.id}>{item.text}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-wide text-muted">
              Follow up on {firstName}&apos;s commitments
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-ink">
              {brief.theirCommitments.length === 0 ? <li className="text-muted">None.</li> : null}
              {brief.theirCommitments.map((item) => (
                <li key={item.id}>{item.text}</li>
              ))}
            </ul>
            {brief.unassigned.length > 0 ? (
              <p className="mt-2 text-xs text-muted">
                {brief.unassigned.length} unassigned item{brief.unassigned.length === 1 ? "" : "s"} below
                need an owner.
              </p>
            ) : null}
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-wide text-muted">Raised last time</h3>
            <ul className="mt-2 space-y-1 text-sm text-ink">
              {brief.lastTopics.length === 0 ? <li className="text-muted">No topics found.</li> : null}
              {brief.lastTopics.map((topic) => (
                <li key={topic}>{topic}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-wide text-muted">Moments since</h3>
            <ul className="mt-2 space-y-1 text-sm text-ink">
              {brief.momentsSince.length === 0 ? <li className="text-muted">None logged.</li> : null}
              {brief.momentsSince.map((moment) => (
                <li key={moment.id}>
                  <span className="text-muted">{shortDate(moment.date)}:</span> {moment.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl text-ink">Action items</h2>
          {doneItems.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowDone((value) => !value)}
              className="text-xs text-muted hover:text-ink"
            >
              {showDone ? "Hide done" : `Show done (${doneItems.length})`}
            </button>
          ) : null}
        </div>
        {buckets.map((bucket) =>
          bucket.items.length === 0 && !bucket.alwaysShow ? null : (
            <div key={bucket.key} className="space-y-2">
              <h3 className="text-xs uppercase tracking-wide text-muted">
                {bucket.title} ({bucket.items.length})
              </h3>
              <ul className="space-y-2">
                {bucket.items.length === 0 ? (
                  <li className="rounded-xl border border-dashed border-line px-3 py-3 text-sm text-muted">
                    Nothing here.
                  </li>
                ) : null}
                {bucket.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    personName={person.name}
                    note={item.noteId ? noteById.get(item.noteId) : undefined}
                  />
                ))}
              </ul>
            </div>
          ),
        )}
        {showDone && doneItems.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-xs uppercase tracking-wide text-muted">Done</h3>
            <ul className="space-y-2">
              {doneItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  personName={person.name}
                  note={item.noteId ? noteById.get(item.noteId) : undefined}
                />
              ))}
            </ul>
          </div>
        ) : null}
        <form onSubmit={onAddItem} className="flex gap-2">
          <input
            className={fieldClass}
            placeholder="Add an action item"
            value={newItem}
            onChange={(event) => setNewItem(event.target.value)}
          />
          <button type="submit" className="rounded-full border border-line px-3 text-sm text-ink">
            Add
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-ink">Recent themes</h2>
        {themes.length === 0 ? (
          <p className="text-sm text-muted">Themes appear after a few synced meetings.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {themes.map((theme) => (
              <span
                key={theme.label}
                className="rounded-full border border-line bg-card px-3 py-1 text-xs text-ink"
              >
                {theme.label}
                {theme.count > 1 ? <span className="text-muted"> ×{theme.count}</span> : null}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-ink">Moments</h2>
        <form onSubmit={onAddMoment} className="grid gap-2 sm:grid-cols-[auto_1fr_8rem_auto]">
          <input
            type="date"
            className={fieldClass}
            value={momentDate}
            onChange={(event) => setMomentDate(event.target.value)}
          />
          <input
            className={fieldClass}
            placeholder="What happened"
            value={momentText}
            onChange={(event) => setMomentText(event.target.value)}
          />
          <input
            className={fieldClass}
            placeholder="Tag (optional)"
            value={momentTag}
            onChange={(event) => setMomentTag(event.target.value)}
          />
          <button type="submit" className="rounded-full bg-focus px-4 py-1.5 text-sm font-medium text-bg">
            Log
          </button>
        </form>
        <ul className="space-y-2">
          {moments.length === 0 ? (
            <li className="text-sm text-muted">No moments logged yet.</li>
          ) : null}
          {moments.map((moment) => (
            <li
              key={moment.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-line bg-card px-3 py-2.5 text-sm"
            >
              <div>
                <span className="text-xs text-muted">{shortDate(moment.date)}</span>
                {moment.tag ? (
                  <span className="ml-2 rounded-full bg-focus/15 px-2 py-0.5 text-[11px] text-focus">
                    {moment.tag}
                  </span>
                ) : null}
                <p className="mt-1 text-ink">{moment.text}</p>
              </div>
              <button
                type="button"
                onClick={() => void team.removeMoment(moment.id)}
                className="text-xs text-muted hover:text-danger"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>

      {notes.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-display text-2xl text-ink">Meeting notes</h2>
          <ul className="space-y-1 text-sm">
            {notes.slice(0, 10).map((note) => (
              <li key={note.id} className="flex justify-between gap-3 text-muted">
                {note.webUrl ? (
                  <a href={note.webUrl} target="_blank" rel="noreferrer" className="text-ink hover:underline">
                    {note.title}
                  </a>
                ) : (
                  <span className="text-ink">{note.title}</span>
                )}
                <span>{shortDate(note.meetingAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export default function PersonPage() {
  const params = useParams<{ id: string }>();
  return (
    <TeamGate>
      <PersonDetail id={params.id} />
    </TeamGate>
  );
}
