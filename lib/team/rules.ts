import { isActionHeading, noteTopics, sortByMeeting, splitSections, stripMarkdown } from "./extract";
import type {
  ActionItem,
  CachedAnalysis,
  Moment,
  MomentType,
  PulseRating,
  TeamNote,
  Topic,
  TopicCategory,
} from "./types";
import { pulseChanges } from "./pulse";

/**
 * Rule-based fallbacks used when no AI key is set (and as a safety net when
 * an AI call fails). Pure and deterministic.
 */

const NURTURE = [
  "growth", "grow", "career", "promotion", "promo", "feedback", "wellbeing", "well-being",
  "burnout", "stress", "morale", "mentor", "mentoring", "coaching", "coach", "learn", "learning",
  "development", "develop", "goal", "goals", "relationship", "trust", "recognition", "personal",
  "family", "vacation", "pto", "health", "motivation", "engagement", "workload", "balance",
  "confidence", "strengths", "aspiration", "aspirations", "performance", "review", "compensation",
  "comp", "raise", "happiness", "energy", "support", "belonging", "values", "culture", "leadership",
  "skills", "skill", "stretch", "interests", "retention", "overwhelmed", "time off",
];

export function categorizeTopic(text: string): TopicCategory {
  const lower = ` ${text.toLowerCase()} `;
  return NURTURE.some((word) => new RegExp(`[^a-z]${word.replace(/[-]/g, "\\-")}[^a-z]`).test(lower))
    ? "nurture"
    : "tactical";
}

/** Topics from one note: non-action headings, else top-level bullets. */
export function ruleTopics(note: TeamNote): Topic[] {
  const topics: Topic[] = [];
  for (const section of splitSections(note.summaryMarkdown ?? "")) {
    if (!section.heading || isActionHeading(section.heading)) continue;
    const context = `${section.heading} ${section.lines.slice(0, 4).join(" ")}`;
    topics.push({
      text: section.heading,
      category: categorizeTopic(context),
      noteId: note.id,
      meetingAt: note.meetingAt,
    });
  }
  if (topics.length === 0) {
    for (const line of (note.summaryMarkdown ?? "").split("\n")) {
      const bullet = line.match(/^[-*+]\s+(.+)/);
      if (!bullet) continue;
      const text = stripMarkdown(bullet[1]).slice(0, 140);
      topics.push({ text, category: categorizeTopic(text), noteId: note.id, meetingAt: note.meetingAt });
      if (topics.length >= 8) break;
    }
  }
  return topics;
}

/** Tactical and nurture topics across recent notes, AI results preferred. */
export function recentTopics(
  notes: TeamNote[],
  analyses: Record<string, CachedAnalysis | undefined>,
  recent = 3,
): { tactical: Topic[]; nurture: Topic[] } {
  const seen = new Set<string>();
  const tactical: Topic[] = [];
  const nurture: Topic[] = [];
  for (const note of sortByMeeting(notes).slice(0, recent)) {
    const cached = analyses[note.id];
    const topics: Topic[] = cached
      ? cached.analysis.topics.map((topic) => ({ ...topic, noteId: note.id, meetingAt: note.meetingAt }))
      : ruleTopics(note);
    for (const topic of topics) {
      const key = topic.text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      (topic.category === "nurture" ? nurture : tactical).push(topic);
    }
  }
  return { tactical, nurture };
}

export function noteSummary(note: TeamNote, cached?: CachedAnalysis): string {
  if (cached?.analysis.summary) return cached.analysis.summary;
  const text = (note.summaryText || stripMarkdown(note.summaryMarkdown ?? "")).trim();
  return text.length > 700 ? `${text.slice(0, 700).replace(/\s+\S*$/, "")}...` : text;
}

const WIN = /\b(shipped|launched|delivered|nailed|great|excellent|praised|praise|kudos|thank(ed|s)?|won|win|crushed|exceeded|proud|led|promoted|record|landed|closed|fixed|solved|celebrat\w*)\b/i;
const ISSUE = /\b(missed|late|blocked|blocker|conflict|complain\w*|concern\w*|slipped|dropped|error|incident|escalat\w*|frustrat\w*|behind|struggl\w*|upset|tension|overdue|mistake|failed|outage|rude|absent)\b/i;
const COACHING = /\b(feedback|coach\w*|suggest\w*|improve\w*|practice|work on|develop\w*|growth area|could have|next time|reminded|advice|mentor\w*|stretch)\b/i;

export function classifyMomentRule(text: string, tag = ""): MomentType {
  const probe = `${tag} ${text}`;
  if (/^win$/i.test(tag.trim())) return "win";
  if (/^issue$/i.test(tag.trim())) return "issue";
  if (/^coach(ing)?$/i.test(tag.trim())) return "coaching";
  if (ISSUE.test(probe)) return "issue";
  if (COACHING.test(probe)) return "coaching";
  if (WIN.test(probe)) return "win";
  return "note";
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export function templateTalkingPoints(input: {
  personName: string;
  theyOwe: ActionItem[];
  iOwe: ActionItem[];
  lastTopics: string[];
  moments: Moment[];
  pulses: PulseRating[];
}): string[] {
  const points: string[] = [];
  const changes = pulseChanges(input.pulses);
  for (const change of changes.filter((entry) => entry.delta <= -2).slice(0, 1)) {
    points.push(`Check in on ${change.label.toLowerCase()}: it dropped from ${change.previous} to ${change.current}.`);
  }
  if (input.theyOwe[0]) points.push(`Follow up on "${input.theyOwe[0].text}".`);
  if (input.iOwe[0]) points.push(`Update ${firstName(input.personName)} on "${input.iOwe[0].text}".`);
  const win = [...input.moments].sort((a, b) => b.date.localeCompare(a.date)).find((moment) => moment.type === "win");
  if (win) points.push(`Recognize the recent win: ${win.text}`);
  if (input.lastTopics[0]) points.push(`Revisit ${input.lastTopics[0]} from last time.`);
  if (input.theyOwe[1] && points.length < 5) points.push(`Check progress on "${input.theyOwe[1].text}".`);
  for (const change of changes.filter((entry) => entry.delta >= 2).slice(0, 1)) {
    if (points.length < 5) points.push(`Ask what helped ${change.label.toLowerCase()} go up to ${change.current}.`);
  }
  if (points.length < 3) points.push(`Ask ${firstName(input.personName)} what is on their mind this week.`);
  if (points.length < 3) points.push("Ask what would make the next two weeks easier.");
  return points.slice(0, 5);
}

export function templateRecap(input: {
  note: TeamNote;
  selfName: string;
  personName: string;
  iOwe: ActionItem[];
  theyOwe: ActionItem[];
}): string {
  const topics = noteTopics(input.note).slice(0, 5);
  const list = (values: string[]) => (values.length ? values.map((value) => `- ${value}`).join("\n") : "- Nothing open");
  const signature = firstName(input.selfName) || "Me";
  return [
    `Hi ${firstName(input.personName)},`,
    "",
    "Thanks for the time today. Quick recap so we are on the same page.",
    "",
    "Key points",
    list(topics),
    "",
    "I owe you",
    list(input.iOwe.map((item) => item.text)),
    "",
    "You owe me",
    list(input.theyOwe.map((item) => item.text)),
    "",
    "Next time",
    "- Pick up anything above that is still open",
    "",
    "Thanks,",
    signature,
  ].join("\n");
}

export function templateCoachingPlan(moments: Moment[], existing: string[]): string[] {
  const known = new Set(existing.map((value) => value.toLowerCase()));
  return moments
    .filter((moment) => moment.type === "issue" || moment.type === "coaching")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4)
    .map((moment) =>
      moment.type === "issue"
        ? `Talk through what happened (${moment.date}): ${moment.text}. Agree on one change to try.`
        : `Practice: ${moment.text}. Check back in two weeks.`,
    )
    .filter((text) => !known.has(text.toLowerCase()));
}
