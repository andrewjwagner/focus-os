export const TEAM_ROLES = ["manager", "direct"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

/** Configured locally in IndexedDB. Never committed. */
export type Person = {
  id: string;
  name: string;
  role: TeamRole;
  /** Exact Granola folder name (case-insensitive match). Empty disables sync. */
  granolaFolderName: string;
  createdAt: string;
  /** ISO time of the last successful Granola sync for this person. */
  lastSync: string | null;
};

export type TranscriptLine = {
  speaker: string;
  text: string;
};

/** Decrypted note content. Stored encrypted at rest. */
export type TeamNote = {
  id: string;
  personId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Meeting start if Granola knows it, else createdAt. */
  meetingAt: string;
  webUrl: string;
  summaryMarkdown: string;
  summaryText: string;
  transcript: TranscriptLine[] | null;
  /** Granola note owner (the API key holder, so "me"). Missing on notes synced before v2 parsing. */
  ownerName?: string;
  ownerEmail?: string;
};

export const OWNER_KINDS = ["me", "them", "other", "unassigned"] as const;
/** Relative to the person whose note the item came from. */
export type OwnerKind = (typeof OWNER_KINDS)[number];

export type ActionItem = {
  id: string;
  personId: string;
  /** Source note id, or null for items added by hand. */
  noteId: string | null;
  text: string;
  /** Extra context from continuation lines or nested bullets. */
  detail: string;
  ownerKind: OwnerKind;
  /** Display name for ownerKind "other" (and the resolved name otherwise). */
  owner: string;
  /** Raw owner label found in the note ("" when none). Used to re-derive ownership. */
  ownerHint: string;
  /** True once the user reassigned the owner. Re-syncs never override it. */
  ownerEdited: boolean;
  /** True once the user edited text, due date, or done state. */
  edited: boolean;
  /** YYYY-MM-DD or null. */
  due: string | null;
  done: boolean;
  createdAt: string;
};

export const MOMENT_TYPES = ["win", "issue", "coaching", "note"] as const;
export type MomentType = (typeof MOMENT_TYPES)[number];

export type Moment = {
  id: string;
  personId: string;
  /** YYYY-MM-DD */
  date: string;
  text: string;
  tag: string;
  type: MomentType;
  /** True once the user picked the type by hand. */
  typeEdited: boolean;
  createdAt: string;
};

export const PULSE_AXES = ["engagement", "workload", "growth", "relationship", "delivery"] as const;
export type PulseAxis = (typeof PULSE_AXES)[number];
export type PulseScores = Record<PulseAxis, number>;

/** Manual 1 to 10 rating entered after a 1:1. Stored encrypted. */
export type PulseRating = {
  id: string;
  personId: string;
  /** YYYY-MM-DD */
  date: string;
  scores: PulseScores;
  createdAt: string;
};

export const TOPIC_CATEGORIES = ["tactical", "nurture"] as const;
export type TopicCategory = (typeof TOPIC_CATEGORIES)[number];

export type Topic = { text: string; category: TopicCategory; noteId: string; meetingAt: string };

export type CoachingItem = {
  id: string;
  personId: string;
  text: string;
  done: boolean;
  source: "ai" | "rules" | "manual";
  createdAt: string;
};

export type AiProviderName = "ollama" | "xai" | "anthropic" | "openai" | "off";

/** Structured result of one AI pass over a note. Cached per note id + updatedAt. */
export type NoteAnalysis = {
  summary: string;
  items: {
    text: string;
    owner: "me" | "them" | "other" | "unclear";
    ownerName: string | null;
    due: string | null;
  }[];
  topics: { text: string; category: TopicCategory }[];
  highlights: { text: string; type: "win" | "issue" | "coaching" }[];
  themes: string[];
  recap: string;
};

export type CachedAnalysis = {
  noteId: string;
  personId: string;
  noteUpdatedAt: string;
  provider: AiProviderName;
  analysis: NoteAnalysis;
};

export type TalkingPoints = {
  personId: string;
  points: string[];
  generatedAt: string;
  provider: AiProviderName | "rules";
};

export type Theme = { label: string; count: number };

export type PrepBrief = {
  lastNote: { id: string; title: string; meetingAt: string; webUrl: string } | null;
  /** My open action items. */
  followUps: ActionItem[];
  /** Their open commitments to follow up on. */
  theirCommitments: ActionItem[];
  unassigned: ActionItem[];
  lastTopics: string[];
  momentsSince: Moment[];
};

/** AES-GCM envelope, base64 fields. */
export type Envelope = { iv: string; data: string };

export type VaultMeta = {
  salt: string;
  iterations: number;
  check: Envelope;
};
