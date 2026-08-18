# Common ETL/ELT Failure Patterns

Reference catalog for `etl-failure-triage`. Match log/metadata evidence against these patterns before ranking causes. If a failure doesn't fit any pattern here, say so explicitly rather than forcing it into one.

## Schema mismatch

**Signature:** validation/schema stage logs a type mismatch, missing column, unexpected null in a required column, or renamed field.
**Evidence to look for:** the specific column name, the row/key affected, expected vs. actual value or type.
**Common root causes:** upstream source changed its export format; a required field wasn't populated at the source; a column was renamed without updating the pipeline's expected schema.
**Next diagnostic step:** compare the current source file's header/row against the last known-good run's schema; check the source system's own change log for the affected column.

## Type conversion / mapping failure

**Signature:** a transform/mapping stage throws a cast error, `KeyError`/lookup-miss, or similar exception on a specific value.
**Evidence to look for:** the exact value that failed to convert/map, the lookup table or type it was being converted against, which row/key it belongs to.
**Common root causes:** the value is null/blank and the mapping table has no entry for null; the value is a legitimate new category not yet in a static lookup table; a type-coercion assumption (e.g., string→decimal) doesn't hold for this value.
**Next diagnostic step:** check whether the failing value is genuinely blank/malformed in the source vs. simply missing from the lookup table; check the lookup table's last-updated date against the source's known categories.

## Retry exhaustion

**Signature:** the same stage fails identically across multiple retry attempts, then the job aborts after exhausting its retry budget.
**Evidence to look for:** whether the error message is identical across retries (deterministic — data/logic problem) or varies (transient — infra/network problem).
**Common root causes:** identical errors across retries almost always mean a data or logic problem retries cannot fix (the same bad row fails every time); varying errors suggest a genuinely transient upstream issue.
**Next diagnostic step:** if identical across retries, treat the underlying cause (schema/mapping/etc.) as the real issue, not the retry mechanism; if it varies, check upstream service health/status during the run window.

## Stale reference/lookup data

**Signature:** a mapping/enrichment stage fails or produces unexpected output, and the reference/lookup table's last-updated timestamp significantly predates the run.
**Evidence to look for:** lookup table version/last-updated date vs. run date; whether the failing value is plausibly a legitimately new category.
**Common root causes:** a new valid category (region, product code, currency, etc.) was introduced at the source but the static lookup table wasn't refreshed.
**Next diagnostic step:** check whether the failing value is a recognized new category at the source system, and whether the lookup table has a documented refresh cadence that was missed.

## Upstream source unavailable / connectivity

**Signature:** extract stage times out, connection refused/reset, or a partial/empty read before any transform stage runs.
**Evidence to look for:** timestamps around the failure, network/connection error text, whether any rows were read at all.
**Common root causes:** source system outage, network/firewall change, credential expiry blocking the connection (distinct from an auth-specific error — see below).
**Next diagnostic step:** check the source system's own status/health during the run window; check for recent network or firewall changes.

## Permission / auth failure

**Signature:** explicit 401/403, "access denied," or credential/token error, typically very early in the run.
**Evidence to look for:** the specific service/endpoint that rejected the credential, and whether the error is new (credential expired/rotated) or has existed across multiple runs.
**Common root causes:** expired or rotated credential/token not updated in the pipeline's config; a permission change on the source or destination system.
**Next diagnostic step:** check credential/token expiry and rotation history; confirm with the system owner whether permissions changed recently. Do not attempt to rotate or update credentials as part of triage.

## Volume anomaly

**Signature:** row count read/loaded is far outside the historical normal range (much higher or lower), even if no hard error was thrown.
**Evidence to look for:** this run's row count vs. recent run history from metadata.
**Common root causes:** partial source file/export; an upstream filter or date-range parameter changed; a genuine business spike/drop.
**Next diagnostic step:** compare against the last several runs' row counts; check whether the source export job itself completed fully before this pipeline ran.

## Duplicate / key collision

**Signature:** a uniqueness/dedup check logs a repeated key; the job may continue (warning) or halt (error) depending on configuration.
**Evidence to look for:** the specific duplicated key, and whether it was treated as fatal or just logged.
**Common root causes:** a late-arriving or re-sent record from the source; an upstream retry that re-emitted the same record; a genuine data-entry duplicate.
**Next diagnostic step:** check the source system for whether the record was intentionally resent; compare the duplicate rows' other fields to see if they're identical (simple resend) or conflicting (real data problem).

## Timeout / long-running stage

**Signature:** a stage runs far longer than its historical average before failing or being killed.
**Evidence to look for:** stage duration this run vs. historical average from metadata; any resource/memory warnings logged before the timeout.
**Common root causes:** unusually large input volume; a downstream dependency (database, API) responding slowly; a resource constraint (memory/CPU) on the run environment.
**Next diagnostic step:** compare input volume and stage duration against recent runs; check the downstream dependency's own performance/health during the run window.
