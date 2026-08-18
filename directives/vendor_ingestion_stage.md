# Directive: vendor_ingestion_stage

## Goal

Ingest raw vendor data (file upload, form submission, JSON payload, CSV) and validate it against the expected schema before it is handed to a downstream normalization stage. This is a pipeline stage, not a full pipeline — it does not normalize, score, or persist anything beyond what's needed to prove validity.

## Scope / Non-Goals

- Course-safe, non-proprietary. Does NOT include VendorIQ scoring logic or any trade-secret methodology.
- Does NOT perform normalization — that is a separate, later stage.
- Does NOT decide vendor eligibility, ranking, or any business judgment — validation only (does the input match the expected shape).

## Inputs

- File upload (CSV)
- Form submission (multipart/form-data)
- Direct JSON payload
- Direct CSV payload (non-file, e.g. pasted/streamed)

Exact field-level schema (required vendor attributes, types, formats) is TBD at implementation time and must be captured in `vendorIngestionSchema.ts` as the single source of truth — this directive does not hardcode field names to avoid drift between doc and code.

## Outputs

- Success: a validated, schema-conformant record handed to the normalization stage (interface TBD, owned by that stage).
- Failure: a structured rejection (which field failed, why) returned to the caller — never a silent drop.

## Validation Rules

- Schema is enforced with Zod (or equivalent) at the service boundary, per CLAUDE.md → Contract Enforcement Layer.
- Reject malformed input before it reaches any downstream logic — no partial acceptance.
- All four input formats (file, form, JSON, CSV) converge on the same schema check — one contract, multiple adapters.

## Edge Cases (must be covered by tests before this ships)

- Empty file / empty payload
- Oversized file (define and enforce a max size)
- Wrong file type (e.g., `.xlsx` submitted where `.csv` expected)
- Malformed CSV (ragged rows, wrong delimiter, encoding issues)
- Malformed JSON (invalid syntax, wrong top-level shape)
- Missing required fields / extra unexpected fields
- Duplicate submission of the same file/batch (see Idempotency)

## Idempotency

Required mechanism (per CLAUDE.md → Idempotency & Replayability, NON-NEGOTIABLE): dedup key on `(vendor_id, source, file_hash)` — or `(vendor_id, source, batch_id)` if no stable file hash is available — checked before any side effect (persistence or forwarding to normalization) fires. Re-running ingestion on the same file/batch must not produce duplicate downstream records.

## Failure-First Design

1. **What happens if this fails?** The submission is rejected with a structured error (field-level detail); nothing is forwarded downstream; nothing partially persists.
2. **Will it retry?** No automatic retry at this stage — validation failures are caller errors, not transient faults. The caller (human or upstream system) must resubmit corrected input.
3. **Recovery path if unresolved?** Rejected submissions are logged with full context (correlation ID, failure reason) for manual triage; no dead-letter queue needed since nothing was accepted in the first place.
4. **Explicit failure modes handled vs. not handled:** Handled — schema violations, malformed formats, oversized/empty input, duplicate resubmission. Not handled — network-level upload failures (owned by the transport/route layer), and any business-rule rejection (e.g. "this vendor is not eligible"), which is out of scope for this stage entirely.

## Verification

- Unit tests: happy path (each of the 4 input formats), failure path (each edge case above), boundary cases (empty/max-size), idempotency (duplicate submission produces no duplicate output).
- `tsc --noEmit` passes.
- No VendorIQ or scoring-related identifiers appear anywhere in this module (grep check before merge).

## Status

Directive only. Implementation (`vendorIngestionSchema.ts`, `vendorIngestionParser.ts`, `vendorIngestionService.ts`, `vendorIngestionRoutes.ts`, tests) not yet built. This is Layer 1 (SOP); Layer 3 (execution) work starts on separate approval.
