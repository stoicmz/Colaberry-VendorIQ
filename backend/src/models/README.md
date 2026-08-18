# backend/src/models/

Sequelize models — the contract for all database access. Raw SQL only when no model exists, and the result must be typed at the call site.

`VendorIngestionRecord.ts` may live here if the ingestion stage persists validated records — deferred until that's confirmed.

Ref: CLAUDE.md → Contract Enforcement Layer (database access).
