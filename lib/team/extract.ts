import { looksLikeName, resolveOwner, type HintStrength, type Identity } from "./owner";
import type { ActionItem, Moment, PrepBrief, TeamNote, Theme } from "./types";

/**
 * Heuristic, no-LLM extraction from Granola summary markdown.
 * Everything here is pure so it can be unit tested with fictional notes.
 */

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

const ACTION_PHRASE =
  "(?:action items?|action points?|next steps?|to-?dos?|to do|follow[- ]?ups?|tasks?|commitments|takeaways and next steps)";
const NAME_RE = "[A-Z][A-Za-z'\u2019.-]+(?: [A-Z][A-Za-z'\u2019.-]+){0,2}";
const QUALIFIER = "(?:(?:key|open|agreed|my|our|their|his|her|suggested|immediate)\\s+)?";

/**
 * Only headings that are about action items count. A topic heading that
 * merely contains "tasks" or "owners" is not an action section.
 * Returns the owner when the heading names one ("Alex's next steps").
 */
export function classifyActionHeading(heading: string): { action: boolean; owner: string } {
  const text = stripMarkdown(heading).replace(/[:.]\s*$/, "").trim();
  const plain = new RegExp(`^${QUALIFIER}${ACTION_PHRASE}(?:\\s*(?:&|and)\\s+[a-z]+(?: [a-z]+)?)?$`, "i");
  if (plain.test(text)) return { action: true, owner: "" };
  const possessive = text.match(new RegExp(`^(${NAME_RE}|My|Our)['\u2019]s?\\s+${QUALIFIER}${ACTION_PHRASE}$`, "i"));
  if (possessive) return { action: true, owner: /^(my)$/i.test(possessive[1]) ? "me" : /^our$/i.test(possessive[1]) ? "" : possessive[1] };
  const suffix = text.match(
    new RegExp(`^${QUALIFIER}${ACTION_PHRASE}\\s*(?:for|from|by|-|\u2013|\u2014|:|\\()\\s*(${NAME_RE}|me|you)\\)?$`, "i"),
  );
  if (suffix) return { action: true, owner: suffix[1] };
  return { action: false, owner: "" };
}

export function isActionHeading(heading: string): boolean {
  return classifyActionHeading(heading).action;
}

/** A sub-heading, bold line, or bare bullet that names an owner group. */
export function ownerGroupLabel(line: string): string | null {
  const text = stripMarkdown(line).replace(/\s*:\s*$/, "").trim();
  if (!text) return null;
  if (/^(me|i|myself)$/i.test(text)) return "me";
  const match = text.match(
    new RegExp(
      `^(?:for\\s+|owner:\\s*)?(${NAME_RE}|@[A-Za-z][\\w.-]*)(?:['\u2019]s)?(?:\\s+${ACTION_PHRASE})?(?:\\s*\\([^)]*\\))?$`,
    ),
  );
  if (!match) return null;
  const label = match[1];
  if (!/^@/.test(label) && !looksLikeNameLabel(label)) return null;
  return label.replace(/^@/, "");
}

function looksLikeNameLabel(label: string): boolean {
  return looksLikeName(label) && !new RegExp(`^${ACTION_PHRASE}$`, "i").test(label) && !/^(Summary|Notes|Other|Misc|Next|Action|Owner|Owners|Decisions?|Context|Background|Details)$/i.test(label.split(" ")[0]);
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

export type OwnerHint = { hint: string; strength: HintStrength; text: string };

const MODAL =
  "(?:will|to|should|needs? to|is going to|'ll|plans? to|agreed to|offered to|owns|can|must|has to|is to|takes?)";
const SELF_SUBJECT = /^(I|I'll|I will|I'm going to|Me)\b/;

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").replace(/\s+([,.;:])/g, "$1").replace(/^[\s,;:.-]+|[\s,;:-]+$/g, "").trim();
}

/**
 * Owner patterns inside one item. Strong: explicit owner fields, @mentions,
 * "Name: task", and "Name will / to / should ...". Weak (only trusted when the
 * name matches someone known): "(Name)" and trailing "- Name".
 */
export function findOwnerHint(input: string, { leading = true } = {}): OwnerHint | null {
  const text = input.trim();

  const field = text.match(
    new RegExp(`[(\\[]?\\b(?:owner|owners|assignee|assigned to|responsible|dri|who)\\s*:\\s*([\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+|${NAME_RE}|me|I|@[\\w.-]+)[)\\]]?`, "i"),
  );
  if (field) return { hint: field[1].replace(/^@/, ""), strength: "strong", text: clean(text.replace(field[0], "")) };

  const mention = text.match(/(^|\s)@([A-Za-z][\w.-]*(?: [A-Z][A-Za-z'.-]+)?)/);
  if (mention) {
    const token = `@${mention[2]}`;
    const atEdge = text.startsWith(token) || text.endsWith(token);
    const withoutMention = capitalize(clean(text.replace(token, atEdge ? "" : mention[2])));
    return { hint: mention[2], strength: "strong", text: withoutMention };
  }

  if (leading) {
    const colon = text.match(new RegExp(`^(${NAME_RE}|Me|I)\\s*:\\s+(.+)$`));
    if (colon && (/^(Me|I)$/.test(colon[1]) || looksLikeName(colon[1]))) return { hint: colon[1], strength: "strong", text: capitalize(clean(colon[2])) };
    if (SELF_SUBJECT.test(text)) return { hint: "me", strength: "strong", text };
  }

  // Clause-initial subject with a modal, anywhere in the text: "...; Alex will send".
  const clauses = text.split(/(?:[;.]\s+|:\s+|,\s+(?:and\s+)?(?=[A-Z]))/);
  for (let index = 0; index < clauses.length; index += 1) {
    const clause = clauses[index].trim();
    const self = clause.match(/^(I|I'll|I will|I'm going to|We'll)\b/);
    if (self && self[1] !== "We'll") return { hint: "me", strength: "strong", text };
    const subject = clause.match(new RegExp(`^(${NAME_RE})\\s+(${MODAL})\\s+(.+)$`));
    if (subject && looksLikeName(subject[1]) && !/^(The|We|Team|Everyone|All|This|That|It|They|Both|He|She|You)\b/.test(subject[1])) {
      const rest = index === 0 && leading ? capitalize(subject[3]) : text;
      return { hint: subject[1], strength: "strong", text: subject[2] === "'ll" ? text : rest };
    }
    const possessive = clause.match(new RegExp(`^(${NAME_RE})['\u2019]s\\s+(?:action|task|to-?do|next step)`, "i"));
    if (possessive && looksLikeName(possessive[1])) return { hint: possessive[1], strength: "strong", text };
  }

  const trailing = text.match(new RegExp(`\\s+[-\u2013\u2014]\\s+(${NAME_RE})\\.?$`));
  if (trailing && looksLikeName(trailing[1])) return { hint: trailing[1], strength: "weak", text: clean(text.slice(0, trailing.index)) };

  const paren = text.match(new RegExp(`\\s*\\((${NAME_RE})\\)`));
  if (paren && looksLikeName(paren[1])) return { hint: paren[1], strength: "weak", text: clean(text.replace(paren[0], "")) };

  return null;
}

type LineInfo =
  | { type: "heading"; level: number; text: string }
  | { type: "bullet"; indent: number; checked: boolean; body: string; bold: boolean }
  | { type: "text"; indent: number; body: string };

function classifyLine(raw: string): LineInfo | null {
  if (!raw.trim()) return null;
  const hash = raw.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
  if (hash) return { type: "heading", level: hash[1].length, text: stripMarkdown(hash[2]) };
  const boldLine = raw.match(/^\s*(?:\*\*|__)(.+?)(?:\*\*|__)\s*:?\s*$/);
  if (boldLine) return { type: "heading", level: 7, text: stripMarkdown(boldLine[1]).replace(/:$/, "") };
  const bullet = raw.match(BULLET);
  if (bullet) {
    return {
      type: "bullet",
      indent: bullet[1].replace(/\t/g, "    ").length,
      checked: bullet[2]?.toLowerCase() === "x",
      body: bullet[3],
      bold: /^\s*(?:\*\*|__)/.test(bullet[3]),
    };
  }
  return { type: "text", indent: (raw.match(/^\s*/)?.[0] ?? "").replace(/\t/g, "    ").length, body: raw.trim() };
}

export type ExtractedItem = {
  id: string;
  personId: string;
  noteId: string;
  text: string;
  detail: string;
  ownerHint: string;
  hintStrength: HintStrength;
  due: string | null;
  done: boolean;
  createdAt: string;
};

type Draft = {
  raw: string;
  title: string;
  details: string[];
  indent: number;
  done: boolean;
  groupOwner: string;
};

/**
 * Items from action / next steps sections. Handles "- **Title**" bullets with
 * continuation lines, nested detail bullets, and per-person groups (sub-heading,
 * bold name line, "Name:" line, or a bare name bullet with nested items).
 */
export function extractItems(
  note: Pick<TeamNote, "id" | "personId" | "summaryMarkdown" | "meetingAt">,
): ExtractedItem[] {
  const reference = new Date(note.meetingAt);
  const safeRef = Number.isNaN(reference.getTime()) ? new Date() : reference;
  const drafts: Draft[] = [];
  let actionLevel: number | null = null;
  let sectionOwner = "";
  let group: { owner: string; indent: number } | null = null;
  let current: Draft | null = null;
  // A bullet that is only a name becomes an owner group if nested items follow.
  let pendingLabel: Draft | null = null;

  const flush = () => {
    if (current) drafts.push(current);
    current = null;
  };
  const settlePending = (nested: boolean) => {
    if (pendingLabel && !nested) drafts.push(pendingLabel);
    pendingLabel = null;
  };

  for (const rawLine of (note.summaryMarkdown ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = classifyLine(rawLine);
    if (!line) continue;

    if (line.type === "heading") {
      settlePending(false);
      const heading = classifyActionHeading(line.text);
      if (heading.action) {
        flush();
        actionLevel = line.level;
        sectionOwner = heading.owner;
        group = null;
        continue;
      }
      if (actionLevel === null) continue;
      const label = ownerGroupLabel(line.text);
      if (line.level > actionLevel || line.level === 7) {
        // Sub-heading or bold line inside an action section.
        flush();
        group = label ? { owner: label, indent: -1 } : null;
        continue;
      }
      flush();
      actionLevel = null;
      sectionOwner = "";
      group = null;
      continue;
    }

    if (actionLevel === null) continue;

    if (line.type === "text") {
      const label = ownerGroupLabel(line.body);
      settlePending(false);
      if (label && /:\s*$/.test(line.body)) {
        flush();
        group = { owner: label, indent: -1 };
        continue;
      }
      if (current) current.details.push(stripMarkdown(line.body));
      continue;
    }

    const body = stripMarkdown(line.body);
    if (!body) continue;
    const pending = pendingLabel as Draft | null;
    settlePending(pending !== null && line.indent > pending.indent);
    if (group && group.indent >= 0 && line.indent <= group.indent) group = null;

    // Nested bullet under an item is detail, not a new item.
    const active = current as Draft | null;
    if (active && line.indent > active.indent) {
      active.details.push(body);
      continue;
    }

    // A bare name bullet with nested items is an owner group.
    const label = /:\s*$/.test(body) || !/\s/.test(body) || /^[A-Z][\w'.-]+ [A-Z][\w'.-]+:?$/.test(body)
      ? ownerGroupLabel(body)
      : null;
    if (label) {
      flush();
      group = { owner: label, indent: line.indent };
      pendingLabel = {
        raw: body,
        title: body,
        details: [],
        indent: line.indent,
        done: line.checked,
        groupOwner: sectionOwner,
      };
      continue;
    }

    flush();
    current = {
      raw: body,
      title: body,
      details: [],
      indent: line.indent,
      done: line.checked,
      groupOwner: group?.owner ?? sectionOwner,
    };
  }
  flush();
  settlePending(false);

  const items: ExtractedItem[] = [];
  const seen = new Set<string>();
  for (const draft of drafts) {
    const detail = draft.details.join(" ").trim();
    let text = draft.title.replace(/\s*[.;]$/, "");
    let hint = "";
    let strength: HintStrength = "strong";
    const own = findOwnerHint(text);
    if (own) {
      hint = own.hint;
      strength = own.strength;
      text = own.text || text;
    } else if (draft.groupOwner) {
      hint = draft.groupOwner;
    } else if (detail) {
      const fromDetail = findOwnerHint(detail, { leading: true });
      if (fromDetail) {
        hint = fromDetail.hint;
        strength = fromDetail.strength;
      }
    }
    if (draft.groupOwner && own?.strength === "weak") {
      // A group heading beats a weak inline guess.
      hint = draft.groupOwner;
      strength = "strong";
    }
    const id = itemId(note.id, draft.raw);
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      personId: note.personId,
      noteId: note.id,
      text,
      detail,
      ownerHint: hint,
      hintStrength: strength,
      due: parseDue(text, safeRef) ?? (detail ? parseDue(detail, safeRef) : null),
      done: draft.done,
      createdAt: note.meetingAt,
    });
  }
  return items;
}

const FALLBACK_IDENTITY: Identity = {
  selfNames: [],
  selfEmails: [],
  person: { id: "", name: "" },
  others: [],
};

export function toActionItem(item: ExtractedItem, identity: Identity): ActionItem {
  const resolved = resolveOwner(item.ownerHint, identity, item.hintStrength);
  return {
    id: item.id,
    personId: item.personId,
    noteId: item.noteId,
    text: item.text,
    detail: item.detail,
    ownerKind: resolved.kind,
    owner: resolved.name,
    ownerHint: item.ownerHint,
    ownerEdited: false,
    edited: false,
    due: item.due,
    done: item.done,
    createdAt: item.createdAt,
  };
}

/** Extract and resolve owners in one step. */
export function extractActionItems(
  note: Pick<TeamNote, "id" | "personId" | "summaryMarkdown" | "meetingAt">,
  identity: Identity = FALLBACK_IDENTITY,
): ActionItem[] {
  return extractItems(note).map((item) => toActionItem(item, identity));
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

export function isMine(item: Pick<ActionItem, "ownerKind">): boolean {
  return item.ownerKind === "me";
}

export function isTheirs(item: Pick<ActionItem, "ownerKind">): boolean {
  return item.ownerKind === "them";
}

/** Prep brief for the next 1:1: my open items plus their commitments. */
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
    followUps: open.filter(isMine),
    theirCommitments: open.filter(isTheirs),
    unassigned: open.filter((item) => item.ownerKind === "unassigned"),
    lastTopics: last ? noteTopics(last).slice(0, 6) : [],
    momentsSince: input.moments
      .filter((moment) => moment.date >= sinceDay)
      .sort((a, b) => b.date.localeCompare(a.date)),
  };
}
