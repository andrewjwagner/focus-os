import type { Lane, Project, Thought } from "./types";

const now = "2026-09-16T12:00:00.000Z";

export const seedProjects: Project[] = [
  {
    id: "proj-bread-onboarding",
    name: "Bread Financial onboarding",
    domain: "Work/Bread",
    status: "active",
    outcome:
      "Land as Senior Manager, Product Agentic AI, without dropping the side stack.",
    nextAction:
      "Map the first 30 days (start ~2026-09-28): people, tools, and what good looks like.",
    focusNext: true,
    focusOrder: 1,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "proj-pocket-pm-live",
    name: "Pocket PM Coach live ops",
    domain: "Pocket PM Coach",
    status: "active",
    outcome: "Keep the live app healthy while calendar time gets scarce.",
    nextAction: "Check Daily Drill drop and App Store review pulse.",
    focusNext: true,
    focusOrder: 2,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "proj-head-of-growth",
    name: "Head of Growth workstream",
    domain: "Pocket PM Coach",
    status: "active",
    outcome:
      "A weekly growth loop that does not live only in Grok Bot scrollback.",
    nextAction:
      "Promote the current Head of Growth thread into this card's lanes.",
    focusNext: true,
    focusOrder: 3,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "proj-idea-validations",
    name: "Idea validations queue",
    domain: "Ideas",
    status: "active",
    outcome:
      "Idea Guy stays the validator. Only graduate ideas that earn a project card.",
    nextAction: "Triage tracker rows still on Park vs Pursue.",
    focusNext: false,
    focusOrder: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "proj-daily-drill",
    name: "Daily Drill cadence",
    domain: "Pocket PM Coach",
    status: "active",
    outcome:
      "Daily Drill stays shipped without becoming a full-time content job.",
    nextAction: "Batch the next five drills on a light week.",
    focusNext: false,
    focusOrder: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "proj-dual-role-parent",
    name: "Dual-role parent idea",
    domain: "Family/home",
    status: "active",
    outcome:
      "High-level: a product for parents who also run a career. Validate, do not build yet.",
    nextAction:
      "One-pager of the job to be done. Keep it in Idea Guy until it earns a bot.",
    focusNext: false,
    focusOrder: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "proj-hyrox",
    name: "HYROX training block",
    domain: "Health",
    status: "active",
    outcome:
      "Stay race-capable around the Bread start without turning health into a dashboard.",
    nextAction: "Put this week's sessions on the card.",
    focusNext: false,
    focusOrder: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "proj-wilson-school",
    name: "Wilson School family ops",
    domain: "Family/home",
    status: "active",
    outcome:
      "School calendar, pickup, and kid logistics stay visible (Wilson School District).",
    nextAction: "Capture fall conference and event dates onto this card.",
    focusNext: false,
    focusOrder: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "proj-real-estate-one",
    name: "Real estate deal-one",
    domain: "Real estate",
    status: "tabled",
    outcome:
      "High-level: one deal thesis, parked until bandwidth exists after Bread start.",
    nextAction: "Leave it tabled. Reopen after onboarding week 4.",
    focusNext: false,
    focusOrder: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "proj-macys-wrap",
    name: "Macy's Lead PM wrap",
    domain: "Career",
    status: "tabled",
    outcome: "Leave cleanly. Knowledge transfer done. No lingering fire drills.",
    nextAction: "Parked. Only reopen if a wrap item actually pings.",
    focusNext: false,
    focusOrder: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "proj-people-leader",
    name: "People-leader 1:1 tracker",
    domain: "Career",
    status: "tabled",
    outcome: "Separate product row. Do not pull 1:1 features into Focus OS.",
    nextAction: "Leave tabled. Redirect any people-manager ideas there.",
    focusNext: false,
    focusOrder: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "proj-family-os-inspired",
    name: "Household command surface",
    domain: "Ideas",
    status: "inspired",
    outcome:
      "Inspired, not now. A household OS is a different product from this wedge.",
    nextAction: "Keep inspired. Do not build it inside Focus OS.",
    focusNext: false,
    focusOrder: null,
    createdAt: now,
    updatedAt: now,
  },
];

export const seedLanes: Lane[] = [
  {
    id: "lane-bread-bot",
    projectId: "proj-bread-onboarding",
    laneType: "Grok Bot",
    label: "Head of Growth (interim)",
    urlOrHint:
      "Current chat. Split to a Bread-only bot if onboarding context gets messy.",
  },
  {
    id: "lane-bread-doc",
    projectId: "proj-bread-onboarding",
    laneType: "Doc",
    label: "First 30 days notes",
    urlOrHint: "Google Doc. Create when the 30-day map starts.",
  },
  {
    id: "lane-ppc-repo",
    projectId: "proj-pocket-pm-live",
    laneType: "Repo",
    label: "Pocket PM Coach",
    urlOrHint: "github.com/andrewjwagner (Pocket PM Coach app repo)",
  },
  {
    id: "lane-ppc-growth",
    projectId: "proj-head-of-growth",
    laneType: "Grok Bot",
    label: "Head of Growth",
    urlOrHint: "Durable growth role bot. Open this lane, do not hunt scrollback.",
  },
  {
    id: "lane-ideas-sheet",
    projectId: "proj-idea-validations",
    laneType: "Sheet",
    label: "Idea Tracker",
    urlOrHint:
      "docs.google.com/spreadsheets (Idea Guy tracker). Park / Validate / Inspired.",
  },
  {
    id: "lane-parent-bot",
    projectId: "proj-dual-role-parent",
    laneType: "Grok Bot",
    label: "Idea Guy",
    urlOrHint: "Stay here until the idea earns its own bot or project lane.",
  },
  {
    id: "lane-wilson-doc",
    projectId: "proj-wilson-school",
    laneType: "Doc",
    label: "School calendar scratch",
    urlOrHint: "Family notes. Wilson School District, Wyomissing PA.",
  },
  {
    id: "lane-re-finance",
    projectId: "proj-real-estate-one",
    laneType: "Grok Bot",
    label: "Finance Guy",
    urlOrHint: "Parked deal talk lives here, not in Head of Growth.",
  },
];

export const seedThoughts: Thought[] = [
  {
    id: "thought-bread-bot",
    kind: "idea",
    body: "Should Bread onboarding get its own Grok bot, or stay in Head of Growth for week one?",
    domain: "Work/Bread",
    projectId: null,
    createdAt: now,
  },
  {
    id: "thought-wilson-dates",
    kind: "todo",
    body: "Wilson School fall conference dates need a home on the family card.",
    domain: "Family/home",
    projectId: null,
    createdAt: now,
  },
  {
    id: "thought-drill-batch",
    kind: "todo",
    body: "Daily Drill: batch a Judgment Sprint reminder for the week Bread starts.",
    domain: "Pocket PM Coach",
    projectId: "proj-daily-drill",
    createdAt: now,
  },
];

export function inboxThoughts(thoughts: Thought[]): Thought[] {
  return thoughts.filter((thought) => thought.projectId === null);
}
