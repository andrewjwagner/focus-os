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

export type Moment = {
  id: string;
  personId: string;
  /** YYYY-MM-DD */
  date: string;
  text: string;
  tag: string;
  createdAt: string;
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
