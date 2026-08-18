# Data Quality Report: orders.csv

Dataset: `skill-lab/orders.csv`
Contract: `skill-lab/quality-contract.md`
Validated: 2026-08-03
Rows checked: 12 (excluding header)

## Results

| Check | Evidence | Status | Recommended Action |
|---|---|---|---|
| Schema | Header contains `order_id, order_date, region, product, quantity, revenue, load_timestamp` — all contract-referenced fields present | PASS | None |
| Freshness (< 24h old) | `ORD-1008` has `load_timestamp = 2026-08-01T08:00:00Z` — roughly 2 days old | FAIL | Re-ingest `ORD-1008` with a current `load_timestamp`, or drop the stale row before publishing |
| Expected volume (≥ 10 rows) | 12 data rows found | PASS | None |
| Key uniqueness (`order_id`) | `order_id "ORD-1003"` appears twice (rows 4 and 13, differing only in `load_timestamp`) | FAIL | Determine which `ORD-1003` record is authoritative; remove or merge the other before publishing |
| Duplicate rows (exact) | 0 fully identical rows found | PASS | None beyond the uniqueness fix above |
| Required fields (`region`) | `ORD-1006` has a blank `region` value | FAIL | Backfill `region` for `ORD-1006` from the source system before publishing |
| Nulls (all columns) | 1 null found — `region` on `ORD-1006` (same instance as above); no other blanks detected | FAIL | Same fix as the required-fields row; no other nulls to address |
| Numeric rules (`revenue > 0`) | `ORD-1007` has `revenue = -19.99` | FAIL | Correct or remove the negative revenue value on `ORD-1007` before publishing |

## Overall Result

**FAIL** — 4 independent hard-rule violations (freshness, key uniqueness, required field, numeric rule).

## Recommendation

**BLOCK** — do not publish this dataset to the executive revenue dashboard until `ORD-1003` (duplicate), `ORD-1006` (missing region), `ORD-1007` (negative revenue), and `ORD-1008` (stale load) are resolved.
