# Focus OS notes for agents

Next.js App Router + TypeScript. Read `node_modules/next/dist/docs/` if APIs look unfamiliar.

Product rules:

- No em dashes in UI copy or README.
- Andrew-only dogfood. Keep the wedge thin.
- IndexedDB is the store until Firebase is wired.
- Capture saves locally first, then POSTs `/api/capture/triage` which may
  forward to `TRIAGE_WEBHOOK_URL` with `Authorization: Bearer <TRIAGE_WEBHOOK_SECRET>`.
- Team tab data (people, notes, items, moments) lives in IndexedDB v3. Note
  content, items, and moments are AES-GCM encrypted with a passphrase key.
  `GRANOLA_API_KEY` is read only in `app/api/granola/sync/route.ts`.
- Public repo: never commit real names, emails, meeting content, or API keys.
  `lib/privacy.test.ts` guards this.
