import type { OwnerKind, Person } from "./types";

/**
 * Owner resolution. Maps a raw owner label from a note ("Alex", "@Rivera",
 * "me") to me, them (the person whose note it is), another named person, or
 * unassigned. Pure and tested with fictional names only.
 */

export type HintStrength = "strong" | "weak";

export type Identity = {
  /** Full names that mean me: Team settings "Your name" plus the note owner. */
  selfNames: string[];
  selfEmails: string[];
  /** The person whose note this is. */
  person: Pick<Person, "id" | "name">;
  /** Everyone else configured in Team settings. */
  others: Pick<Person, "id" | "name">[];
};

export type ResolvedOwner = { kind: OwnerKind; name: string };

const SELF_WORDS = new Set(["me", "i", "myself", "i'll", "im", "i'm", "mine"]);

/** Capitalized words that look like names but are labels or verbs in notes. */
const NOT_NAMES = new Set(
  (
    "plan note notes next goal goals context decision decisions status update updates idea ideas " +
    "risk risks question questions timeline team everyone all this that it the we they both need " +
    "needs follow action actions owner owners due todo agenda topic background result results " +
    "outcome summary task tasks try continue want aim start begin expect hope remember make " +
    "consider review discuss schedule send share set check confirm draft book create add " +
    "prepare reach connect ask align explore finalize update sync meet talk think work keep " +
    "monday tuesday wednesday thursday friday saturday sunday january february march april may " +
    "june july august september october november december eod eow asap tbd tbc fyi n/a na " +
    "q1 q2 q3 q4 h1 h2 okr okrs kpi kpis mvp pm eng ops hr " +
    "introduce intro loop ping email message call circle write build ship test run fix move get " +
    "give take bring put find look read organize host invite reply respond document clarify " +
    "gather collect compile provide identify define decide evaluate assess research investigate " +
    "propose present demo publish post upload file submit request approve sign pay hire interview " +
    "onboard train coach mentor recruit escalate flag raise track monitor measure analyze " +
    "summarize outline map scope estimate prioritize assign delegate own lead drive kick wrap " +
    "close open cancel reschedule block grab pull push merge deploy launch release migrate " +
    "upgrade configure install setup revisit rethink sort figure nail lock pick use leverage " +
    "partner coordinate collaborate support help join attend visit pair shadow invest learn " +
    "study practice improve refine iterate polish clean capture log record note list"
  ).split(" "),
);

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/['’]s$/, "")
    .replace(/[^a-z0-9@.' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(name: string): string[] {
  return normalizeName(name).split(" ").filter(Boolean);
}

type Candidate = { kind: OwnerKind; name: string; full: string; first: string; last: string };

function candidate(kind: OwnerKind, name: string): Candidate | null {
  const parts = tokens(name);
  if (parts.length === 0) return null;
  return {
    kind,
    name: name.trim(),
    full: parts.join(" "),
    first: parts[0],
    last: parts.length > 1 ? parts[parts.length - 1] : "",
  };
}

export function looksLikeName(label: string): boolean {
  const parts = label.trim().replace(/^@/, "").split(/\s+/);
  if (parts.length === 0 || parts.length > 3) return false;
  if (!parts.every((part) => /^[A-Z][A-Za-z'’.-]*$/.test(part))) return false;
  return !NOT_NAMES.has(parts[0].toLowerCase().replace(/['’]s$/, ""));
}

type Choice = Candidate | "ambiguous" | null;

function choose(list: Candidate[]): Choice {
  const unique = new Map(list.map((entry) => [`${entry.kind}:${entry.full}`, entry]));
  const values = [...unique.values()];
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];
  // Two spellings of my own name are still me.
  if (values.every((entry) => entry.kind === "me")) return values[0];
  // Within a person's page, a shared name that matches that person maps to them.
  return values.find((entry) => entry.kind === "them") ?? "ambiguous";
}

export function resolveOwner(
  hint: string,
  identity: Identity,
  strength: HintStrength = "strong",
): ResolvedOwner {
  const raw = hint.trim();
  if (!raw) return { kind: "unassigned", name: "" };
  const norm = normalizeName(raw);
  if (SELF_WORDS.has(norm)) return { kind: "me", name: "me" };

  if (norm.includes("@") && !norm.startsWith("@")) {
    const email = norm.replace(/\s/g, "");
    if (identity.selfEmails.some((entry) => entry.trim().toLowerCase() === email)) {
      return { kind: "me", name: "me" };
    }
  }

  const candidates = [
    ...identity.selfNames.map((name) => candidate("me", name)),
    candidate("them", identity.person.name),
    ...identity.others.map((person) => candidate("other", person.name)),
  ].filter((entry): entry is Candidate => entry !== null);

  const parts = tokens(raw);
  const toResult = (entry: Candidate): ResolvedOwner =>
    entry.kind === "me" ? { kind: "me", name: "me" } : { kind: entry.kind, name: entry.name };
  const steps: Candidate[][] = [];

  // 1. Full name.
  steps.push(candidates.filter((entry) => entry.full === parts.join(" ")));
  if (parts.length >= 2) {
    // "Alex R" or "Alex R." style: first name plus last name or last initial.
    const first = parts[0];
    const lastPart = parts[parts.length - 1].replace(/\.$/, "");
    steps.push(
      candidates.filter(
        (entry) =>
          entry.first === first &&
          entry.last !== "" &&
          (entry.last === lastPart || (lastPart.length === 1 && entry.last.startsWith(lastPart))),
      ),
    );
  } else {
    // 2. Last name is the most specific single word. 3. Then first name.
    steps.push(candidates.filter((entry) => entry.last === parts[0]));
    steps.push(candidates.filter((entry) => entry.first === parts[0]));
  }
  for (const step of steps) {
    const choice = choose(step);
    if (choice === "ambiguous") return { kind: "unassigned", name: "" };
    if (choice) return toResult(choice);
  }

  if (strength === "strong" && looksLikeName(raw)) {
    return { kind: "other", name: raw.replace(/^@/, "").replace(/['’]s$/, "") };
  }
  return { kind: "unassigned", name: "" };
}

/** Build the identity for one note on one person's page. */
export function identityFor(input: {
  person: Pick<Person, "id" | "name">;
  people: Pick<Person, "id" | "name">[];
  selfName: string;
  noteOwnerName?: string;
  noteOwnerEmail?: string;
}): Identity {
  return {
    selfNames: [input.selfName, input.noteOwnerName ?? ""].filter((name) => name.trim()),
    selfEmails: [input.noteOwnerEmail ?? ""].filter((email) => email.trim()),
    person: input.person,
    others: input.people.filter((entry) => entry.id !== input.person.id),
  };
}

export function ownerLabel(
  item: { ownerKind: OwnerKind; owner: string },
  personName: string,
): string {
  if (item.ownerKind === "me") return "Me";
  if (item.ownerKind === "them") return personName.split(/\s+/)[0] || "Them";
  if (item.ownerKind === "other") return item.owner || "Other";
  return "Unassigned";
}
