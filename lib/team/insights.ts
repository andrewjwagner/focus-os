import type { ClassifyMomentInput, CoachingPlanInput, TalkingPointsInput } from "./ai-prompts";
import { noteTopics, sortByMeeting } from "./extract";
import { describePulseChanges, sortPulses } from "./pulse";
import { noteSummary, templateCoachingPlan, templateRecap, templateTalkingPoints } from "./rules";
import type { DerivedRecord } from "./store-idb";
import type {
  ActionItem,
  CachedAnalysis,
  CoachingItem,
  Moment,
  Person,
  PulseRating,
  TeamNote,
} from "./types";

/** Per-person view model shared by the person page, digest, and AI inputs. */

export type TeamSnapshot = {
  notes: TeamNote[];
  items: ActionItem[];
  moments: Moment[];
  pulses: PulseRating[];
  coaching: CoachingItem[];
  derived: Record<string, DerivedRecord>;
};

export type PersonView = {
  notes: TeamNote[];
  lastNote: TeamNote | null;
  theyOwe: ActionItem[];
  iOwe: ActionItem[];
  toSort: ActionItem[];
  others: ActionItem[];
  done: ActionItem[];
  moments: Moment[];
  pulses: PulseRating[];
  coaching: CoachingItem[];
  analyses: Record<string, CachedAnalysis>;
};

function byDue(a: ActionItem, b: ActionItem) {
  return (a.due ?? "9999").localeCompare(b.due ?? "9999");
}

export function analysesFrom(derived: Record<string, DerivedRecord>): Record<string, CachedAnalysis> {
  const out: Record<string, CachedAnalysis> = {};
  for (const record of Object.values(derived)) {
    if (record.kind === "analysis") out[record.noteId] = record;
  }
  return out;
}

export function personView(personId: string, snapshot: TeamSnapshot): PersonView {
  const notes = sortByMeeting(snapshot.notes.filter((note) => note.personId === personId));
  const items = snapshot.items.filter((item) => item.personId === personId);
  const open = items.filter((item) => !item.done).sort(byDue);
  return {
    notes,
    lastNote: notes[0] ?? null,
    theyOwe: open.filter((item) => item.ownerKind === "them"),
    iOwe: open.filter((item) => item.ownerKind === "me"),
    toSort: open.filter((item) => item.ownerKind === "unassigned"),
    others: open.filter((item) => item.ownerKind === "other"),
    done: items.filter((item) => item.done),
    moments: snapshot.moments
      .filter((moment) => moment.personId === personId)
      .sort((a, b) => b.date.localeCompare(a.date)),
    pulses: sortPulses(snapshot.pulses.filter((rating) => rating.personId === personId)),
    coaching: snapshot.coaching
      .filter((item) => item.personId === personId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    analyses: analysesFrom(snapshot.derived),
  };
}

export function talkingPointsInput(person: Person, view: PersonView, selfName: string): TalkingPointsInput {
  const last = view.lastNote;
  return {
    selfName,
    personName: person.name,
    role: person.role,
    theyOwe: view.theyOwe.map((item) => item.text).slice(0, 10),
    iOwe: view.iOwe.map((item) => item.text).slice(0, 10),
    lastSummary: last ? noteSummary(last, view.analyses[last.id]) : "",
    lastTopics: last ? noteTopics(last).slice(0, 6) : [],
    moments: view.moments.slice(0, 8).map((moment) => ({ date: moment.date, type: moment.type, text: moment.text })),
    pulseChanges: describePulseChanges(view.pulses),
  };
}

export function fallbackTalkingPoints(person: Person, view: PersonView): string[] {
  return templateTalkingPoints({
    personName: person.name,
    theyOwe: view.theyOwe,
    iOwe: view.iOwe,
    lastTopics: view.lastNote ? noteTopics(view.lastNote) : [],
    moments: view.moments,
    pulses: view.pulses,
  });
}

export function coachingInput(person: Person, view: PersonView): CoachingPlanInput {
  const themes = Object.values(view.analyses)
    .filter((cached) => cached.personId === person.id)
    .flatMap((cached) => cached.analysis.themes);
  return {
    personName: person.name,
    role: person.role,
    moments: view.moments
      .filter((moment) => moment.type === "issue" || moment.type === "coaching")
      .slice(0, 10)
      .map((moment) => ({ date: moment.date, type: moment.type, text: moment.text })),
    themes: [...new Set(themes)].slice(0, 8),
    existing: view.coaching.map((item) => item.text),
  };
}

export function fallbackCoaching(view: PersonView): string[] {
  return templateCoachingPlan(view.moments, view.coaching.map((item) => item.text));
}

/** Recap draft for a note: user edit, else AI draft, else template. */
export function recapFor(
  note: TeamNote,
  person: Person,
  snapshot: TeamSnapshot,
  selfName: string,
): { text: string; source: "edited" | "ai" | "template" } {
  const edited = snapshot.derived[`recap:${note.id}`];
  if (edited?.kind === "recap") return { text: edited.text, source: "edited" };
  const cached = snapshot.derived[`analysis:${note.id}`];
  if (cached?.kind === "analysis" && cached.analysis.recap) return { text: cached.analysis.recap, source: "ai" };
  const items = snapshot.items.filter((item) => item.noteId === note.id && !item.done);
  return {
    text: templateRecap({
      note,
      selfName,
      personName: person.name,
      iOwe: items.filter((item) => item.ownerKind === "me"),
      theyOwe: items.filter((item) => item.ownerKind === "them"),
    }),
    source: "template",
  };
}

export function classifyInput(text: string, tag: string): ClassifyMomentInput {
  return { text, tag };
}

/** Notes that need an AI pass: missing or stale cache, most recent first. */
export function notesNeedingAnalysis(
  notes: TeamNote[],
  derived: Record<string, DerivedRecord>,
  limit = 10,
): TeamNote[] {
  return sortByMeeting(notes)
    .filter((note) => {
      const cached = derived[`analysis:${note.id}`];
      return !(cached?.kind === "analysis" && cached.noteUpdatedAt === note.updatedAt);
    })
    .slice(0, limit);
}
