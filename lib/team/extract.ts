import type { ActionItem, Moment, PrepBrief, TeamNote, Theme } from "./types";

/**
 * Heuristic, no-LLM extraction from Granola summary markdown.
 * Everything here is pure so it can be unit tested with fictional notes.
 */

const ACTION_HEADING =
  /\b(action items?|action points?|next steps?|to-?dos?|follow[- ]?ups?|tasks?|owners?)\b/i;
const GENERIC_HEADINGS = new Set([
  "summary",
  "notes",
  "overview",
  "meeting notes",
  "discussion",
  "key points",
  "key takeaways",
  "takeaways",
  "other",
  "misc",
  "agenda",
]);

export type Section = { heading: string; lines: string[] };

export function stripMarkdown(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function headingOf(line: string): string | null {
  const hash = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
  if (hash) return stripMarkdown(hash[1]);
  // Bold-only line used as a heading, e.g. "**Next steps**" or "**Next steps:**"
  const bold = line.match(/^\s*(?:\*\*|__)(.+?)(?:\*\*|__)\s*:?\s*$/);
  if (bold) return stripMarkdown(bold[1]).replace(/:$/, "");
  return null;
}

export function splitSections(markdown: string): Section[] {
  const sections: Section[] = [{ heading: "", lines: [] }];
  for (const raw of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = headingOf(raw);
    if (heading !== null) {
      sections.push({ heading, lines: [] });
      continue;
    }
    if (raw.trim()) sections[sections.length - 1].lines.push(raw);
  }
  return sections.filter((section) => section.heading || section.lines.length);
}

export function isActionHeading(heading: string): boolean {
  return ACTION_HEADING.test(heading);
}

const BULLET = /^(\s*)(?:[-*+•]|\d+[.)])\s+(?:\[( |x|X)\]\s+)?(.*)$/;

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];
const WEEKDAY_NAMES = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDay(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return date;
}

/** Parse a due hint relative to the note date. Returns YYYY-MM-DD or null. */
export function parseDue(text: string, reference: Date): string | null {
  const ref = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()),
  );
  const lower = text.toLowerCase();

  const iso = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const date = utcDay(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (date) return isoDate(date);
  }

  const cue = "(?:by|due|before|on|until|for)\\s+(?:next\\s+|this\\s+)?";

  const slash = lower.match(new RegExp(`\\b${cue}(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?\\b`));
  if (slash) {
    let year = slash[3] ? Number(slash[3]) : ref.getUTCFullYear();
    if (year < 100) year += 2000;
    let date = utcDay(year, Number(slash[1]) - 1, Number(slash[2]));
    if (date && !slash[3] && date < ref) date = utcDay(year + 1, date.getUTCMonth(), date.getUTCDate());
    if (date) return isoDate(date);
  }

  const month = lower.match(
    new RegExp(`\\b${cue}(${MONTHS.join("|")})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`),
  );
  if (month) {
    const m = MONTHS.indexOf(month[1]);
    let date = utcDay(ref.getUTCFullYear(), m, Number(month[2]));
    if (date && date < ref) date = utcDay(ref.getUTCFullYear() + 1, m, Number(month[2]));
    if (date) return isoDate(date);
  }

  const weekday = lower.match(
    new RegExp(`\\b${cue}(${WEEKDAY_NAMES.join("|")}|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\\b`),
  );
  if (weekday) {
    const index = WEEKDAY_NAMES.findIndex((name) => name.startsWith(weekday[1].slice(0, 3)));
    let delta = (index - ref.getUTCDay() + 7) % 7;
    if (delta === 0) delta = 7;
    if (/\bnext\s+\w+day\b/.test(lower) && delta < 7) delta += 7;
    return isoDate(new Date(ref.getTime() + delta * 86_400_000));
  }

  if (/\b(eod|end of day|today)\b/.test(lower)) return isoDate(ref);
  if (/\btomorrow\b/.test(lower)) return isoDate(new Date(ref.getTime() + 86_400_000));
  if (/\b(eow|end of (the )?week)\b/.test(lower)) {
    const delta = (5 - ref.getUTCDay() + 7) % 7;
    return isoDate(new Date(ref.getTime() + delta * 86_400_000));
  }
  if (/\bnext week\b/.test(lower)) return isoDate(new Date(ref.getTime() + 7 * 86_400_000));
  return null;
}

const SELF = /^(i|me|myself|i'll|i will|we'll)$/i;
const NAME = "[A-Z][A-Za-z'.-]+(?: [A-Z][A-Za-z'.-]+)?";

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

/** Owner heuristics. Returns the owner and the item text without the owner prefix. */
export function parseOwner(text: string): { owner: string; text: string } {
  const paren = text.match(/\((?:owner|assignee|who)\s*:\s*([^)]+)\)/i);
  if (paren) {
    const owner = paren[1].trim();
    return {
      owner: SELF.test(owner) ? "me" : owner,
      text: text.replace(paren[0], "").replace(/\s+/g, " ").trim(),
    };
  }
  if (/^(i|i'll|i will|i'm going to)\b/i.test(text)) return { owner: "me", text };
  const colon = text.match(new RegExp(`^(${NAME}|Me|I)\\s*:\\s+(.+)$`));
  if (colon) {
    return { owner: SELF.test(colon[1]) ? "me" : colon[1], text: capitalize(colon[2].trim()) };
  }
  const verb = text.match(new RegExp(`^(${NAME})\\s+(?:to|will|should|owns|is going to)\\s+(.+)$`));
  if (verb && !/^(The|We|Team|Everyone|All|This|That|It)\b/.test(verb[1])) {
    return { owner: verb[1], text: capitalize(verb[2]) };
  }
  if (/^we\b/i.test(text)) return { owner: "", text };
  return { owner: "", text };
}

/** Stable, short hash for deterministic item ids (keeps edits across re-syncs). */
export function hashString(value: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function itemId(noteId: string, text: string): string {
  return `item-${noteId}-${hashString(text.toLowerCase().replace(/\W+/g, " ").trim())}`;
}

/** Extract action items from the action / next steps sections of a note. */
export function extractActionItems(
  note: Pick<TeamNote, "id" | "personId" | "summaryMarkdown" | "meetingAt">,
): ActionItem[] {
  const reference = new Date(note.meetingAt);
  const safeRef = Number.isNaN(reference.getTime()) ? new Date() : reference;
  const items: ActionItem[] = [];
  const seen = new Set<string>();

  for (const section of splitSections(note.summaryMarkdown ?? "")) {
    if (!isActionHeading(section.heading)) continue;
    let groupOwner: { indent: number; owner: string } | null = null;

    for (const line of section.lines) {
      const bullet = line.match(BULLET);
      if (!bullet) {
        // A plain "Name:" line groups the bullets under it.
        const label = stripMarkdown(line).match(new RegExp(`^(${NAME}|Me|I)\\s*:$`));
        groupOwner = label
          ? { indent: -1, owner: SELF.test(label[1]) ? "me" : label[1] }
          : groupOwner;
        continue;
      }
      const indent = bullet[1].replace(/\t/g, "    ").length;
      const checked = bullet[2]?.toLowerCase() === "x";
      const body = stripMarkdown(bullet[3]);
      if (!body) continue;

      if (groupOwner && indent <= groupOwner.indent) groupOwner = null;

      // "- Alex Rivera" or "- Alex Rivera:" with nested bullets is an owner group.
      const ownerOnly = body.match(new RegExp(`^(${NAME}|Me|I)\\s*:?$`));
      if (ownerOnly) {
        groupOwner = { indent, owner: SELF.test(ownerOnly[1]) ? "me" : ownerOnly[1] };
        continue;
      }

      const parsed = parseOwner(body);
      const owner = parsed.owner || groupOwner?.owner || "";
      const text = parsed.text.replace(/\s*[.;]$/, "");
      const id = itemId(note.id, text);
      if (seen.has(id)) continue;
      seen.add(id);
      items.push({
        id,
        personId: note.personId,
        noteId: note.id,
        text,
        owner,
        due: parseDue(text, safeRef),
        done: checked,
        createdAt: note.meetingAt,
      });
    }
  }
  return items;
}

/** Topic headings of a note, skipping action and generic sections. */
export function noteTopics(note: Pick<TeamNote, "summaryMarkdown">): string[] {
  const topics: string[] = [];
  for (const section of splitSections(note.summaryMarkdown ?? "")) {
    const heading = section.heading.trim();
    if (!heading || isActionHeading(heading)) continue;
    if (GENERIC_HEADINGS.has(heading.toLowerCase())) continue;
    if (!topics.includes(heading)) topics.push(heading);
  }
  return topics;
}

const STOPWORDS = new Set(
  (
    "about above after again against also because been before being below between both " +
    "could does doing down during each from further have having here into itself just more " +
    "most other over same should some such than that their theirs them then there these they " +
    "this those through under until very were what when where which while will with would " +
    "your yours need needs make made next week weeks meeting call sync discussed discuss " +
    "going want wants think thinks thought still really around things thing like maybe " +
    "action items steps follow team update updates today tomorrow plan plans work working"
  ).split(" "),
);

export function sortByMeeting<T extends Pick<TeamNote, "meetingAt">>(notes: T[]): T[] {
  return [...notes].sort((a, b) => b.meetingAt.localeCompare(a.meetingAt));
}

/** Themes across recent notes: repeated headings first, then frequent terms. */
export function extractThemes(
  notes: Pick<TeamNote, "summaryMarkdown" | "summaryText" | "meetingAt" | "title">[],
  { recent = 6, limit = 6, exclude = [] as string[] } = {},
): Theme[] {
  const window = sortByMeeting(notes).slice(0, recent);
  const headingCounts = new Map<string, { label: string; count: number }>();
  const termCounts = new Map<string, number>();
  // Skip names (the person, owners) and title words so themes are topics.
  const skip = new Set(
    [...exclude, ...window.map((note) => note.title ?? "")]
      .join(" ")
      .toLowerCase()
      .match(/[a-z][a-z'-]+/g) ?? [],
  );

  for (const note of window) {
    const perNote = new Set<string>();
    for (const topic of noteTopics(note)) {
      const key = topic.toLowerCase();
      if (perNote.has(key)) continue;
      perNote.add(key);
      const entry = headingCounts.get(key) ?? { label: topic, count: 0 };
      entry.count += 1;
      headingCounts.set(key, entry);
    }
    const text = stripMarkdown(`${note.summaryMarkdown ?? ""} ${note.summaryText ?? ""}`);
    const terms = new Set(
      (text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []).filter(
        (term) => !STOPWORDS.has(term) && !skip.has(term),
      ),
    );
    for (const term of terms) termCounts.set(term, (termCounts.get(term) ?? 0) + 1);
  }

  const themes: Theme[] = [...headingCounts.values()].sort((a, b) => b.count - a.count);
  const minTermCount = window.length > 1 ? 2 : 1;
  const terms = [...termCounts.entries()]
    .filter(([, count]) => count >= minTermCount)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [term, count] of terms) {
    if (themes.length >= limit) break;
    if (themes.some((theme) => theme.label.toLowerCase().includes(term))) continue;
    themes.push({ label: term, count });
  }
  return themes.slice(0, limit);
}

export function isMine(item: Pick<ActionItem, "owner">): boolean {
  return item.owner.trim().toLowerCase() === "me";
}

/** Prep brief for the next 1:1. */
export function buildPrepBrief(input: {
  notes: TeamNote[];
  items: ActionItem[];
  moments: Moment[];
}): PrepBrief {
  const [last] = sortByMeeting(input.notes);
  const open = input.items
    .filter((item) => !item.done)
    .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const sinceDay = last ? last.meetingAt.slice(0, 10) : "";
  return {
    lastNote: last
      ? { id: last.id, title: last.title, meetingAt: last.meetingAt, webUrl: last.webUrl }
      : null,
    stillOpen: open.filter((item) => !isMine(item)),
    followUps: open.filter(isMine),
    lastTopics: last ? noteTopics(last).slice(0, 6) : [],
    momentsSince: input.moments
      .filter((moment) => moment.date >= sinceDay)
      .sort((a, b) => b.date.localeCompare(a.date)),
  };
}
