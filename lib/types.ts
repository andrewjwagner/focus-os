export const DOMAINS = [
  "Work",
  "Side project",
  "Home",
  "Health",
  "Finance",
  "Career",
  "Ideas",
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

export const THOUGHT_KINDS = ["idea", "todo"] as const;
export type ThoughtKind = (typeof THOUGHT_KINDS)[number];

export const CAPTURE_KINDS = ["idea", "todo", "project"] as const;
export type CaptureKind = (typeof CAPTURE_KINDS)[number];

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

export type Thought = {
  id: string;
  body: string;
  projectId: string | null;
  kind: ThoughtKind;
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
