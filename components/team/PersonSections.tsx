"use client";

import { FormEvent, useEffect, useState } from "react";
import { CopyButton } from "@/components/team/CopyButton";
import { ItemRow } from "@/components/team/ItemRow";
import { useTeam } from "@/lib/team/context";
import { highlightCounters, type MomentCounts } from "@/lib/team/highlights";
import { recapFor, type PersonView, type TeamSnapshot } from "@/lib/team/insights";
import { noteSummary, recentTopics } from "@/lib/team/rules";
import { MOMENT_TYPES, type ActionItem, type MomentType, type Person, type TeamNote, type Topic } from "@/lib/team/types";
import { shortDate, todayIso } from "@/lib/team/view";
import { fieldClass } from "@/lib/ui";

export const cardClass = "rounded-2xl border border-line bg-bg-elev p-4";
const smallButton = "rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-ink disabled:opacity-50";

const MOMENT_LABELS: Record<MomentType, string> = { win: "Win", issue: "Issue", coaching: "Coaching", note: "Note" };
const MOMENT_TONE: Record<MomentType, string> = {
  win: "bg-active/15 text-active",
  issue: "bg-danger/15 text-danger",
  coaching: "bg-inspired/15 text-inspired",
  note: "bg-tabled/15 text-tabled",
};

function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-display text-2xl text-ink">{children}</h2>
      {aside ? <div className="flex items-center gap-2">{aside}</div> : null}
    </div>
  );
}

export function LastNoteSection({ view }: { view: PersonView }) {
  const note = view.lastNote;
  return (
    <section className={cardClass}>
      <SectionTitle>Notes from last 1:1</SectionTitle>
      {note ? (
        <>
          <p className="mt-1 text-xs text-muted">
            {note.webUrl ? (
              <a href={note.webUrl} target="_blank" rel="noreferrer" className="hover:underline">
                {note.title}
              </a>
            ) : (
              note.title
            )}{" "}
            · {shortDate(note.meetingAt)}
            {view.analyses[note.id] ? " · AI summary" : ""}
          </p>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">
            {noteSummary(note, view.analyses[note.id]) || "This note has no summary yet."}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">No synced notes yet.</p>
      )}
    </section>
  );
}

function TopicList({ topics, empty }: { topics: Topic[]; empty: string }) {
  return (
    <ul className="mt-3 space-y-2 text-sm text-ink">
      {topics.length === 0 ? <li className="text-muted">{empty}</li> : null}
      {topics.map((topic) => (
        <li key={`${topic.noteId}-${topic.text}`} className="rounded-lg bg-card px-3 py-2">
          {topic.text}
          <span className="ml-2 text-[11px] text-muted">{shortDate(topic.meetingAt)}</span>
        </li>
      ))}
    </ul>
  );
}

function ItemBucket({
  title,
  items,
  person,
  noteById,
}: {
  title: string;
  items: ActionItem[];
  person: Person;
  noteById: Map<string, TeamNote>;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs uppercase tracking-wide text-muted">
        {title} ({items.length})
      </h3>
      <ul className="space-y-2">
        {items.length === 0 ? (
          <li className="rounded-xl border border-dashed border-line px-3 py-2 text-xs text-muted">Nothing here.</li>
        ) : null}
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            personName={person.name}
            note={item.noteId ? noteById.get(item.noteId) : undefined}
          />
        ))}
      </ul>
    </div>
  );
}

export function ColumnsSection({ person, view }: { person: Person; view: PersonView }) {
  const team = useTeam();
  const [newItem, setNewItem] = useState("");
  const [showDone, setShowDone] = useState(false);
  const topics = recentTopics(view.notes, view.analyses);
  const noteById = new Map(view.notes.map((note) => [note.id, note]));
  const firstName = person.name.split(/\s+/)[0] || "They";

  async function onAddItem(event: FormEvent) {
    event.preventDefault();
    await team.addItem(person.id, newItem);
    setNewItem("");
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_1fr_1.4fr]">
      <div className={cardClass}>
        <h2 className="font-display text-xl text-ink">Tactical</h2>
        <p className="text-[11px] text-muted">Work and delivery</p>
        <TopicList topics={topics.tactical} empty="No tactical topics yet." />
      </div>
      <div className={cardClass}>
        <h2 className="font-display text-xl text-ink">Nurture</h2>
        <p className="text-[11px] text-muted">Growth, wellbeing, career, feedback</p>
        <TopicList topics={topics.nurture} empty="No nurture topics yet." />
      </div>
      <div className={`${cardClass} space-y-4`}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-ink">Action items</h2>
          {view.done.length > 0 ? (
            <button type="button" onClick={() => setShowDone((value) => !value)} className="text-xs text-muted hover:text-ink">
              {showDone ? "Hide done" : `Done (${view.done.length})`}
            </button>
          ) : null}
        </div>
        <ItemBucket title={`${firstName} owes me`} items={view.theyOwe} person={person} noteById={noteById} />
        <ItemBucket title={`I owe ${firstName}`} items={view.iOwe} person={person} noteById={noteById} />
        {view.toSort.length > 0 ? (
          <ItemBucket title="To sort" items={view.toSort} person={person} noteById={noteById} />
        ) : null}
        {view.others.length > 0 ? (
          <ItemBucket title="Other owners" items={view.others} person={person} noteById={noteById} />
        ) : null}
        {showDone ? <ItemBucket title="Done" items={view.done} person={person} noteById={noteById} /> : null}
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
      </div>
    </section>
  );
}

export function TalkingPointsSection({ person }: { person: Person }) {
  const team = useTeam();
  const [busy, setBusy] = useState(false);
  const record = team.derived[`talking:${person.id}`];
  const points = record?.kind === "talking" ? record.points : null;

  async function regenerate() {
    setBusy(true);
    try {
      await team.regenerateTalkingPoints(person.id);
    } finally {
      setBusy(false);
    }
  }

  // First visit: generate once so the section is never empty.
  const hasPoints = Boolean(points);
  useEffect(() => {
    if (hasPoints) return;
    const timer = setTimeout(() => void regenerate(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person.id]);

  return (
    <section className={cardClass}>
      <SectionTitle
        aside={
          <>
            {points ? <CopyButton text={points.map((point) => `- ${point}`).join("\n")} /> : null}
            <button type="button" onClick={() => void regenerate()} disabled={busy} className={smallButton}>
              {busy ? "Thinking..." : "Regenerate"}
            </button>
          </>
        }
      >
        Talking points
      </SectionTitle>
      {record?.kind === "talking" ? (
        <p className="mt-1 text-[11px] text-muted">
          {record.provider === "rules" ? "From rules" : `From AI (${record.provider})`} · {shortDate(record.generatedAt)}
        </p>
      ) : null}
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink">
        {(points ?? []).map((point) => (
          <li key={point}>{point}</li>
        ))}
        {!points ? <li className="list-none text-muted">Generating...</li> : null}
      </ol>
    </section>
  );
}

function Counter({ label, counts }: { label: string; counts: MomentCounts }) {
  const cells: [string, number][] = [
    ["Total moments", counts.total],
    ["Wins", counts.win],
    ["Issues", counts.issue],
    ["Coaching", counts.coaching],
  ];
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <dl className="mt-1 grid grid-cols-4 gap-2">
        {cells.map(([name, value]) => (
          <div key={name} className="rounded-lg bg-card px-2 py-1.5 text-center">
            <dt className="text-[10px] text-muted">{name}</dt>
            <dd className="font-display text-xl text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function HighlightsSection({ person, view }: { person: Person; view: PersonView }) {
  const team = useTeam();
  const [date, setDate] = useState(() => todayIso());
  const [text, setText] = useState("");
  const [tag, setTag] = useState("");
  const [type, setType] = useState<MomentType | "auto">("auto");
  const [saving, setSaving] = useState(false);
  const counters = highlightCounters(view.moments);
  const standout = view.moments.filter((moment) => moment.type === "win").slice(0, 5);

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      await team.addMoment({ personId: person.id, date, text, tag, type });
      setText("");
      setTag("");
      setType("auto");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={`${cardClass} space-y-4`}>
      <SectionTitle>Highlights</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <Counter label="This year" counts={counters.thisYear} />
        <Counter label="Last 90 days" counts={counters.last90} />
      </div>
      <div>
        <h3 className="text-xs uppercase tracking-wide text-muted">Wins and standout moments</h3>
        <ul className="mt-2 space-y-1 text-sm text-ink">
          {standout.length === 0 ? <li className="text-muted">No wins logged yet.</li> : null}
          {standout.map((moment) => (
            <li key={moment.id}>
              <span className="text-muted">{shortDate(moment.date)}:</span> {moment.text}
            </li>
          ))}
        </ul>
      </div>
      <form onSubmit={onAdd} className="grid gap-2 sm:grid-cols-[auto_1fr_7rem_7rem_auto]">
        <input type="date" className={fieldClass} value={date} onChange={(event) => setDate(event.target.value)} />
        <input
          className={fieldClass}
          placeholder="Log a moment"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <input className={fieldClass} placeholder="Tag" value={tag} onChange={(event) => setTag(event.target.value)} />
        <select
          className={fieldClass}
          value={type}
          onChange={(event) => setType(event.target.value as MomentType | "auto")}
          aria-label="Moment type"
        >
          <option value="auto">Auto</option>
          {MOMENT_TYPES.map((option) => (
            <option key={option} value={option}>
              {MOMENT_LABELS[option]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-focus px-4 py-1.5 text-sm font-medium text-bg disabled:opacity-60"
        >
          {saving ? "Saving" : "Log"}
        </button>
      </form>
      <ul className="space-y-2">
        {view.moments.map((moment) => (
          <li
            key={moment.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-line bg-card px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <span className="text-xs text-muted">{shortDate(moment.date)}</span>
              <select
                value={moment.type}
                onChange={(event) => void team.setMomentType(moment.id, event.target.value as MomentType)}
                aria-label="Change moment type"
                className={`ml-2 rounded-full border-0 px-2 py-0.5 text-[11px] ${MOMENT_TONE[moment.type]}`}
              >
                {MOMENT_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {MOMENT_LABELS[option]}
                  </option>
                ))}
              </select>
              {moment.tag ? <span className="ml-2 text-[11px] text-muted">#{moment.tag}</span> : null}
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
  );
}

export function CoachingSection({ person, view }: { person: Person; view: PersonView }) {
  const team = useTeam();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function suggest() {
    setBusy(true);
    setMessage("");
    try {
      const added = await team.suggestCoaching(person.id);
      setMessage(added === 0 ? "No new suggestions." : `Added ${added} suggestion${added === 1 ? "" : "s"}.`);
    } finally {
      setBusy(false);
    }
  }

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    await team.addCoaching(person.id, text);
    setText("");
  }

  return (
    <section className={cardClass}>
      <SectionTitle
        aside={
          <button type="button" onClick={() => void suggest()} disabled={busy} className={smallButton}>
            {busy ? "Thinking..." : "Suggest"}
          </button>
        }
      >
        Coachable moments plan
      </SectionTitle>
      {message ? <p className="mt-1 text-[11px] text-muted">{message}</p> : null}
      <ul className="mt-3 space-y-1.5 text-sm">
        {view.coaching.length === 0 ? (
          <li className="text-muted">No plan yet. Log issue or coaching moments, then Suggest.</li>
        ) : null}
        {view.coaching.map((item) => (
          <li key={item.id} className="group flex items-start gap-2">
            <input
              type="checkbox"
              checked={item.done}
              onChange={(event) => void team.updateCoaching(item.id, { done: event.target.checked })}
              className="mt-1.5 accent-[var(--color-focus)]"
              aria-label="Done"
            />
            <input
              defaultValue={item.text}
              onBlur={(event) => {
                const next = event.target.value.trim();
                if (next && next !== item.text) void team.updateCoaching(item.id, { text: next });
              }}
              className={`flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 outline-none hover:border-line focus:border-focus ${
                item.done ? "text-muted line-through" : "text-ink"
              }`}
              aria-label="Coaching item"
            />
            <span className="pt-1 text-[10px] text-muted">{item.source === "manual" ? "" : item.source.toUpperCase()}</span>
            <button
              type="button"
              onClick={() => void team.removeCoaching(item.id)}
              className="pt-0.5 text-xs text-muted opacity-0 hover:text-danger group-hover:opacity-100"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={onAdd} className="mt-3 flex gap-2">
        <input
          className={fieldClass}
          placeholder="Add a coaching item"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="rounded-full border border-line px-3 text-sm text-ink">
          Add
        </button>
      </form>
    </section>
  );
}

function RecapCard({ note, person, snapshot }: { note: TeamNote; person: Person; snapshot: TeamSnapshot }) {
  const team = useTeam();
  const recap = recapFor(note, person, snapshot, team.selfName);
  // Local draft only while editing; otherwise show the stored recap.
  const [editDraft, setEditDraft] = useState<string | null>(null);
  const editing = editDraft !== null;
  const draft = editDraft ?? recap.text;

  return (
    <li className="rounded-xl border border-line bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {note.title} · {shortDate(note.meetingAt)} ·{" "}
          {recap.source === "edited" ? "edited" : recap.source === "ai" ? "AI draft" : "template"}
        </p>
        <div className="flex gap-2">
          <CopyButton text={draft} />
          {editing ? (
            <button
              type="button"
              className={smallButton}
              onClick={() => {
                void team.saveRecap(note.id, person.id, draft);
                setEditDraft(null);
              }}
            >
              Save
            </button>
          ) : (
            <button type="button" className={smallButton} onClick={() => setEditDraft(recap.text)}>
              Edit
            </button>
          )}
          {recap.source === "edited" && !editing ? (
            <button type="button" className={smallButton} onClick={() => void team.resetRecap(note.id)}>
              Reset
            </button>
          ) : null}
        </div>
      </div>
      {editing ? (
        <textarea
          value={draft}
          onChange={(event) => setEditDraft(event.target.value)}
          rows={10}
          className={`${fieldClass} mt-2 font-mono text-xs`}
          aria-label="Recap draft"
        />
      ) : (
        <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-ink">{draft}</pre>
      )}
    </li>
  );
}

export function RecapSection({ person, view, snapshot }: { person: Person; view: PersonView; snapshot: TeamSnapshot }) {
  const recent = view.notes.slice(0, 3);
  return (
    <section className={cardClass}>
      <SectionTitle>Recap drafts</SectionTitle>
      <p className="mt-1 text-[11px] text-muted">Follow-up drafts for your synced 1:1s. Copy into your mail app.</p>
      <ul className="mt-3 space-y-3">
        {recent.length === 0 ? <li className="text-sm text-muted">Drafts appear after a synced note.</li> : null}
        {recent.map((note) => (
          <RecapCard key={note.id} note={note} person={person} snapshot={snapshot} />
        ))}
      </ul>
    </section>
  );
}
