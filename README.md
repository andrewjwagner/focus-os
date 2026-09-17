# Focus OS

A personal command center for projects and thoughts across work and home: active, tabled, and focus-next, including which agent or chat owns each thread.

Open source. Local-first. Not a quantified-self life OS, a Notion clone, or a team tool.

Source: [github.com/andrewjwagner/focus-os](https://github.com/andrewjwagner/focus-os)

## Quick start

Requires Node 20+.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Local mode (no Firebase env vars):

1. The sign-in screen says Firebase is not configured.
2. Enter any email and continue. Set `NEXT_PUBLIC_ALLOWED_EMAIL` if you want to lock it to one address.
3. Demo seed data loads into IndexedDB in this browser.

```bash
npm test
npm run lint
npm run build
```

## Optional env

Copy `.env.example` to `.env.local`. Nothing in that file is required to run locally.

```
# Empty = any non-empty email can sign in locally.
NEXT_PUBLIC_ALLOWED_EMAIL=

# Inbound ingest. POST /api/triage with header x-triage-secret.
TRIAGE_WEBHOOK_SECRET=

# Outbound fan-out for captures made in the UI. Leave blank to skip.
TRIAGE_WEBHOOK_URL=
```

### Allowlist

`NEXT_PUBLIC_ALLOWED_EMAIL` is optional. Empty (the default) means any non-empty email works in local mode. Set it to a single address to gate sign-in to that email (local stub and Firebase Google sign-in).

### Triage webhook

`POST /api/triage` accepts JSON:

```json
{ "kind": "idea", "body": "Ship the demo seed" }
```

Kinds: `idea`, `todo`, `project`. Ideas and todos need `body`. Projects need `name` (and may include `domain`, `outcome`, `nextAction`).

Send `x-triage-secret: $TRIAGE_WEBHOOK_SECRET` or `Authorization: Bearer $TRIAGE_WEBHOOK_SECRET`. Refresh the app and queued items land in the inbox, or as a project card.

If `TRIAGE_WEBHOOK_URL` is set, captures from the UI are also POSTed there with the same secret header. Point it at another tool, not back at this app, or the forward is skipped.

### Firebase (optional)

IndexedDB is the store. Auth can use Google sign-in when these are set in `.env.local`:

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

Enable Google sign-in in Firebase Auth and add `localhost` as an authorized domain. If `NEXT_PUBLIC_ALLOWED_EMAIL` is set, every other account is rejected, including unverified emails. If it is empty, any verified Google account can sign in.

`firestore.rules` scopes a future `users/{uid}/...` tree to the signed-in user. Deploy with `npx -y firebase-tools@latest deploy --only firestore:rules` after `firebase use <project-id>`. Do not deploy until a real project exists.

## Try it

Open Today. You should see 3 focus-next cards, active projects grouped by domain (collapsed), an inbox count, and a collapsed tabled shelf.

- Capture an idea or todo (lands in inbox) or a project (pick a domain). Dictate is on the capture form when the browser supports it.
- Open a project: change status, add a lane, add a note.
- Set as focus on a fourth project. The cap dialog asks you to demote one of the current 3.
- Table a focus item. It leaves the focus row and shows up on Tabled.

Data lives in this browser until Firebase is wired. To reset seed data, DevTools > Application > IndexedDB > `focus-os` > Delete database, then refresh.

## Optional Vercel

1. Import this GitHub repo into Vercel.
2. Set env vars you need (`NEXT_PUBLIC_ALLOWED_EMAIL`, triage, and Firebase recommended on a public URL).
3. Deploy. Add the Vercel domain to Firebase authorized domains.

Local IndexedDB will not follow you across machines. Wire Firebase before treating this as the daily driver on more than one device.

## Screens

1. **Today**: Focus next (hard cap 3), active by domain, inbox, tabled shelf.
2. **Project detail**: status, domain, outcome, next action, lanes, notes. Active / Table / Done / Set as focus.
3. **Capture**: Idea, Todo, or Project, with domain on projects, plus Dictate.
4. **Tabled**: parked projects, plus inspired.

Skipped on purpose: decision log, bot-helper checklist UI, mobile apps, Grok Bot API sync, team seats, AI auto-prioritization.

## Seed

Generic demo cards so a clone is useful on first run: a new-role onboarding, a side project, a growth loop, an idea queue, writing cadence, household ops, a training block, a parked finance thesis, a previous-role wrap, and an inspired experiment. 3 are focus-next. Inbox starts with a couple of unsorted items.

## License

MIT. Copyright 2026 Andrew Wagner.
