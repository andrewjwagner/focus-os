export const DOMAINS = [
  "Work/Bread",
  "Pocket PM Coach",
  "Family/home",
  "Real estate",
  "Health",
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
