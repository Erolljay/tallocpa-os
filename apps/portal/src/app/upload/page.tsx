import { createServiceClient, listClientItems, type IntakeItemRow } from "@tallocpa/db";
import { requireClient } from "@/lib/session";
import { clientStatus, laterMonthsInYear, LEDGER_LABEL, money } from "@/lib/labels";
import { requestHoldAction } from "./actions";
import { UploadForm } from "./UploadForm";

export default async function UploadPage() {
  const { client } = await requireClient();
  const items = await listClientItems(createServiceClient(), client.id);

  return (
    <div className="stack">
      <div>
        <h1>{client.name}</h1>
        <p className="lede">
          Upload your sales invoices, supplier receipts and expense receipts. We sort and read
          them for you; our team checks every one before it goes into your books.
        </p>
      </div>

      <UploadForm clientId={client.id} />

      <section className="sheet">
        <h2 style={{ marginTop: 0 }}>Your uploads</h2>
        {items.length === 0 ? (
          <p className="muted">Nothing yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>From / to</th>
                  <th>Type</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <ItemRow key={item.id} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

type RowProps = { item: IntakeItemRow };

function ItemRow({ item }: RowProps) {
  const status = clientStatus(item.review_status);
  const canHold = ["needs_review", "flagged"].includes(item.review_status);
  const months = canHold ? laterMonthsInYear(item.txn_date) : [];
  const holdNote =
    item.review_status === "held" && item.hold_period
      ? `Held to ${item.hold_period}${item.ledger === "sales" && !item.hold_approved_at ? " (awaiting approval)" : ""}`
      : null;

  return (
    <tr>
      <td className="figure">{item.txn_date ?? "—"}</td>
      <td>
        {item.supplier_name ?? <span className="muted">Being read…</span>}
        {item.client_note && <div className="muted">Note from TalloCPA: {item.client_note}</div>}
        {holdNote && <div className="muted">{holdNote}</div>}
        {months.length > 0 && (
          <details>
            <summary className="muted">Report in a later month</summary>
            <form action={requestHoldAction} className="actions">
              <input type="hidden" name="id" value={item.id} />
              <select name="period" aria-label="Month to report in" style={{ width: "auto" }}>
                {months.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <input name="reason" placeholder="Reason (optional)" aria-label="Hold reason" style={{ flex: "1 1 160px", width: "auto" }} />
              <button>Hold</button>
            </form>
          </details>
        )}
      </td>
      <td>{item.ledger ? LEDGER_LABEL[item.ledger] : "—"}</td>
      <td className="num figure">{money(item.gross)}</td>
      <td><span className={`stamp ${status.tone}`}>{status.label}</span></td>
    </tr>
  );
}
