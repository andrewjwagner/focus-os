import {
  COACHING_PLAN_SCHEMA,
  MOMENT_TYPE_SCHEMA,
  NOTE_ANALYSIS_SCHEMA,
  TALKING_POINTS_SCHEMA,
} from "./ai-schema";
import type { TeamRole } from "./types";

/**
 * Prompt builders shared by the server route and tests. Inputs are already
 * minimal: summaries, not transcripts, unless a note has no summary.
 */

export const AI_TASKS = ["analyzeNote", "talkingPoints", "coachingPlan", "classifyMoment"] as const;
export type AiTask = (typeof AI_TASKS)[number];

export type AnalyzeNoteInput = {
  selfName: string;
  personName: string;
  role: TeamRole;
  title: string;
  meetingAt: string;
  content: string;
};

export type TalkingPointsInput = {
  selfName: string;
  personName: string;
  role: TeamRole;
  theyOwe: string[];
  iOwe: string[];
  lastSummary: string;
  lastTopics: string[];
  moments: { date: string; type: string; text: string }[];
  pulseChanges: string[];
};

export type CoachingPlanInput = {
  personName: string;
  role: TeamRole;
  moments: { date: string; type: string; text: string }[];
  themes: string[];
  existing: string[];
};

export type ClassifyMomentInput = { text: string; tag: string };

export type AiInput = {
  analyzeNote: AnalyzeNoteInput;
  talkingPoints: TalkingPointsInput;
  coachingPlan: CoachingPlanInput;
  classifyMoment: ClassifyMomentInput;
};

export type Prompt = { system: string; user: string; schemaName: string; schema: object };

const STYLE =
  "Write plain, warm, concise English. Never use em dashes. Do not invent facts that are not in the input.";

function relation(role: TeamRole): string {
  return role === "manager" ? "my manager" : "my direct report";
}

function bullets(values: string[]): string {
  return values.length ? values.map((value) => `- ${value}`).join("\n") : "- (none)";
}

export const MAX_NOTE_CHARS = 12_000;

export function buildPrompt<T extends AiTask>(task: T, input: AiInput[T]): Prompt {
  if (task === "analyzeNote") {
    const data = input as AnalyzeNoteInput;
    const me = data.selfName || "the note taker";
    return {
      schemaName: "note_analysis",
      schema: NOTE_ANALYSIS_SCHEMA,
      system: [
        `You help ${me} run 1:1s. The note is from a 1:1 between ${me} (the note owner, "me") and ${data.personName} (${relation(data.role)}, "them").`,
        "Extract action items and decide who owns each one:",
        `"me" if ${me} owns it (their name, first name, I, me), "them" if ${data.personName} owns it (full name, last name, or a first name that refers to them), "other" for anyone else (set ownerName), "unclear" when the note does not say.`,
        "Due is YYYY-MM-DD when a date is stated, else null.",
        "Topics: short labels for what was discussed. category tactical = work, projects, delivery, process, planning. category nurture = growth, career, wellbeing, workload stress, relationship, feedback, recognition.",
        "Highlights: standout wins, issues, or coaching moments about them, if any.",
        "Themes: 1 to 5 short recurring themes.",
        `Recap: a short follow-up email draft from ${me} to ${data.personName} with a thank you, key points, "I owe you", "You owe me", and "Next time" sections. It is a draft only; it is never sent automatically.`,
        STYLE,
      ].join("\n"),
      user: `Meeting: ${data.title} on ${data.meetingAt.slice(0, 10)}\n\nNote summary:\n${data.content.slice(0, MAX_NOTE_CHARS)}`,
    };
  }
  if (task === "talkingPoints") {
    const data = input as TalkingPointsInput;
    return {
      schemaName: "talking_points",
      schema: TALKING_POINTS_SCHEMA,
      system: [
        `Suggest 3 to 5 talking points for my next 1:1 with ${data.personName} (${relation(data.role)}).`,
        "Each point is one short sentence I can say or ask. Cover follow-ups in both directions, what came up last time, recent moments, and pulse changes. Most important first.",
        STYLE,
      ].join("\n"),
      user: [
        `They owe me:\n${bullets(data.theyOwe)}`,
        `I owe them:\n${bullets(data.iOwe)}`,
        `Last 1:1 summary:\n${data.lastSummary.slice(0, 3000) || "(none)"}`,
        `Last topics:\n${bullets(data.lastTopics)}`,
        `Recent moments:\n${bullets(data.moments.map((moment) => `${moment.date} ${moment.type}: ${moment.text}`))}`,
        `Pulse changes:\n${bullets(data.pulseChanges)}`,
      ].join("\n\n"),
    };
  }
  if (task === "coachingPlan") {
    const data = input as CoachingPlanInput;
    return {
      schemaName: "coaching_plan",
      schema: COACHING_PLAN_SCHEMA,
      system: [
        `Suggest 2 to 5 concrete coaching plan items for ${data.personName} (${relation(data.role)}), based on issue and coaching moments and recurring themes.`,
        "Each item is one actionable bullet (what to work on and how). Skip anything already in the existing plan.",
        STYLE,
      ].join("\n"),
      user: [
        `Moments:\n${bullets(data.moments.map((moment) => `${moment.date} ${moment.type}: ${moment.text}`))}`,
        `Themes:\n${bullets(data.themes)}`,
        `Existing plan:\n${bullets(data.existing)}`,
      ].join("\n\n"),
    };
  }
  const data = input as ClassifyMomentInput;
  return {
    schemaName: "moment_type",
    schema: MOMENT_TYPE_SCHEMA,
    system:
      "Classify a manager's logged moment about a teammate as win (achievement, praise), issue (problem, miss, concern), coaching (feedback given or a skill to develop), or note (anything else).",
    user: `Moment: ${data.text.slice(0, 1000)}${data.tag ? `\nTag: ${data.tag.slice(0, 40)}` : ""}`,
  };
}
