import type { DocType, Ledger, VatClass } from "@tallocpa/domain";
import type { ClientContext, RawInvoiceExtraction } from "./types.js";

/**
 * Gemini vision extractor. Sends the document image (or PDF) with a strict
 * instruction + response schema and returns the raw, still-untrusted fields.
 * All arithmetic and validation happen in {@link mapExtraction} — this layer
 * only reads what's printed and classifies. Server-side only (holds the key).
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const EXTRACTION_RULES = [
  "You are reading one Philippine business source document for a CPA firm.",
  "Extract ONLY what is printed.",
  "",
  "Rules:",
  "- Amounts are numbers in pesos with NO currency symbol and NO thousands commas",
  "  (e.g. 1120.00, not ₱1,120.00).",
  "- amountVatInclusivePesos = the printed grand total the buyer pays.",
  "- vatablePesos, vatExemptPesos, zeroRatedPesos = the printed 'VATable Sales',",
  "  'VAT-Exempt Sales' and 'Zero-Rated Sales' lines; null when a line is not printed.",
  "- vatPesos = the printed VAT amount (12%) if shown, else null. Do NOT calculate it.",
  "- whtPesos / atc = a printed withholding tax amount and its ATC code (e.g. WC158), else null.",
  "- vatType: 'vatable' if the document charges 12% VAT; 'vat_exempt' if it is a",
  "  VAT-exempt sale; 'zero_rated' if zero-rated. Default to 'vatable' when a VAT",
  "  line is present.",
  "- date: the invoice/transaction date as ISO YYYY-MM-DD.",
  "- sellerTin: the TIN of whoever ISSUED the document, exactly as printed.",
  "- sellerVatRegistered: true if the issuer prints 'VAT REG TIN' / 'VAT-registered',",
  "  false if it prints 'NON-VAT REG TIN' / 'Non-VAT registered', null if neither.",
  "- supplierName / tin / counterpartyAddress / branchCode: the COUNTERPARTY's",
  "  registered name, TIN (keep any branch code), and address as printed.",
  "- docType: 'official_receipt', 'sales_invoice', or 'unknown'.",
  "- isBirDocument: true only for a BIR-registered sales invoice or official receipt",
  "  (has the issuer's registered name, TIN, and a serial number). False for",
  "  quotations, delivery receipts, order slips, statements, payslips, and the like.",
  "- nonBirReason: when isBirDocument is false, what the document is (e.g. 'quotation').",
  "- ledger: 'sales' if issued BY the client; 'purchases' for goods bought for resale",
  "  or production; 'expenses' for services, utilities, rent, supplies and other",
  "  operating costs; 'other' if none of these fit.",
  "- confidence: your 0..1 confidence in this extraction.",
  "- If a field is not clearly present, return null. NEVER guess or fabricate.",
];

/** The prompt, with the client's identity when known (decides the counterparty). */
export function buildExtractionPrompt(client?: ClientContext): string {
  const context = client
    ? [
        "",
        `The client (whose books this is for) is "${client.name}"` +
          (client.tin ? ` with TIN ${client.tin}.` : "."),
        "The COUNTERPARTY is the other party: the seller when the client buys,",
        "the buyer when the client sells.",
      ]
    : [
        "",
        "This is a supplier's document: the COUNTERPARTY is the seller who issued it.",
      ];
  return [...EXTRACTION_RULES, ...context].join("\n");
}

/** Gemini response schema (OpenAPI subset) mirroring RawInvoiceExtraction. */
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    date: { type: "STRING", nullable: true },
    supplierName: { type: "STRING", nullable: true },
    tin: { type: "STRING", nullable: true },
    counterpartyAddress: { type: "STRING", nullable: true },
    sellerTin: { type: "STRING", nullable: true },
    sellerVatRegistered: { type: "BOOLEAN", nullable: true },
    branchCode: { type: "STRING", nullable: true },
    ledger: {
      type: "STRING",
      enum: ["sales", "purchases", "expenses", "other"],
    },
    isBirDocument: { type: "BOOLEAN" },
    nonBirReason: { type: "STRING", nullable: true },
    vatType: { type: "STRING", enum: ["vatable", "vat_exempt", "zero_rated"] },
    docType: {
      type: "STRING",
      enum: ["official_receipt", "sales_invoice", "unknown"],
    },
    orNumber: { type: "STRING", nullable: true },
    amountVatInclusivePesos: { type: "NUMBER", nullable: true },
    vatablePesos: { type: "NUMBER", nullable: true },
    vatExemptPesos: { type: "NUMBER", nullable: true },
    zeroRatedPesos: { type: "NUMBER", nullable: true },
    vatPesos: { type: "NUMBER", nullable: true },
    whtPesos: { type: "NUMBER", nullable: true },
    atc: { type: "STRING", nullable: true },
    confidence: { type: "NUMBER" },
  },
  required: ["ledger", "isBirDocument", "vatType", "docType", "confidence"],
} as const;

const VAT_CLASSES: VatClass[] = ["vatable", "vat_exempt", "zero_rated"];
const DOC_TYPES: DocType[] = ["official_receipt", "sales_invoice", "unknown"];
const LEDGERS: Ledger[] = ["sales", "purchases", "expenses", "other"];

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Coerce Gemini's parsed JSON into a well-typed RawInvoiceExtraction. */
export function coerceExtraction(obj: Record<string, unknown>): RawInvoiceExtraction {
  const vatType = VAT_CLASSES.includes(obj.vatType as VatClass)
    ? (obj.vatType as VatClass)
    : "vatable";
  const docType = DOC_TYPES.includes(obj.docType as DocType)
    ? (obj.docType as DocType)
    : "unknown";
  const ledger = LEDGERS.includes(obj.ledger as Ledger)
    ? (obj.ledger as Ledger)
    : "other";
  return {
    date: asString(obj.date),
    supplierName: asString(obj.supplierName),
    tin: asString(obj.tin),
    counterpartyAddress: asString(obj.counterpartyAddress),
    sellerTin: asString(obj.sellerTin),
    sellerVatRegistered: typeof obj.sellerVatRegistered === "boolean" ? obj.sellerVatRegistered : null,
    ledger,
    // Fail closed: anything but an explicit true is not a BIR document.
    isBirDocument: obj.isBirDocument === true,
    nonBirReason: asString(obj.nonBirReason),
    branchCode: asString(obj.branchCode),
    vatType,
    docType,
    orNumber: asString(obj.orNumber),
    amountVatInclusivePesos: asNumber(obj.amountVatInclusivePesos),
    vatablePesos: asNumber(obj.vatablePesos),
    vatExemptPesos: asNumber(obj.vatExemptPesos),
    zeroRatedPesos: asNumber(obj.zeroRatedPesos),
    vatPesos: asNumber(obj.vatPesos),
    whtPesos: asNumber(obj.whtPesos),
    atc: asString(obj.atc),
    confidence: asNumber(obj.confidence) ?? 0,
  };
}

export class GeminiClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  /** Extract invoice fields from a document's bytes (image or PDF). */
  async extractInvoice(
    bytes: Buffer,
    mimeType: string,
    client?: ClientContext,
  ): Promise<RawInvoiceExtraction> {
    const url = `${GEMINI_BASE}/${this.model}:generateContent`;
    const body = {
      contents: [
        {
          parts: [
            { text: buildExtractionPrompt(client) },
            { inline_data: { mime_type: mimeType, data: bytes.toString("base64") } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    };

    // Key in a header, not the URL, so it never lands in request logs.
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Gemini request failed: ${res.status} ${detail.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned no content");

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`Gemini returned non-JSON output: ${text.slice(0, 200)}`);
    }
    return coerceExtraction(parsed);
  }
}
