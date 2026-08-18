# ETL Triage Report: orders_ingest_pipeline

Sources reviewed: `skill-lab/orders-pipeline-failure.log`, `skill-lab/pipeline-run-metadata.md`
No pipeline code changed. No job rerun.

## 1. Incident Summary

`orders_ingest_pipeline` run `RUN-20260803-0217` (scheduled, 2026-08-03 02:10 UTC) failed at the `MAP_REGION_CODES` stage. The stage threw the same `KeyError` on three consecutive retries and the run aborted after exhausting its retry budget (3/3), loading 0 rows. The previous scheduled run (2026-08-02) succeeded with 11 rows loaded.

## 2. Evidence

- `VALIDATE_SCHEMA` logged a WARN: "Null value in required column 'region' at row 6 (order_id=ORD-1006)" — non-blocking, run proceeded.
- `VALIDATE_SCHEMA` also logged a WARN: "Duplicate key detected in 'order_id': ORD-1003 (rows 3, 12)" — also non-blocking.
- `MAP_REGION_CODES` loaded `region_lookup_v3` (6 entries, `last_updated=2026-07-20` — 14 days before this run) and mapped 5/12 rows before failing.
- `MAP_REGION_CODES` then logged: "KeyError: region value '' not found in region_lookup_v3 (row 6, order_id=ORD-1006)" — identical error text on the initial failure and on retries 1/3, 2/3, and 3/3.
- Final line: "RUN_STATUS=FAILED | Failed stage: MAP_REGION_CODES | Rows processed: 5/12 | Rows loaded: 0."
- Run metadata confirms: the prior run (2026-08-02) succeeded with 0 warnings and 11 rows loaded — this is a regression, not a chronic issue.

## 3. Ranked Causes

1. **Blank `region` value on `ORD-1006` breaks the region-code lookup (high confidence).**
   Evidence: the exact row and key that failed (`row 6, order_id=ORD-1006`) match exactly between the `VALIDATE_SCHEMA` null-region warning and the `MAP_REGION_CODES` `KeyError`. The error is identical across all 3 retries, which per the retry-exhaustion pattern means it's a deterministic data problem, not a transient one — retrying an empty string against the lookup table will never succeed. This is the direct, cited cause of the failure.

2. **`region_lookup_v3` has no entry for a blank/null key (contributing factor, high confidence).**
   Evidence: the lookup table is 6 entries and the error is specifically "not found in region_lookup_v3." Whether or not the source data should have been blank in the first place, the mapping stage has no defined behavior for a missing region — it should route this to a dead-letter/skip path rather than crash the whole run. This is a resilience gap in the mapping stage, distinct from cause #1's data-quality origin.

3. **Duplicate `order_id` (`ORD-1003`) — not the cause of this failure (ruled out, noted for follow-up).**
   Evidence: this was logged only as a WARN and did not block progression past `VALIDATE_SCHEMA`; the failure occurred later, at `MAP_REGION_CODES`, on a different row (`ORD-1006`). Listed here because it's real evidence in the log, but there's nothing connecting it to the actual crash — flagged as a separate data-quality issue, not a ranked cause of this incident.

4. **Stale lookup table as root cause — insufficient evidence.**
   The lookup table is 14 days old, which is worth noting, but the failing value is an *empty string*, not a plausible new region code that simply hasn't been added yet. Nothing in the log or metadata supports "a new region was introduced and the table wasn't updated." Not ranked as a likely cause — noted only because the pattern superficially resembles stale-reference-data failures.

## 4. Next Tests

- For cause #1: pull the raw source record for `ORD-1006` from the vendor SFTP drop (not the pipeline's staged copy) to confirm whether `region` is genuinely blank at the source, or whether it was dropped during extract. This determines whether the fix belongs upstream (vendor) or in this pipeline's extract stage.
- For cause #2: review the `MAP_REGION_CODES` stage's error-handling logic (read-only review, no code changes) to confirm it has no null/blank-key handling path — this is what turns one bad row into a total run failure.
- For cause #3 (duplicate key, separate issue): check the source system for whether `ORD-1003` was intentionally resent, and diff the two instances' fields (already visually identical in the log's row reference — quantity, revenue, product all match; only `load_timestamp` differs) to confirm it's a simple resend rather than conflicting data.
- To rule out cause #4 definitively: confirm with the source/vendor system whether any new region codes were introduced in the last 14 days; if none were, this closes out the stale-lookup-table hypothesis.

## 5. Escalation Recommendation

Escalate to the data engineering on-call (per `pipeline-run-metadata.md` routing) now, not urgent-overnight-page severity: the failure is fully explained by cited evidence (blank `region` on one row breaking a lookup with no null-handling path), it's a regression from a previously clean run, and it blocked the entire load (0 rows landed) rather than degrading partially. Two separate fixes are implied and should be tracked separately: (a) a source-data question for the vendor/upstream owner (why is `ORD-1006`'s region blank), and (b) a pipeline resilience gap for the data engineering team (the mapping stage should not fail the entire run on one bad key).
