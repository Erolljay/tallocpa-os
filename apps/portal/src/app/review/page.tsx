import {
  CLIENT_UPLOADS_BUCKET,
  createServiceClient,
  holdNeedsSignOff,
  isPracticeLead,
  listReviewQueue,
  type ReviewQueueEntry,
} from "@tallocpa/db";
import { requireStaff } from "@/lib/session";
import { LEDGER_LABEL, LEDGERS, money, pesoInput, VALIDITY_LABEL } from "@/lib/labels";
import { approveHoldAction, clearItemAction, parseNow, reject, resend, saveItem } from "./actions";

const PREVIEW_TTL_SECONDS = 60 * 60;
/** n8n normally reads an upload within seconds; after this, offer "Parse now". */
const STALE_UPLOAD_MS = 10 * 60 * 1000;
const IN_BUCKET = ["needs_review", "flagged", "unreadable", "extract_failed"];

export default async function ReviewPage() {
  const { role } = await requireStaff();
  const supabase = createServiceClient();
  const queue = await listReviewQueue(supabase);

  const paths = queue.flatMap((q) => (q.storage_path ? [q.storage_path] : []));
  const signed = paths.length
    ? await supabase.storage.from(CLIENT_UPLOADS_BUCKET).createSignedUrls(paths, PREVIEW_TTL_SECONDS)
    : { data: [], error: null };
  if (signed.error) throw signed.error;
  const urlFor = new Map(
    (signed.data ?? []).flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [])),
  );
  const fileUrl = (q: ReviewQueueEntry) => (q.storage_path ? urlFor.get(q.storage_path) : undefined);

  const now = Date.now();
  const bucket = queue.filter((q) => IN_BUCKET.includes(q.review_status));
  const flaggedCount = bucket.filter((q) => q.review_status !== "needs_review").length;
  const stale = queue.filter(
    (q) => q.review_status === "uploaded" && now - Date.parse(q.created_at) > STALE_UPLOAD_MS,
  );
  const held = queue.filter((q) => q.review_status === "held");
  const unsent = queue.filter((q) => q.review_status === "posted" || q.review_status === "approved");

  return (
    <div className="stack">
      <div>
        <h1>Review bucket</h1>
        <p className="lede">
          {bucket.length} to review ({flaggedCount} flagged) · {held.length} held ·{" "}
          {unsent.length} not yet sent to n8n. Clean documents are cleared automatically by n8n;
          what&apos;s here needs a person.
        </p>
      </div>

      {stale.length > 0 && (
        <section className="sheet">
          <h2 style={{ marginTop: 0 }}>Not read yet</h2>
          <p className="muted">n8n hasn&apos;t picked these up. Read them here instead.</p>
          <ul className="progress">
            {stale.map((q) => (
              <li key={q.id}>
                <span>{q.client_name} · uploaded {q.created_at.slice(0, 16).replace("T", " ")}</span>
                <form action={parseNow}>
                  <input type="hidden" name="id" value={q.id} />
                  <button>Parse now</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {held.length > 0 && (
        <section className="sheet">
          <h2 style={{ marginTop: 0 }}>Held</h2>
          <ul className="progress">
            {held.map((q) => (
              <li key={q.id} style={{ flexWrap: "wrap" }}>
                <span>
                  {q.client_name} · {q.ledger ? LEDGER_LABEL[q.ledger] : "—"} · {q.supplier_name ?? "—"} ·{" "}
                  <span className="figure">{money(q.gross)}</span> · {q.txn_date} → <b>{q.hold_period}</b>
                  {q.hold_reason && <span className="muted"> ({q.hold_reason})</span>}
                </span>
                {holdNeedsSignOff(q) ? (
                  isPracticeLead(role) ? (
                    <form action={approveHoldAction} className="reject-form">
                      <input type="hidden" name="id" value={q.id} />
                      <input name="reason" required placeholder="Reason for deferring this sale (logged)" aria-label="Sign-off reason" />
                      <button className="primary">Approve hold</button>
                    </form>
                  ) : (
                    <span className="stamp review">Needs practice-lead sign-off</span>
                  )
                ) : (
                  <span className="stamp pending">Released on {q.hold_period}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {unsent.length > 0 && (
        <section className="sheet">
          <h2 style={{ marginTop: 0 }}>Posted, not sent to n8n</h2>
          <ul className="progress">
            {unsent.map((q) => (
              <li key={q.id}>
                <span>
                  {q.client_name} · {q.supplier_name ?? "—"} · <span className="figure">{money(q.gross)}</span>
                </span>
                <form action={resend}>
                  <input type="hidden" name="id" value={q.id} />
                  <button>Resend</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="queue">
        {bucket.length === 0 && <p className="muted">All caught up.</p>}
        {bucket.map((q) => (
          <ReviewCard key={q.id} item={q} fileUrl={fileUrl(q)} />
        ))}
      </div>
    </div>
  );
}

type CardProps = { item: ReviewQueueEntry; fileUrl: string | undefined };

function ReviewCard({ item, fileUrl }: CardProps) {
  const validity = item.tax_validity ? VALIDITY_LABEL[item.tax_validity] : null;
  const notes = item.review_notes?.split("; ") ?? [];
  const isFailed = item.review_status === "extract_failed";

  return (
    <article className="sheet">
      <div className="card-head">
        <h2>
          {item.client_name}
          <span className="muted"> · {item.ledger ? LEDGER_LABEL[item.ledger] : "Uncategorized"}</span>
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {validity && <span className={`stamp ${validity.tone}`}>{validity.label}</span>}
          <span className={`stamp ${item.review_status}`}>{item.review_status.replace("_", " ")}</span>
          {item.ai_recommendation && (
            <span className={`stamp ${item.ai_recommendation}`}>AI: {item.ai_recommendation}</span>
          )}
          {fileUrl && (
            <a href={fileUrl} target="_blank" rel="noopener noreferrer">
              View file
            </a>
          )}
        </div>
      </div>

      {notes.length > 0 && (
        <ul className="reasons">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      {isFailed && (
        <form action={parseNow} className="actions">
          <input type="hidden" name="id" value={item.id} />
          <button>Try reading again</button>
        </form>
      )}

      <form action={saveItem}>
        <input type="hidden" name="id" value={item.id} />
        <div className="fields">
          <label>
            Category
            <select name="ledger" defaultValue={item.ledger ?? "other"}>
              {LEDGERS.map((l) => (
                <option key={l} value={l}>{LEDGER_LABEL[l]}</option>
              ))}
            </select>
          </label>
          <label>
            Date
            <input name="txnDate" type="date" defaultValue={item.txn_date ?? ""} />
          </label>
          <label>
            Invoice / OR no.
            <input name="orNumber" defaultValue={item.or_number ?? ""} />
          </label>
          <label>
            Counterparty name
            <input name="supplierName" defaultValue={item.supplier_name ?? ""} />
          </label>
          <label>
            TIN
            <input name="tin" defaultValue={item.tin ?? ""} className="figure" />
          </label>
          <label>
            Registered address
            <input name="address" defaultValue={item.counterparty_address ?? ""} />
          </label>
        </div>

        <div className="fields" style={{ marginTop: 12 }}>
          <MoneyField name="gross" label="Total (₱)" value={item.gross} />
          <MoneyField name="vatable" label="VATable (₱)" value={item.vatable} />
          <MoneyField name="vatExempt" label="VAT-exempt (₱)" value={item.vat_exempt} />
          <MoneyField name="zeroRated" label="Zero-rated (₱)" value={item.zero_rated} />
          <MoneyField name="vat" label="VAT (₱)" value={item.vat} />
          <MoneyField name="wht" label="Withholding (₱)" value={item.wht_amount} />
          <label>
            ATC
            <input name="atc" defaultValue={item.atc ?? ""} className="figure" />
          </label>
        </div>

        <div className="totals">
          <div><span>Total</span><b className="figure">{money(item.gross)}</b></div>
          <div><span>VAT</span><b className="figure">{money(item.vat)}</b></div>
          <div><span>AI confidence</span><b className="figure">{item.confidence != null ? `${Math.round(item.confidence * 100)}%` : "—"}</b></div>
        </div>

        <label>
          Note to client (shown in their portal)
          <input name="clientNote" defaultValue={item.client_note ?? ""} />
        </label>

        <div className="actions">
          <button className="primary" formAction={clearItemAction}>Clear &amp; post</button>
          <button>Save changes</button>
        </div>
      </form>

      <form action={reject} className="actions">
        <input type="hidden" name="id" value={item.id} />
        <div className="reject-form">
          <input name="reason" placeholder="Reason for returning (shown to client)" aria-label="Reject reason" />
          <button className="danger">Return</button>
        </div>
      </form>
    </article>
  );
}

type MoneyProps = { name: string; label: string; value: number | null };

function MoneyField({ name, label, value }: MoneyProps) {
  return (
    <label>
      {label}
      <input name={name} inputMode="decimal" defaultValue={pesoInput(value)} className="figure" />
    </label>
  );
}
