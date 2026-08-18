**Status:** BLOCKED — the orders dataset failed data-quality validation and the source pipeline run failed. Not safe to publish to the executive revenue dashboard.

**Business Impact:** The executive revenue dashboard will not reflect current order data until this is resolved. Publishing now would risk showing a duplicated order, a missing region breakdown, and a negative revenue value to leadership. No dollar-value impact has been quantified in the underlying reports.

**What We Know:**
- The orders dataset failed data-quality validation on 4 of 8 checks: a duplicate order ID, a missing region value, a negative revenue value, and a data load older than the required freshness window — each tied to a specific record (`data-quality-report.md`).
- The scheduled pipeline run for this dataset also failed: a blank region value on one order record broke an automated region-lookup step, and three automatic retries failed with the identical error, confirming this is a data problem rather than a temporary system glitch (`etl-triage-report.md`).
- The previous scheduled pipeline run completed successfully with no warnings — this is a new issue, not a recurring one.

**What We Do Not Know:**
- Whether the missing region value originated at the source vendor system or was lost during extraction into the pipeline.
- Whether the pipeline's region-lookup step can be changed to skip one bad record instead of failing the entire run.
- Whether the duplicate order ID and the negative revenue value share a root cause with the region issue, or are separate data problems.

**Decision or Action Needed:** Confirm the dashboard stays blocked from publishing until the data team resolves the missing region value and the dataset re-passes validation. No action is required from leadership beyond that confirmation at this time.

**Owner:** Data engineering on-call (per pipeline run-metadata routing). No individual has been named in the source reports.

**Next Update:** To be determined — no resolution time has been provided in the source reports.
