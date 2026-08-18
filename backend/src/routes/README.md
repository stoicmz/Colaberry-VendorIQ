# backend/src/routes/

Express route definitions (admin, portal, public). Every route validates request body/query/params with Zod (or equivalent) and rejects malformed input with 400 before business logic runs.

`vendorIngestionRoutes.ts` is planned here for the ingestion stage's HTTP entry point — not yet created (foundation only; trigger mechanism, HTTP vs script, still to be confirmed).

Ref: CLAUDE.md → Contract Enforcement Layer (inbound HTTP routes).
