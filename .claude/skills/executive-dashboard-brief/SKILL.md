---
name: executive-dashboard-brief
description: Use when the user asks to turn a data-quality result, failed refresh, pipeline incident, KPI variance, or technical investigation into an executive dashboard update. Produces a concise leadership brief containing status, business impact, verified evidence, decision needed, owner, and next update time.
---

# Executive Dashboard Brief

Turns a technical data-quality or pipeline-incident report into a short, non-technical brief for leadership. It summarizes an existing investigation — it is never a substitute for one.

## Required inputs

- **A source report** — required: a data-quality report (e.g., `data-quality-report.md`), a triage/incident report (e.g., `etl-triage-report.md`), or an equivalent technical finding to summarize. If none is supplied, stop and ask for it — do not draft a brief from assumptions.

## Procedure

1. Read the supplied report(s) in full.
2. Separate what the report **states as verified** (a specific check result, a specific cited log line, a specific row/key) from what is **unresolved or unknown** (open questions, "next diagnostic step" items that haven't been run yet, anything the source report itself flagged as a hypothesis rather than fact).
3. Never invent: financial/business impact figures, a root cause not stated in the source, an owner not named in the source, or a timing/ETA not stated in the source. If the source doesn't say it, the brief says "not yet known" / "not yet assigned" / "to be determined" — it does not fill the gap with a plausible-sounding guess.
4. Strip out anything technical that a business leader doesn't need to act on: no raw log lines, no stack traces, no stage names, no SQL, no table/column internals. Translate technical findings into their business consequence instead (e.g., "a required data field was blank, breaking an automated step" rather than "KeyError in MAP_REGION_CODES").
5. Decide and state explicitly whether the dashboard/report this data feeds should remain blocked, based on the source report's own PASS/WARN/FAIL or PUBLISH/BLOCK recommendation — don't soften a BLOCK into something that sounds resolved.
6. Fill in `template.md` exactly as structured — do not add sections, do not remove sections, do not reorder them.

## Output

Return the completed brief using every section from `template.md`, in order: Status, Business Impact, What We Know, What We Do Not Know, Decision or Action Needed, Owner, Next Update.

## Rules

- Use the supplied quality/triage report(s) as the only source of fact — don't reach for outside knowledge to fill gaps.
- Every line in "What We Know" must trace back to something the source report actually said.
- "What We Do Not Know" is not optional filler — if the source report leaves anything open, it goes here, not silently dropped.
- No raw logs, stack traces, or implementation detail anywhere in the output.
- If the source data was BLOCKED/FAILED, the brief must say so plainly in Status — it does not get rounded up to "on track."
