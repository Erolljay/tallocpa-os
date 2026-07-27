# Tutorial: from clone to a live job

By the end of this you'll have the test suite passing, a client's template ingested
into a real database, and a live bookkeeping job with its route steps — the OS spine
working end to end. Budget about 15 minutes.

## What you'll need

- Node.js >= 20
- A free Supabase account (for the database half)

## Step 1: Install

```bash
npm install
```

One install links every package in the monorepo.

## Step 2: See the tests pass

```bash
npm test
```

You should see **99 tests passing** in about a second. That's the entire pure core —
VAT math, TIN validation, the template parser, and the job state machine — working
with no database and no credentials. This is your first result: the business rules are
real and verified.

Everything from here needs a database.

## Step 3: Create a Supabase project

Follow [../setup-supabase.md](../setup-supabase.md) through step 3 (create the project
in the Singapore region, and put your project URL + service-role key in `.env`). Then
apply the migrations in order — open each in the Supabase **SQL Editor** and Run:

```
0001_init.sql  →  0002_jobs.sql  →  0003_sops.sql
```

## Step 4: Ingest a client's template

The repo ships a sample filled template. Create a test client and ingest it in one go:

```bash
node --env-file=.env --import tsx scripts/smoke-template.ts
```

You'll see it connect, create a "Test Client", and print the rows now in your database:

```
✓ Connected, schema present
✓ Created Test Client: 323c3d4d-...
✓ Ingested batch ...: 2 item(s) { ok: 2, needsFix: 0, duplicates: 0 }

 supplier_name   gross    vat     review_status
 Mercury Drug    11200    1200    needs_review
 Meralco         560000   60000   needs_review
```

Those are two transactions, decoded from CSV, validated to the exact centavo (VAT
reconciled), sitting in your `intake_items` table waiting for review.

## Step 5: Create a live job

Now spin up a bookkeeping job for that client:

```bash
node --env-file=.env --import tsx scripts/smoke-job.ts
```

```
✓ Created bookkeeping job f57406ce-... — status: in_progress

 step_order  name                                        owner_role  is_review_gate  status
 0           Monthly intake (photos + bank statements)   preparer    false           active
 1           AI classify / extract                       preparer    false           pending
 2           Reviewer check                              reviewer    true            pending
 ...
 7           Period close                                reviewer    true            pending
 8           Hand off to Tax Compliance                  preparer    false           pending
```

Step 0 is **active**, the rest **pending**, and the two review gates are flagged. That
is the OS spine: a service route materialized into a live job.

## Step 6 (optional): Load the SOP library

```bash
node --env-file=.env --import tsx scripts/seed-sops.ts
```

This loads 20 starter SOPs (Bookkeeping + Tax Compliance, one per step) and reads one
back — the procedure content that shows at the point of work on each job step.

## What you built

You now have the pure business rules verified (Step 2), a client's data decoded and
persisted (Step 4), a live job on a route (Step 5), and the SOP library loaded (Step
6). Open Supabase → **Table Editor** and browse `intake_items`, `jobs`, `job_steps`,
and `sops` to see it all.

Next: the module reference is in [../reference/modules.md](../reference/modules.md),
and the why is in [../explanation/architecture.md](../explanation/architecture.md).
