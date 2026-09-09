# backend/src/models/

Sequelize models — the contract for all database access. Raw SQL only when no model exists, and the result must be typed at the call site.

`VendorIngestionRecord.ts` (STORY-001) exports two models, backed by SQLite for now (`backend/src/config/database.ts`, dialect swappable later):
- `IngestionBatch` — one row per uploaded file, keyed by a unique `fileHash` (SHA-256) for idempotent re-uploads.
- `RecruiterInteractionRecord` — one row per validated recruiter interaction, `belongsTo` its `IngestionBatch`.

Ref: CLAUDE.md → Contract Enforcement Layer (database access).
