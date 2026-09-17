export const DOMAINS = [
  "Work",
  "Side project",
  "Home",
  "Health",
  "Finance",
  "Ideas",
  "Career",
] as const;

export type Domain = (typeof DOMAINS)[number];

export const STATUSES = ["active", "tabled", "done", "inspired"] as const;
export type Status = (typeof STATUSES)[number];

export const LANE_TYPES = [
  "Grok Bot",
  "Doc",
  "Sheet",
  "Repo",
  "Chat",
  "Other",
] as const;
export type LaneType = (typeof LANE_TYPES)[number];

export const CAPTURE_ITEM_KINDS = ["idea", "todo"] as const;
export type CaptureItemKind = (typeof CAPTURE_ITEM_KINDS)[number];

export const TRIAGE_KINDS = ["idea", "todo", "project"] as const;
export type TriageKind = (typeof TRIAGE_KINDS)[number];

export const MAX_FOCUS = 3;

export type Project = {
  id: string;
  name: string;
  domain: Domain;
  status: Status;
  outcome: string;
  nextAction: string;
  focusNext: boolean;
  focusOrder: number | null;
  createdAt: string;
  updatedAt: string;
};

/** Captured idea or todo. Project notes reuse this shape with a projectId. */
export type Thought = {
  id: string;
  kind: CaptureItemKind;
  body: string;
  domain: Domain;
  projectId: string | null;
  createdAt: string;
};

export type Lane = {
  id: string;
  projectId: string;
  laneType: LaneType;
  label: string;
  urlOrHint: string;
};

export type FocusCapResult =
  | { ok: true }
  | { ok: false; reason: "cap"; focused: Project[] };
