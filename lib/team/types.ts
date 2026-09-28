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
};

export type ActionItem = {
  id: string;
  personId: string;
  /** Source note id, or null for items added by hand. */
  noteId: string | null;
  text: string;
  /** "me", a name, or "" when unknown. Editable. */
  owner: string;
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
  stillOpen: ActionItem[];
  followUps: ActionItem[];
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
