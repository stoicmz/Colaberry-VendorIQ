# backend/src/services/vendorIngestion/

Home of the `vendor_ingestion_stage` component: ingests raw vendor data (files, forms, JSON, CSV) and validates it against the expected schema before normalization. Course-safe, non-proprietary — no VendorIQ scoring or trade-secret methodology belongs here.

Planned modules (not yet implemented — foundation only):
- `vendorIngestionSchema.ts` — Zod schema / contract
- `vendorIngestionParser.ts` — format adapters (CSV, JSON, form)
- `vendorIngestionService.ts` — orchestration entry point
- `vendorIngestionService.test.ts` — unit tests

See `directives/vendor_ingestion_stage.md` for the SOP this implementation must follow.
