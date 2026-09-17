# Contributing

Thanks for trying Focus OS. Keep the wedge thin.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Enter any email unless you set `NEXT_PUBLIC_ALLOWED_EMAIL`.

## Product rails

Do not drop these. They are the product:

- Capture: Idea, Todo, and Project
- Domain on projects
- Dictate on the capture form
- `POST /api/triage` for inbound ingest (and optional outbound `TRIAGE_WEBHOOK_URL`)

IndexedDB stays the store until Firebase is actually wired. No em dashes in UI copy or README.

Skip unless there is a clear dogfood need: decision log, team seats, mobile apps, AI auto-prioritization.

## Checks

```bash
npm test
npm run lint
npm run build
```

Open a PR against `main`.
