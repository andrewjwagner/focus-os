import {
  MOMENT_TYPES,
  TOPIC_CATEGORIES,
  type MomentType,
  type NoteAnalysis,
  type TopicCategory,
} from "./types";

/**
 * JSON schemas sent to the model and hand-written validators for what comes
 * back (no zod dependency). Validators drop bad entries instead of failing
 * the whole response, clamp lengths, and return null when unusable.
 */

// Length limits are enforced by the validators; strict schema modes reject maxLength.
const str = (maxLength: number) => ({ type: "string", description: `At most ${maxLength} characters.` });
const nullableStr = { type: ["string", "null"] };

export const NOTE_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "items", "topics", "highlights", "themes", "recap"],
  properties: {
    summary: str(800),
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "owner", "ownerName", "due"],
        properties: {
          text: str(300),
          owner: { type: "string", enum: ["me", "them", "other", "unclear"] },
          ownerName: nullableStr,
          due: nullableStr,
        },
      },
    },
    topics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "category"],
        properties: { text: str(200), category: { type: "string", enum: ["tactical", "nurture"] } },
      },
    },
    highlights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "type"],
        properties: { text: str(300), type: { type: "string", enum: ["win", "issue", "coaching"] } },
      },
    },
    themes: { type: "array", items: str(60) },
    recap: str(3000),
  },
} as const;

export const TALKING_POINTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["points"],
  properties: { points: { type: "array", items: str(240) } },
} as const;

export const COACHING_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: { items: { type: "array", items: str(240) } },
} as const;

export const MOMENT_TYPE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["type"],
  properties: { type: { type: "string", enum: [...MOMENT_TYPES] } },
} as const;

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\u2014/g, ", ").trim().slice(0, max) : "";
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isoDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match || Number.isNaN(Date.parse(match[1]))) return null;
  return match[1];
}

export function validateNoteAnalysis(raw: unknown): NoteAnalysis | null {
  const data = obj(raw);
  if (!data) return null;
  const owners = new Set(["me", "them", "other", "unclear"]);
  const items = list(data.items)
    .map((entry) => obj(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .map((entry) => ({
      text: text(entry.text, 300),
      owner: (owners.has(String(entry.owner)) ? entry.owner : "unclear") as NoteAnalysis["items"][number]["owner"],
      ownerName: text(entry.ownerName, 80) || null,
      due: isoDay(entry.due),
    }))
    .filter((entry) => entry.text)
    .slice(0, 30);
  const topics = list(data.topics)
    .map((entry) => obj(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .map((entry) => ({
      text: text(entry.text, 200),
      category: (TOPIC_CATEGORIES.includes(entry.category as TopicCategory)
        ? entry.category
        : "tactical") as TopicCategory,
    }))
    .filter((entry) => entry.text)
    .slice(0, 20);
  const highlights = list(data.highlights)
    .map((entry) => obj(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .filter((entry) => ["win", "issue", "coaching"].includes(String(entry.type)))
    .map((entry) => ({
      text: text(entry.text, 300),
      type: entry.type as "win" | "issue" | "coaching",
    }))
    .filter((entry) => entry.text)
    .slice(0, 10);
  const themes = list(data.themes)
    .map((entry) => text(entry, 60))
    .filter(Boolean)
    .slice(0, 8);
  const summary = text(data.summary, 800);
  const recap = text(data.recap, 3000);
  if (!summary && items.length === 0 && topics.length === 0) return null;
  return { summary, items, topics, highlights, themes, recap };
}

export function validateStringList(raw: unknown, key: string, min: number, max: number): string[] | null {
  const data = obj(raw);
  if (!data) return null;
  const values = list(data[key])
    .map((entry) => text(entry, 240))
    .filter(Boolean)
    .slice(0, max);
  return values.length >= min ? values : null;
}

export function validateMomentType(raw: unknown): MomentType | null {
  const data = obj(raw);
  const value = data?.type;
  return MOMENT_TYPES.includes(value as MomentType) ? (value as MomentType) : null;
}

/** Pull a JSON object out of model text (handles code fences and chatter). */
export function parseJsonText(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
