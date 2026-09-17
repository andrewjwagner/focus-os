# Focus OS

A personal command center for projects and thoughts across work and home: active, tabled, and focus-next, including which bot or chat owns each thread.

Local-first open source. Not a quantified-self life OS. Not a Notion clone.

**Repo:** [github.com/focus-os](https://github.com/andrewjwagner/focus-os)

## Quick start

Requires Node 20+.

```bash
git clone https://github.com/focus-os.git
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

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). MIT licensed.
