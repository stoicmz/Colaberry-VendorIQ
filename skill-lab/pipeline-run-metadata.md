# Pipeline Run Metadata

| Field | Value |
|---|---|
| Pipeline | `orders_ingest_pipeline` |
| Run ID | `RUN-20260803-0217` |
| Trigger | Scheduled (cron, daily 02:10 UTC) |
| Source | `skill-lab/orders.csv` (vendor extract, SFTP drop) |
| Destination | `warehouse.orders_fact` |
| Start time | 2026-08-03T02:10:04Z |
| End time | 2026-08-03T02:13:37Z |
| Status | **FAILED** |
| Failed stage | `MAP_REGION_CODES` |
| Retry attempts | 3 of 3 (all failed with the identical error) |
| Rows read | 12 |
| Rows validated | 12 (2 warnings: null `region` at row 6, duplicate `order_id` at rows 3 & 12) |
| Rows mapped before failure | 5 |
| Rows loaded | 0 |
| Region lookup table | `region_lookup_v3`, 6 entries, last updated 2026-07-20 (14 days before this run) |
| Previous run (2026-08-02 02:10 UTC) | SUCCESS — 11 rows loaded, 0 warnings |
| On-call routing | data-eng-oncall (per Cory briefing routing) |
| Related contract | `skill-lab/quality-contract.md` (`region` marked required) |
