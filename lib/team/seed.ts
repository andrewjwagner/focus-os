import { deriveItems } from "./sync";
import type { ActionItem, Moment, Person, TeamNote } from "./types";

/**
 * Fictional demo team. Loaded only when the user taps "Load demo team".
 * Never put real people, emails, or meeting content here.
 */

export const DEMO_PEOPLE: Person[] = [
  {
    id: "person-demo-alex",
    name: "Alex Rivera",
    role: "direct",
    granolaFolderName: "Demo 1:1 Alex",
    createdAt: "2026-01-05T14:00:00.000Z",
    lastSync: null,
  },
  {
    id: "person-demo-sam",
    name: "Sam Lee",
    role: "manager",
    granolaFolderName: "Demo 1:1 Sam",
    createdAt: "2026-01-05T14:01:00.000Z",
    lastSync: null,
  },
];

export const DEMO_NOTES: TeamNote[] = [
  {
    id: "note-demo-alex-1",
    personId: "person-demo-alex",
    title: "Alex / me weekly",
    createdAt: "2026-01-12T15:00:00.000Z",
    updatedAt: "2026-01-12T15:40:00.000Z",
    meetingAt: "2026-01-12T15:00:00.000Z",
    webUrl: "",
    summaryMarkdown: [
      "## Onboarding flow",
      "- Drop-off on step three is still high",
      "- Alex wants to test a shorter form",
      "",
      "## Career growth",
      "- Interested in leading the next launch",
      "",
      "## Next steps",
      "- Alex to draft the shorter onboarding form by Friday",
      "- I will share the launch lead expectations doc",
    ].join("\n"),
    summaryText: "Onboarding drop-off and career growth.",
    transcript: null,
    ownerName: "Jordan Park",
    ownerEmail: "jordan@example.com",
  },
  {
    id: "note-demo-alex-2",
    personId: "person-demo-alex",
    title: "Alex / me weekly",
    createdAt: "2026-01-19T15:00:00.000Z",
    updatedAt: "2026-01-19T15:35:00.000Z",
    meetingAt: "2026-01-19T15:00:00.000Z",
    webUrl: "",
    summaryMarkdown: [
      "## Onboarding flow",
      "- Shorter form test is live for 10 percent of signups",
      "",
      "## Hiring loop",
      "- Alex joined two interview panels",
      "",
      "## Action items",
      "- Alex: write up the onboarding test results by 1/26",
      "- Book a design review with the platform team",
    ].join("\n"),
    summaryText: "Onboarding test live. Hiring loop help.",
    transcript: null,
    ownerName: "Jordan Park",
    ownerEmail: "jordan@example.com",
  },
  {
    id: "note-demo-sam-1",
    personId: "person-demo-sam",
    title: "Sam / me 1:1",
    createdAt: "2026-01-14T18:00:00.000Z",
    updatedAt: "2026-01-14T18:30:00.000Z",
    meetingAt: "2026-01-14T18:00:00.000Z",
    webUrl: "",
    summaryMarkdown: [
      "## Quarterly planning",
      "- Sam wants a one-page plan per team",
      "",
      "## Headcount",
      "- One open role approved for next quarter",
      "",
      "## Next steps",
      "- I'll send the one-page plan by Jan 21",
      "- Sam to confirm the budget for the open role",
    ].join("\n"),
    summaryText: "Quarterly planning and headcount.",
    transcript: null,
    ownerName: "Jordan Park",
    ownerEmail: "jordan@example.com",
  },
];

export const DEMO_MOMENTS: Moment[] = [
  {
    id: "moment-demo-1",
    personId: "person-demo-alex",
    date: "2026-01-21",
    text: "Ran the team demo with no prep and handled questions well.",
    tag: "win",
    type: "win",
    typeEdited: false,
    createdAt: "2026-01-21T20:00:00.000Z",
  },
];

/** Fictional "me" for the demo notes. */
export const DEMO_SELF_NAME = "Jordan Park";

export function demoItems(): ActionItem[] {
  return deriveItems({ notes: DEMO_NOTES, items: [], people: DEMO_PEOPLE, selfName: DEMO_SELF_NAME })
    .upserts;
}
