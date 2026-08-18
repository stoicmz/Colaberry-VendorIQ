# data-quality-gate — Trigger Tests

Manual test prompts for verifying the skill's description triggers reliably on the right requests and stays silent on adjacent-but-different requests.

## Should trigger the skill

1. "Before this feeds the executive dashboard, can you validate `skill-lab/orders.csv` against `skill-lab/quality-contract.md`?"
2. "Run a data-quality check on the latest ETL output before we publish it — is it PASS or FAIL?"
3. "Is this dataset ready to go live? Check it against our quality contract and tell me PUBLISH or BLOCK."

## Should NOT trigger the skill

1. "Write a SQL query to get total revenue by region for last month." — SQL authoring, not validation.
2. "Design a dashboard layout showing revenue trends and top vendors." — dashboard design, not a quality check, even though it mentions "dashboard."
3. "How do I calculate month-over-month growth rate from this revenue table?" — metric calculation/explanation, not dataset validation.

## Expected output requirements

**When the skill correctly triggers (prompts 1-3 above):**
- A dataset path is confirmed or requested before any check runs.
- If a quality contract is supplied, its rules are used; if not, the response says so explicitly before falling back to defaults.
- The response never modifies the source data file.
- Output includes one table with exactly these columns: `Check | Evidence | Status | Recommended Action`, covering all 8 checks (schema, freshness, expected volume, key uniqueness, duplicates, required fields, nulls, numeric rules).
- Every "Evidence" cell is a concrete value (a count, a key, a timestamp) — not a vague claim.
- The response ends with exactly one overall result: `PASS`, `WARN`, or `FAIL`.
- The response ends with exactly one recommendation: `PUBLISH` or `BLOCK`.

**When the skill correctly does NOT trigger (prompts 1-3 above):**
- No PASS/WARN/FAIL verdict appears.
- No PUBLISH/BLOCK recommendation appears.
- No Check/Evidence/Status/Recommended Action table appears.
- The response directly answers what was asked (the SQL query, the dashboard layout, the metric formula) without first running or referencing a data-quality validation procedure.
