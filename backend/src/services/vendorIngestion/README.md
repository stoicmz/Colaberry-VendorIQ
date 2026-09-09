# backend/src/services/vendorIngestion/

Home of the `vendor_ingestion_stage` component: ingests raw vendor data (files, forms, JSON, CSV) and validates it against the expected schema before normalization. Course-safe, non-proprietary — no VendorIQ scoring or trade-secret methodology belongs here.

Modules (STORY-001):
- `vendorIngestionSchema.ts` — Zod schema / contract
- `vendorIngestionRowValidator.ts` — header normalization + per-row schema validation
- `vendorIngestionCsvParser.ts` / `vendorIngestionXlsxParser.ts` — format adapters (CSV, XLSX)
- `vendorIngestionService.ts` — orchestration entry point: hashes the file for idempotency, parses, persists via `../../models/VendorIngestionRecord.ts`
- Matching `*.test.ts` for each of the above

Not yet built: JSON/form-payload adapters (only file upload is implemented), audit logging.

See `directives/vendor_ingestion_stage.md` for the SOP this implementation follows.
