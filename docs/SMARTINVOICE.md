# SmartInvoice — Receipts Integration Notes

> **Provider docs (always the source of truth):** https://smartinvoices.co.il/docs.html
> **Used by:** `backend/src/services/receipts.js`, `backend/src/routes/receipts.js`,
> `frontend/src/components/dashboard/receipt-options.tsx`
>
> The provider updates its API often. Before changing the receipts code, or when debugging a receipt
> problem, re-read the live docs and compare them with the assumptions listed below.

---

## 1. What the integration does

| Item | Value |
|------|-------|
| Feature switch | `SMARTINVOICE_API_KEY` in `local_data/.env`. Empty = the feature is hidden in the UI and nothing is sent |
| Base URL | `https://smartinvoices.co.il/smartinvoice/api/v1` (override: `SMARTINVOICE_BASE_URL`) |
| Auth | `Authorization: Bearer <key>` |
| Key types | `sk_live_...` = real, legally numbered documents (cannot be deleted) · `sk_test_...` = sandbox: write calls are dry-runs. The app treats a dry-run answer as a **failed** receipt (with an alert), so a test key configured by mistake is noticed |
| Document type | Always `invoice_type: "receipt"` (קבלה, no VAT) — suitable for an exempt dealer (עוסק פטור) or any business that issues plain receipts. A VAT-registered business that needs tax invoice-receipts must change this in `receipts.js` |
| Endpoints used | `POST /documents` (create), `GET /documents/{id}/pdf` (PDF, stored once on our server), `GET /documents?type=receipt&from&to` (duplicate guard), `GET /documents?limit=1` (read-only probe during an outage). **Not used:** `/documents/{id}/send` — the customer's email is sent by the app itself (Apps Script, the business Gmail) |
| Customer data sent | **Name only.** SmartInvoice never receives the customer's phone or email, so it cannot store them, email her on its own, or merge customers by them |
| Idempotency | Every create request carries `Idempotency-Key: dress-rental-<env>-<test|live>-receipt-<receipt id>-<attempt>`, so a retry can never issue a second legal document |

## 2. Request shape

```json
{
  "invoice_type": "receipt",
  "issue_date": "2026-11-15",
  "customer": { "name": "ישראלה ישראלי" },
  "items": [{ "description": "שמלה", "quantity": 1, "unit_price": 500 }],
  "payments": [{ "method": "bit", "amount": 500, "reference": "123456" }],
  "notes": "הערה שתודפס בקבלה"
}
```

- `issue_date` is always **today in Israel time** (`utils/israelDate.js`), so a receipt issued after midnight is
  never dated by a provider-side UTC "today".
- `payments[].reference` is a string of at most **100 characters** and is **required for `bank_transfer`**.
  The only documented payment-detail field is `reference`, so the app folds every detail it knows
  (confirmation number, card last 4 digits, installments, check number, bank / branch / account) into it.
- Payment methods: the app's `cash`, `credit`, `bit`, `transfer`, `check` map to `cash`, `credit_card`, `bit`,
  `bank_transfer`, `check`. SmartInvoice has no PayBox and no "other": both are sent as `bank_transfer`, with the
  real method name at the start of the reference ("פייבוקס", "אמצעי תשלום אחר"). A bank transfer with no details
  at all is sent with reference `"0"` instead of failing.
- Payment amounts must add up to the document total; cash above the legal limit is rejected (`cash_law_blocked`).

## 3. Response handling

- The receipt number is read from `document.full_invoice_number`, then `invoice_number`, then `number`.
  If a live answer has no document id or number, the receipt is still marked issued and a Telegram alert asks to
  check the portal (it means the response shape changed).
- A sandbox answer (`test_mode: true`, `document.is_test: true` or a `TEST-...` number) = failed receipt (`test_key`).
- 4xx = definitive rejection: the next attempt uses a new idempotency key. 5xx / no connection = unknown outcome:
  the key is kept, and before any further attempt the app lists the account's receipts and adopts an existing one
  with the same total and customer name instead of issuing again (anything ambiguous stops with an alert).
- Temporary provider failures (no connection, 5xx, `rate_limited`) start an outage watcher that probes the API every
  5 minutes and sends **one** Telegram message when it answers again. Nothing is re-issued automatically.

## 4. Sharing a receipt with the customer

- The "show receipt" button and the owner's email use the server copy
  (`local_data/uploads/receipts/<year>/<yymmdd> <customer> <amount>₪ - קבלה <number>.pdf`).
- The WhatsApp message links to SmartInvoice's public view of the document — the page behind the QR code printed
  on the PDF (`https://smartinvoices.co.il/fixmaster/i/<document id>`). This URL is **not documented**, so the
  server checks it before each share (HTTP 200 and the receipt number on the page) and otherwise sends its own
  signed link (`/api/receipts/public/<token>`, valid 90 days).

## 5. Things to re-check when the provider changes its API

- Structured payment fields (card digits, check number, bank): if added, use them instead of the composed `reference`.
- The list of allowed payment `method` values.
- The response shape of `POST /documents` in live mode (`document.id`, the number fields, `pdf_url`).
- Error codes used for the Hebrew messages in `ERROR_MESSAGES_HE` (`receipts.js`).
- Rate limits and the monthly quota error (`api_quota_exceeded`).
- Whether the public view URL in section 4 still works (if WhatsApp links stop opening, the app falls back to its own link).
