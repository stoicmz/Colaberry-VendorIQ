---
name: data-quality-gate
description: Use when the user explicitly asks to validate a dataset, ETL output, or data file — or to confirm something is ready to publish to a dashboard/report — against a quality contract, returning PASS/WARN/FAIL with evidence and a PUBLISH/BLOCK recommendation. Do NOT use for writing or reviewing SQL, calculating a metric, or designing/building a dashboard — mentioning a dashboard or dataset is not enough; the request must ask for a quality/validation/publish-readiness check specifically.
---

# Data Quality Gate

Validates a dataset against a quality contract before it's published to a dashboard, report, or downstream system.

## When this applies

Trigger only on an explicit request to:
- validate a dataset, CSV, or ETL output
- run a data-quality check
- confirm publish-readiness ("is this ready to go live", "should I publish or block this")

Do **not** trigger on a request to write or review SQL, calculate or explain a metric, or design/build a dashboard — even if the word "dashboard," "data," or "report" appears. Those are separate tasks. If the user's request is satisfied by writing a query, a formula, or a layout, this skill does not apply.

## Required inputs

- **Dataset path** — required. If not supplied, stop and ask for it before doing anything else.
- **Quality contract path** — optional. If supplied, its rules override the defaults. If not supplied, say so explicitly and fall back to the defaults in `references/quality-checks.md`.

## Procedure

1. Read the dataset. Never modify, reorder, deduplicate, or otherwise alter the source file.
2. If a quality contract was supplied, parse its rules: uniqueness key(s), required fields, numeric bounds, freshness window, expected row count. Use these in place of defaults wherever the contract defines them.
3. Run the eight checks below. **Read `references/quality-checks.md` first** — it defines exactly what evidence each check records and what makes it PASS/WARN/FAIL. Don't improvise a check's criteria from the name alone.
   - Schema
   - Freshness
   - Expected volume
   - Key uniqueness
   - Duplicates
   - Required fields
   - Nulls
   - Numeric rules
4. For each check, record: Check name, Evidence (the actual value/count found in the data), Status (PASS/WARN/FAIL), Recommended Action.
5. Present all results as one table:

   | Check | Evidence | Status | Recommended Action |
   |---|---|---|---|

6. Roll the checks into one overall result:
   - **PASS** — every check passed.
   - **WARN** — only non-critical issues found, nothing that violates a hard contract rule.
   - **FAIL** — any hard rule is violated (uniqueness, required field, numeric rule, freshness, volume).
7. State the overall result as exactly one of: PASS, WARN, or FAIL.
8. State a recommendation: **PUBLISH** (PASS only) or **BLOCK** (WARN or FAIL, unless the user explicitly accepts the risk in writing).

## Rules

- Never modify the source dataset file — read-only, always.
- No dataset path, no validation — ask first, don't guess a path.
- No contract supplied — say so explicitly, then apply the defaults from `references/quality-checks.md`; don't invent contract-specific thresholds.
