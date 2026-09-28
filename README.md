# Focus OS

A personal command center for projects and thoughts across work and home: active, tabled, and focus-next, including which bot or chat owns each thread.

Local-first open source. Not a quantified-self life OS. Not a Notion clone.

**Repo:** [github.com/andrewjwagner/focus-os](https://github.com/andrewjwagner/focus-os)

## Quick start

Requires Node 20+.

```bash
git clone https://github.com/andrewjwagner/focus-os.git
cd focus-os
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Local mode (no Firebase env vars):

1. The sign-in screen says Firebase is not configured.
2. Enter any email and continue (or set `NEXT_PUBLIC_ALLOWED_EMAIL` to lock it to one address).
3. Demo seed data loads into IndexedDB in this browser.

```bash
npm test
npm run lint
npm run build
```

## Why local-first

Your projects and captures stay in the browser until you opt into Firebase. That keeps setup tiny for dogfood and for anyone cloning the repo.

## Capture and optional Triage

Capture supports Idea, Todo, and Project, with a required domain on Idea/Todo and Dictate on the body field (Chrome/Edge).

After a successful local save, the app fire-and-forgets `POST /api/capture/triage`. That route forwards to your webhook when both env vars are set:

```
TRIAGE_WEBHOOK_URL=
TRIAGE_WEBHOOK_SECRET=
```

Auth header: `Authorization: Bearer <TRIAGE_WEBHOOK_SECRET>`. Leave both blank to keep Capture local-only. Webhook errors never fail the local save.

## Team tab (optional)

A single-user view of your manager and direct reports, built from your Granola 1:1 notes. It works without Granola too: add people and log moments by hand.

- **People**: configured in the app under Team, Settings. Each person has a name, a role (manager or direct report), and the exact name of the Granola folder that holds your notes with them. This lives only in your browser's IndexedDB.
- **Per person**: open action items (owner, due date, done toggle, link to the source note), recent themes, a prep brief for the next 1:1 (still open items, what came up last time, your follow-ups, moments since), and a moment log.
- **Weekly digest**: open loops and prep for everyone. The Team tab is highlighted from Sunday 5pm ET until you open the digest.
- **Extraction**: no LLM. Action items come from "Action items" or "Next steps" style sections in the Granola summary. Owners and due dates are guessed from the text and are editable.
- **Encryption at rest**: on first use you set a passphrase. Note content, action items, and moments are encrypted in IndexedDB with AES-GCM using a PBKDF2 derived key. The key is kept in memory for the session only. A forgotten passphrase cannot be recovered.

### Granola sync

1. In Granola, create a personal API key with the **Personal notes** scope (Granola Business plan or higher).
2. Add it to `.env.local` (never commit it):

```
GRANOLA_API_KEY=
```

3. Restart `npm run dev`, open Team, and set each person's Granola folder name.

The key is read only by the server route `POST /api/granola/sync` and is never sent to the browser. Only folders you configured are synced; every other folder is ignored. Sync runs when you open the Team tab and every 30 minutes while the app is open, with a request throttle and backoff to respect Granola's rate limit. Notes are stored by note id, so re-syncs update in place and keep your edits to action items.

## Auth

`NEXT_PUBLIC_ALLOWED_EMAIL` is optional.

- Unset or empty: local mode accepts any non-empty email.
- Set: only that email can sign in (local stub or Firebase Google).

## Optional Firebase

IndexedDB is the default store. To use Firebase Google sign-in, set:

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

Enable Google sign-in in Firebase Auth and add `localhost` as an authorized domain.

## Screens

1. **Today**: Focus next (hard cap 3), active projects by domain, inbox, tabled shelf.
2. **Project detail**: status, domain, outcome, next action, lanes, notes.
3. **Capture**: Idea, Todo, or Project. Domain on Idea and Todo. Dictate on the body field.
4. **Tabled**: parked projects.
5. **Team**: people, action items, 1:1 prep, moments, and a weekly digest (optional Granola sync).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). MIT licensed.
