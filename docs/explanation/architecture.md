# Architecture — why TalloCPA OS is shaped the way it is

TalloCPA OS is a system-first operating system for a Philippine CPA firm: the firm
runs on routes and triggers, not on someone remembering. This document explains the
shape of the system and the design decisions behind it. For the factual API, see
[reference/modules.md](../reference/modules.md); for the schema, see
[reference/database.md](../reference/database.md).

## The problem

A CPA firm's work gets done, but it runs on fragmentation and memory. Client data,
job status, deadlines, and communications live scattered across Gmail, spreadsheets,
Manager.io, BIR portals, and the owner's head. Two pains bite hardest: **collecting
source data from clients every month**, and **knowing where every job is** across all
service types. And it must all keep running when the owner is not in the office.

## The shape: one job model, everything else is a projection

The firm is modeled as **jobs flowing through routes**. Every service the firm sells
is a *route template* (an ordered set of steps with owners and review gates); every
live engagement is a *job* moving down its route. Dashboards, quality evidence, staff
tracking, and SOPs are all views or triggers over that one model.

```
  Operating model (the firm)          The OS
  ────────────────────────────        ─────────────────────────────
  Client lifecycle spine        ─▶     jobs on routes
  6 service-line workflows      ─▶     route templates (packages/routes)
  SOPs per step                 ─▶     SOP library (packages/sop)
  SOQM / PSQM 1 quality layer   ─▶     gates + evidence over the same data
  Records + retention           ─▶     documents store
```

The full operating model (all six services, the SOQM overlay, retention) lives in the
design docs under `~/.gstack/projects/`. The route templates in `packages/routes`
encode it directly.

## The build so far

Packages are pure and composable. Everything hangs off `@tallocpa/domain` and
`@tallocpa/validation`; the DB layer is the only place that talks to Supabase.

```
  domain ─────────────────────────────────► (types)
  validation ─────────────────────────────► PH accounting rules (pure)
      │
  template-parser ─▶ template-io           Lane B: file → rows → drafts
      │                   │
  routes ─────────────────┼───────────────► the spine: templates + job state machine
      │                   │
  sop ────────────────────┼───────────────► SOPs per route step
      │                   │
      └──────── db ───────┴───────────────► Supabase persistence (the only I/O layer)
```

## Design decisions (and the trade-offs)

### Money is integer centavos, never floats

All money is stored and computed as an integer number of **centavos** (1 peso = 100
centavos). Floating-point pesos accumulate rounding error (`0.1 + 0.2 !== 0.3`), which
is unacceptable in accounting. VAT is split so `net + vat === gross` exactly, with no
stray centavo. Trade-off: every boundary must convert to/from centavos, and the display
layer is the only place pesos appear.

### The job state machine is pure and immutable

`packages/routes/engine.ts` never mutates a job's step array in place — every
transition returns a new array. This keeps history, undo, and testing trivial, and
removes a whole class of hidden-side-effect bugs. Trade-off: a little more allocation,
which is irrelevant at this scale.

### Forward-compatible schema, wedge-first build

The intake wedge (the monthly data-intake pain) was built before the routing spine,
but its tables were designed to match the full data model up front — `intake_items`
already carries `client_id`, `period`, `confidence`, `review_status`. So when the
spine landed, no migration was needed. Trade-off: a little more schema thought early,
paid back by zero migration on live financial data.

### The OS feeds taxify; it does not rebuild Manager posting

taxify.ph already generates the Manager Batch Import templates, validates against
Manager, and posts. The OS's unique value is *upstream* — photo/AI intake and review.
So the export contract is the three Batch Import formats (Purchase/Sales/Payroll,
VAT-inclusive); the OS produces the file, taxify posts it. Trade-off: the OS depends
on taxify for the last mile, in exchange for not re-solving Manager auth/posting.

### RLS from day one; the worker uses the service role

Every table has Row-Level Security enabled from the first migration; firm staff (rows
in `app_user`) get access via an `is_staff()` policy. Server-side workers (ingest,
job creation) use the Supabase **service-role** key, which bypasses RLS — appropriate
because they run trusted, off the browser. Client-facing read policies arrive with the
PWA phase. Trade-off: the service-role key is powerful and must never reach a browser
or a commit.

### SOQM is embedded in the route shape, then captured as evidence

Quality is not a separate module bolted on. Review gates in every route *are* PSQM 1
engagement performance (component 5); acceptance/independence steps in the assurance
routes are component 4; the SOP library is component 6. The remaining pieces — the
evidence records (independence confirmations, EQR sign-offs, monitoring) — are captured
over the same job data rather than in a parallel system.

## What comes next

The routing spine and SOP library are live. The near-term path is wiring intake to
jobs (a month's receipts attach to a client's bookkeeping job), then the command-center
dashboard (a projection over jobs), then the SOQM evidence layer.
