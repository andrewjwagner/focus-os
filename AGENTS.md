# Focus OS notes for agents

Next.js App Router + TypeScript. Read `node_modules/next/dist/docs/` if APIs look unfamiliar.

Product rules:

- No em dashes in UI copy or README.
- Andrew-only dogfood. Keep the wedge thin.
- IndexedDB is the store until Firebase is wired.
- Capture saves locally first, then POSTs `/api/capture/triage` which may
  forward to `TRIAGE_WEBHOOK_URL` with `Authorization: Bearer <TRIAGE_WEBHOOK_SECRET>`.
