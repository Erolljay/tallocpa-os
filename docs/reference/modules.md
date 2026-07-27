# Reference — packages and their public API

TalloCPA OS is an npm-workspaces monorepo. Packages are pure and composable; only
`@tallocpa/db` performs I/O. Every package exports from `src/index.ts`. Money is
always integer **centavos**.

For the reasoning behind these shapes, see
[explanation/architecture.md](../explanation/architecture.md).

---

## @tallocpa/domain

Canonical entity types, forward-compatible with the full data model. Types only, no
runtime code.

- Aliases: `Centavos`, `Uuid`, `IsoDate` (`YYYY-MM-DD`), `IsoTimestamp`
- Enums: `IntakeSource` (`photo|template|manual`), `DocType`
  (`official_receipt|sales_invoice|unknown`), `VatClass`
  (`vatable|vat_exempt|zero_rated`), `ReviewStatus`
  (`received|extract_failed|unreadable|needs_review|approved|rejected|exported`),
  `StaffRole` (`owner|manager|reviewer|staff`)
- Entities: `Client`, `TelegramBinding`, `IntakeInboxRow`, `IntakeBatch`,
  `IntakeItem`, `DocumentRef`

---

## @tallocpa/validation

Deterministic Philippine accounting rules, shared by both intake lanes. Pure functions.

**Money** (`money.ts`)
- `type Centavos = number`
- `isCentavos(n): boolean` — safe integer check
- `pesosToCentavos(pesos): Centavos` · `centavosToPesos(c): number`
- `formatPeso(c): string` — e.g. `formatPeso(123450)` → `"₱1,234.50"`

**VAT** (`vat.ts`) — PH rate 12%
- `PH_VAT_RATE = 0.12`, `type VatClass`
- `breakdownFromInclusiveGross(gross, vatClass?='vatable'): VatBreakdown` — splits a
  VAT-inclusive gross so `net + vat === gross` exactly. Throws `RangeError` on
  negative/non-integer input.
- `breakdownFromExclusiveNet(net, vatClass?): VatBreakdown` — adds 12% on top
- `reconcileVat({ gross, providedVat, vatClass?, toleranceCentavos?=1 }): VatReconciliation`
  — `{ ok, expectedVat, providedVat, diff, toleranceCentavos, reason? }`. The
  hallucinated-amount guard: catches a VAT figure that does not match the gross.

**TIN** (`tin.ts`) — valid normalized lengths: 9, 12, 14 digits
- `normalizeTin(input): string` · `isValidTin(input): boolean` (rejects all-zeros) ·
  `formatTin(input): string` (e.g. `"123-456-789-000"`)

**Required fields** (`required-fields.ts`)
- `interface IntakeDraft { date?, supplierName?, gross?, vat?, tin?, orNumber?, docType? }`
- `validateRequiredFields(draft): { ok, missing[] }` — needs a real ISO date (rejects
  `2026-02-31`), a supplier name, and a positive integer gross
- `checkBirValidity(draft): { valid, reasons[] }` — TIN + OR number + known doc type

**Category** (`category.ts`)
- `interface ChartAccount { code, name, aliases? }`
- `mapCategory(input, coa): { matched, accountCode?, accountName? }` — exact match on
  normalized name or alias; unmatched otherwise (never guesses)

---

## @tallocpa/template-parser

Lane B core: parse Excel/CSV **rows** (already keyed by header) into validated drafts.

- `COLUMN_ALIASES`, `CANONICAL_HEADERS`, `CANONICAL_HEADER_ORDER`, `normalizeHeader`,
  `getField(row, aliases)` — header mapping (e.g. "Vendor" → supplier)
- `parseMoneyToCentavos(raw): { value, ok }` — handles `₱`/`PHP`, commas, `(500)` negatives
- `parseDateToIso(raw): { value, ok }` — ISO, `YYYY/MM/DD`, `MM/DD/YYYY` (DD/MM fallback)
- `parseVatClass(raw): VatClass`
- `parseTemplateRows(rows): ParseResult` — `{ rows: ParsedRow[], summary }`. Each
  `ParsedRow` has `status: 'ok'|'needs_fix'|'duplicate'` and `errors[]`. Bad rows are
  flagged, never dropped; the batch is never rejected wholesale.

---

## @tallocpa/template-io

Lane B file I/O: decode uploaded files and generate the blank client template.

- `parseCsv(text): Record<string,string>[]` (PapaParse)
- `parseXlsx(data: ArrayBuffer|Buffer): Promise<Record<string,string>[]>` (ExcelJS,
  first sheet, row 1 = header) · `buildXlsx(headers, rows): Promise<Buffer>`
- `buildTemplateCsv(includeExamples?=true): string` ·
  `buildTemplateXlsx(includeExamples?=true): Promise<Buffer>` · `TEMPLATE_EXAMPLE_ROWS`
- `fileToRows({ name, data }): Promise<Record<string,string>[]>` — dispatches by
  extension (`.csv` text, `.xlsx` binary)

---

## @tallocpa/routes

The spine: service route templates + the pure job state machine.

**Types** — `ServiceType` (6), `ServiceArchetype` (`recurring|project|assurance`),
`JobRole` (`preparer|reviewer|manager|partner|eqr|client`), `StepStatus`
(`pending|active|done|skipped|blocked`), `JobStatus`
(`not_started|in_progress|in_review|blocked|done`), `RouteStep`, `RouteTemplate`,
`Job`, `JobStep`.

**Templates** — `TAX_COMPLIANCE`, `BOOKKEEPING`, `AUDIT`, `AGREED_UPON_PROCEDURES`,
`BUSINESS_PROCESSING`, `SYSTEMS_IMPLEMENTATION`, `ROUTE_TEMPLATES` (by service),
`templateFor(service)`.

**Engine** (all pure, return new arrays)
- `instantiate(template, { clientId, period? }): { job, steps }` — first step active
- `activeStep(steps)` · `completeActiveStep(steps)` (advance) ·
  `rejectToStep(steps, backToKey)` (bounce back from a gate; re-pends intervening work)
- `blockActiveStep(steps)` · `unblockStep(steps, key)`
- `isComplete(steps)` · `deriveJobStatus(steps): JobStatus` · `progress(steps): { done, total }`

---

## @tallocpa/sop

SOP library: versioned procedures attached to route steps (PSQM 1 component 6).

- `interface Sop { key, serviceType, stepKey, title, purpose, procedure[], checklist[], version }`
  — key convention `${serviceType}.${stepKey}`
- `SEED_SOPS: Sop[]` — full starter SOPs for Bookkeeping + Tax Compliance
- `sopForStep(serviceType, stepKey): Sop | undefined` · `sopsForService(serviceType): Sop[]`
- `sopCoverage(): SopCoverageRow[]` · `sopCoverageSummary(): { covered, total }` — the
  SOP gap list across every route step

---

## @tallocpa/db

The only I/O layer. Reads Supabase credentials from the environment.

- `createServiceClient(): SupabaseClient` — uses the **service-role** key
  (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`); server-side only, bypasses RLS
- `ingestTemplateFile({ filePath, clientId }): Promise<IngestResult>` — decode → parse →
  persist a batch (everything lands `needs_review`)
- `ingestParsedBatch(supabase, { clientId, fileName, parsed }): Promise<IngestResult>`
- `createJob(supabase, { clientId, serviceType, period? }): Promise<CreateJobResult>` —
  instantiate a route template and persist job + steps
- `seedSops(supabase, sops?=SEED_SOPS): Promise<{ upserted }>` (idempotent on key) ·
  `getSopForStep(supabase, serviceType, stepKey): Promise<Sop | null>`
