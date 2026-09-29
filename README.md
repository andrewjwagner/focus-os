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
- **Per person**, top to bottom:
  - Header with a **Pulse** radar (Engagement, Workload, Growth, Relationship, Delivery, rated 1 to 10 after each 1:1). The current shape is solid, the previous one faint, with a trend sparkline per axis.
  - **Notes from last 1:1**: summary of the most recent synced note.
  - **Tactical | Nurture | Action items**: topics sorted into work and delivery vs. growth, wellbeing, career, and feedback. Action items split into "They owe me", "I owe them", and a small "To sort" pile, with one-click owner reassign. Your edits survive re-syncs.
  - **Talking points**: 3 to 5 suggestions for the next 1:1, with Copy and Regenerate.
  - **Highlights**: wins plus counters (total, wins, issues, coaching) for this year and the last 90 days. Moments have a type (win, issue, coaching, note), auto-classified when added and editable.
  - **Coachable moments plan**: suggested coaching items you can edit, check off, or add to.
  - **Recap drafts**: an email-style follow-up for each synced 1:1 to copy into your mail app. Nothing is sent.
- **Weekly digest**: open loops and prep for everyone. The Team tab is highlighted from Sunday 5pm ET until you open the digest.
- **Extraction**: works without an LLM. Action items come from "Action items" or "Next steps" style sections in the Granola summary. Owners and due dates are guessed from the text and are editable. With an AI provider configured (below), one AI pass per note does this better.
- **Encryption at rest**: on first use you set a passphrase. Note content, action items, and moments are encrypted in IndexedDB with AES-GCM using a PBKDF2 derived key. The key is kept in memory for the session only. A forgotten passphrase cannot be recovered; save it in a password manager.
- **Forgot passphrase**: the unlock screen has "Forgot passphrase? Reset Team data". After you type `RESET`, it permanently deletes only the encrypted Team data on this device (synced notes cache, action items and owner edits, moments, pulse ratings, coaching plan, AI results) and the vault salt and verifier. Your people list, your name, and all Capture and Projects data are kept. You then set a new passphrase and Granola notes re-sync from scratch.

### Granola sync

1. In Granola, create a personal API key with the **Personal notes** scope (Granola Business plan or higher).
2. Add it to `.env.local` (never commit it):

```
GRANOLA_API_KEY=
```

3. Restart `npm run dev`, open Team, and set each person's Granola folder name.

The key is read only by the server route `POST /api/granola/sync` and is never sent to the browser. Only folders you configured are synced; every other folder is ignored. Sync runs when you open the Team tab and every 30 minutes while the app is open, with a request throttle and backoff to respect Granola's rate limit. Notes are stored by note id, so re-syncs update in place and keep your edits to action items.

### AI (optional)

Set one of these in `.env.local`. The first one found wins:

| Order | Env | Provider | Default model |
| --- | --- | --- | --- |
| 1 | `OLLAMA_MODEL` (and optional `OLLAMA_BASE_URL`, default `http://localhost:11434`) | Local [Ollama](https://ollama.com), free, nothing leaves your machine | the model you name, e.g. `llama3.1:8b` or `qwen2.5:7b` |
| 2 | `XAI_API_KEY` | xAI (OpenAI-compatible Chat Completions) | `grok-4.7` |
| 3 | `ANTHROPIC_API_KEY` | Anthropic Messages API | Claude Sonnet |
| 4 | `OPENAI_API_KEY` | OpenAI Chat Completions | GPT |

`TEAM_AI_MODEL` overrides the model for the active provider. Team, Settings shows `AI: Ollama (local)`, `xAI`, `Anthropic`, `OpenAI`, or `off`.

For Ollama, install and run it yourself (`ollama pull qwen2.5:7b`), then set `OLLAMA_MODEL=qwen2.5:7b`. Local models are slower and less strict about JSON, so the app waits longer (up to 3 minutes per call), validates the output, retries once, and falls back to the rules if it still fails. Team, Settings tells you if Ollama is not running or the model is not pulled yet.

How it works:

- Calls go through the server route `/api/team/ai`; keys never reach the browser.
- One call per note extracts action items with owners, tactical vs. nurture topics, highlights, themes, a summary, and a recap draft. Only the note summary is sent (the transcript only if the summary is empty).
- Results are cached per note id and update time, encrypted in IndexedDB. Your manual edits always win.
- Talking points, the coaching plan, and moment classification are separate small calls.
- With no provider, or if a call fails, everything falls back to the built-in rules.

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
