# TalloCPA OS

A system-first operating system for a Philippine CPA firm — so the firm keeps
working when the owner is not in the office.

Full plan and design: `~/.gstack/projects/Erolljay-tallocpa-os/` (design doc,
test plan, review report) and the visual plan artifact.

## What's built so far — the intake-wedge foundation

The wedge lets clients submit source documents two ways (Telegram photo, or an
Excel/CSV template), an AI drafts the transaction, staff review, and it exports
to Manager.io. This foundation layer is the deterministic core both lanes share.

```
packages/
  validation/   PH accounting rules — VAT (12%) math, TIN, required fields,
                category mapping. Pure functions, 100% unit tested.
  domain/       Canonical entity types, forward-compatible with the full model.
supabase/
  migrations/   0001_init.sql — schema + RLS (money as integer centavos).
```

Money is always integer **centavos** (1 peso = 100 centavos) to keep accounting
math exact.

## Develop

```bash
npm install
npm test          # run the validation suite (Vitest)
npm run typecheck # type-check all packages
```

## Status

- [x] F1 — schema + RLS (`supabase/migrations/0001_init.sql`) — **applied to Supabase**
- [x] F2 — domain types (`packages/domain`)
- [x] F3 — validation package (`packages/validation`) — 42 tests
- [x] Lane B — template parser + file decode + **persistence** (72 tests)
  - `npm run ingest -- <file.csv|xlsx> <clientId>` saves a batch to Supabase
  - [ ] email intake (Gmail) — auto-ingest emailed templates
- [ ] Lane A — Telegram webhook + worker + AI extraction
- [ ] Shared — review queue UI + staging/export

The template lane is live end to end: a client's CSV/XLSX is decoded, validated,
and persisted as `needs_review` items. See `docs/setup-supabase.md`.
