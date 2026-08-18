---
name: etl-failure-triage
description: Use when the user asks why an ETL or ELT pipeline, scheduled load, SQL job, data refresh, or ingestion process failed or produced suspicious output. Reviews logs and run metadata, ranks likely causes, cites evidence, and recommends the next safe diagnostic steps.
---

# ETL Failure Triage

Diagnoses a pipeline/job failure from logs and run metadata — never by touching code or rerunning anything.

## Required inputs

- **A log, run output, or failure description** — required. If none is supplied, stop and ask for one before doing anything else.
- **Run metadata** — optional but read it when supplied (run ID, source/destination, trigger type, previous run status, table/lookup versions). It's often what distinguishes "this is new" from "this has been broken for a week."

## Procedure

1. Read the log/output/description in full before forming any opinion.
2. Read run metadata if supplied.
3. Separate **facts** (what the log/metadata literally states — timestamps, error strings, row counts, stage names) from **hypotheses** (why you think that happened). Never present a hypothesis as a fact.
4. See `references/common-failures.md` for the catalog of common ETL/ELT failure signatures — use it to recognize patterns and know what evidence each one needs, rather than guessing a cause from feel.
5. For every candidate cause, cite the specific line(s)/value(s) in the log or metadata that support it. A cause with no citable evidence does not get listed as a cause — at most it's noted as "insufficient evidence to evaluate."
6. Rank causes most-to-least likely, based on how directly the evidence points to each.
7. For each ranked cause, give one concrete next diagnostic step — something that gathers more evidence, not something that changes state.

## Output format

Return exactly these five sections:

1. **Incident Summary** — one paragraph: what failed, when, at what stage.
2. **Evidence** — the facts pulled directly from the log/metadata (quote or closely paraphrase, with line/timestamp references).
3. **Ranked Causes** — numbered, most likely first, each with its supporting evidence and confidence.
4. **Next Tests** — one concrete, non-destructive diagnostic step per ranked cause.
5. **Escalation Recommendation** — whether this needs a human now, and who/what team, based on severity and whether the cause sits inside this pipeline's own logic or in an upstream dependency.

## Rules

- Never modify pipeline code.
- Never rerun a job.
- Never claim a root cause without a specific citation from the log or metadata backing it — "probably" and "likely" are fine in the ranking; unsupported certainty is not.
- If the log doesn't contain enough information to rank causes with any confidence, say that plainly instead of forcing a ranking.
