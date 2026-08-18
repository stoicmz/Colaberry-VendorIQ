# Quality Checks Reference

Full definition, evidence format, and PASS/WARN/FAIL logic for each check `data-quality-gate` runs. Read this before executing step 3 of `SKILL.md`'s procedure — don't infer a check's criteria from its name alone.

## Schema

**Definition:** column names (and types, if declared) match what's expected — from the quality contract if one is supplied, otherwise inferred from the file's header row.
**Evidence:** the actual header/columns found vs. expected.
**Status:** FAIL if a contract-required column is missing or renamed; PASS otherwise.

## Freshness

**Definition:** the most recent load/ingestion timestamp column is within the contract's required window (e.g., "< 24 hours old").
**Evidence:** the actual max/most-recent timestamp value found, and how old it is relative to validation time.
**Status:** FAIL if any timestamp exceeds the window; PASS otherwise. If the contract states no freshness rule, skip this check and say explicitly that it wasn't evaluated — never silently mark it PASS.

## Expected volume

**Definition:** total row count meets the contract's stated minimum.
**Evidence:** actual row count vs. required minimum.
**Status:** FAIL if under the minimum; WARN if no contract minimum exists but the row count looks implausibly low for the data type; PASS otherwise.

## Key uniqueness

**Definition:** the designated key column(s) (e.g., `order_id`) contain no duplicate values.
**Evidence:** the duplicated key value(s) and how many times each appears.
**Status:** FAIL on any duplicate key; PASS otherwise.

## Duplicates

**Definition:** no two rows are identical across every column. This is distinct from key uniqueness — a duplicate key with differing other fields is a uniqueness violation, not necessarily a full duplicate row.
**Evidence:** count of fully identical rows, if any.
**Status:** FAIL on any exact duplicate row; PASS otherwise.

## Required fields

**Definition:** fields the contract marks required contain no blank/empty/null values.
**Evidence:** which row(s)/key(s) have a blank in a required field.
**Status:** FAIL on any blank in a required field; PASS otherwise.

## Nulls

**Definition:** a broader null/empty scan across all columns, not just contract-required ones — surfaces unexpected gaps even in fields the contract doesn't explicitly require.
**Evidence:** null count per column.
**Status:** WARN if nulls appear only in non-required, non-critical fields. If a null overlaps a required-field violation already caught above, report it once and cross-reference rather than double-counting it as a separate issue.

## Numeric rules

**Definition:** numeric columns respect contract-stated bounds (e.g., "revenue > 0").
**Evidence:** the specific row(s)/key(s) and value(s) that violate the bound.
**Status:** FAIL on any violation; PASS otherwise.

## Notes that apply to all checks

- Evidence must always be a concrete value — a count, a key, a timestamp — never a vague claim like "looks fine" or "some issues found."
- When no quality contract is supplied, checks that need a contract-defined threshold (freshness window, numeric bounds, required-field list) cannot be run with authority. Say so explicitly rather than inventing a threshold.
