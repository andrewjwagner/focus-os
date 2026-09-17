# Focus OS

A personal command center for projects, ideas, and todos across work and home: active, tabled, and focus-next, including which agent/chat owns each thread.

Private web dogfood for Andrew Wagner. Not a quantified-self life OS. Not a Notion clone. Not an App Store launch.

## Run locally

Requires Node 20+.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Local mode (no Firebase env vars):

1. The sign-in screen says Firebase is not configured.
2. Enter `andrew.wagner179@gmail.com` and continue.
3. Seed data loads into IndexedDB in this browser.

```bash
npm test
npm run lint
npm run build
```

## Dogfood

Open Today. You should see 3 focus-next cards, active projects grouped by domain (collapsed), an inbox count, and a collapsed tabled shelf.

Try:

- Capture an idea or a todo (with a domain; lands in inbox unless attached) or a project.
- Dictate the idea/todo body in Chrome or Edge (`Dictate`). Other browsers show a short fallback hint.
- Open a project: change status, add a lane, add a note.
- Set as focus on a fourth project. The cap dialog asks you to demote one of the current 3.
- Table a focus item. It leaves the focus row and shows up on Tabled.

Data lives in this browser until Firebase is wired. To reset seed data, DevTools > Application > IndexedDB > `focus-os` > Delete database, then refresh.

## Auth (Andrew-only)

Allowed email defaults to `andrew.wagner179@gmail.com` (`NEXT_PUBLIC_ALLOWED_EMAIL`).

**Local stub (this PR default):** email gate only. TODO: add Firebase config below so production is Google sign-in, not a typed email.

**Firebase Auth (when env is set):** Google sign-in. Anyone else is rejected, including unverified emails.

## Firebase later

This MVP prefers a working UI over blocked infra. IndexedDB is the store. Auth can use Firebase Google sign-in when these are set in `.env.local`:

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

Then enable Google sign-in in Firebase Auth, add `localhost` as an authorized domain, and keep the allowlist email as Andrew's.

`firestore.rules` is Andrew-only (`email` + `email_verified`) for a future `users/{uid}/...` tree. Deploy with `npx -y firebase-tools@latest deploy --only firestore:rules` after `firebase use <project-id>`. Do not deploy until a real project exists.

Suggested reuse: Pocket PM Coach's Firebase project (`product-power-up`) or a new private `focus-os` project. Either works. Ask before creating one.

## Optional Vercel

Do not need Cursor Origin.

1. Import this GitHub repo into Vercel.
2. Set the `NEXT_PUBLIC_*` env vars (Firebase recommended on a public URL).
3. Optionally set server-only `TRIAGE_WEBHOOK_URL` and `TRIAGE_WEBHOOK_SECRET`.
4. Deploy. Add the Vercel domain to Firebase authorized domains.

Local IndexedDB will not follow you across machines. Wire Firebase before treating this as the daily driver on more than one device.

## Screens

1. **Today**: Focus next (hard cap 3), active by domain, inbox, tabled shelf.
2. **Project detail**: status, domain, outcome, next action, lanes, notes. Active / Table / Done / Set as focus.
3. **Capture**: Idea, Todo, or Project. Domain on Idea and Todo. Dictate on the body field.
4. **Tabled**: parked projects, plus inspired.

## Capture to triage webhook

Capture always writes to IndexedDB first. After a successful save, the browser fire-and-forgets `POST /api/capture/triage`. That route POSTs to `TRIAGE_WEBHOOK_URL` so the secret never ships to the client.

Set both in `.env.local` (see `.env.example`):

```
TRIAGE_WEBHOOK_URL=
TRIAGE_WEBHOOK_SECRET=
```

Auth header sent to the webhook (Grok Bot / Cursor automation routines expect Bearer):

```
Authorization: Bearer <TRIAGE_WEBHOOK_SECRET>
```

Payload (`version: 1`):

```json
{
  "source": "focus-os",
  "version": 1,
  "kind": "idea",
  "id": "idea-uuid",
  "body": "the captured text",
  "domain": "Work/Bread",
  "projectId": null,
  "createdAt": "2026-09-16T12:00:00.000Z",
  "capturedAt": "2026-09-16T12:00:00.000Z"
}
```

`kind` is `idea`, `todo`, or `project`. Projects also send `name`. If URL or secret is unset, Capture still works and the route skips quietly. Webhook failures never fail the local save.

Restart `npm run dev` after changing env vars.

Skipped on purpose: decision log, bot-helper checklist UI, mobile apps, Grok Bot chat sync, team seats, AI auto-prioritization.

## Seed

Placeholder cards from Andrew's world (edit in the UI, not private secrets): Pocket PM Coach, Daily Drill, Bread Financial onboarding (~2026-09-28), Idea Guy tracker, Head of Growth, real estate deal-one, HYROX, Wilson School family ops, dual-role parent idea. 3 are focus-next. Inbox starts with a couple of unsorted ideas and todos.
