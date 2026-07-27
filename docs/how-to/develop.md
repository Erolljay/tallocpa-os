# How to develop TalloCPA OS

Common development tasks: install, test, type-check, apply migrations, and run the
data scripts.

## Prerequisites

- Node.js >= 20 (developed on 24)
- A Supabase project (Singapore region) for anything that touches the database — see
  [../setup-supabase.md](../setup-supabase.md)

## Install

```bash
npm install
```

This is an npm-workspaces monorepo; one install links all packages under
`packages/*`.

## Run the tests

```bash
npm test
```

Runs the whole Vitest suite (99 tests across the pure packages). No database or
credentials needed — the pure packages are fully testable in isolation.

## Type-check

```bash
npx tsc --noEmit -p packages/<name>/tsconfig.json   # one package
```

Each package has its own `tsconfig.json` extending `tsconfig.base.json`. `@types/node`
is pinned to `~20.14` (below the generic-`Buffer` backport) so ExcelJS type-checks.

## Apply database migrations

Migrations are in `supabase/migrations/`, applied **in order**. The simplest way:
open each file, copy its contents into the Supabase **SQL Editor**, and Run.

```
0001_init.sql   →  0002_jobs.sql   →  0003_sops.sql
```

`0003` depends on a type created in `0002`, so order matters. Each should report
"Success. No rows returned."

## Environment

Scripts that touch Supabase read credentials from a local `.env` (gitignored). Copy
the example and fill in your project URL + service-role key:

```bash
cp .env.example .env
```

> The `service_role` key bypasses RLS. Keep it in `.env` only — never commit it,
> never put it in a browser.

## Data scripts

Run with Node's `--env-file` so the script picks up `.env`:

```bash
# Ingest a filled template into Supabase (needs 0001)
npm run ingest -- docs/templates/intake-template.csv <clientId>

# End-to-end template smoke: ensure Test Client, ingest sample, read back
node --env-file=.env --import tsx scripts/smoke-template.ts

# Create a bookkeeping job for the Test Client + print its steps (needs 0002)
node --env-file=.env --import tsx scripts/smoke-job.ts

# Load the SOP library, then read one SOP back (needs 0003)
node --env-file=.env --import tsx scripts/seed-sops.ts
```

## Troubleshooting

- **`Could not find the table 'public.<x>'`** — the migration that creates it hasn't
  been applied. Apply the migrations above, in order.
- **`SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set`** — `.env` is missing or
  empty; recheck the Environment step.
- **auth / permission errors from a script** — make sure `.env` has the `service_role`
  key, not the `anon` key.
- **ExcelJS `Buffer` type errors on type-check** — confirm `@types/node` resolved to
  `~20.14` (a newer version backports a generic `Buffer` that ExcelJS's types reject).
