# STORY-011 — Support manual data review for completeness and correctness

As a data reviewer, I want to manually review data for completeness and correctness, so that data integrity is maintained.

**Release:** r1 · Red Flag Highlighting and Manual Review (weeks 1–2)
**Owner:** Data Reviewer
**Blocked by:** STORY-003

## The requirement this satisfies

- **REQ-010** (Safety, must) — The system must support manual data review to ensure completeness and correctness.

## How to build it

Create a manual review process that allows data reviewers to check for completeness and correctness of data entries. Ensure that all actions are logged with reviewer ID and timestamp.

## Failure paths you must handle

- Incomplete data is not flagged for review.
- Corrections are not saved.
- Reviewer actions are not logged.

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given a dataset, when I review it manually, then I can identify and correct incomplete or incorrect data entries.
- [ ] Given a data entry that is flagged as incomplete, when I complete it, then the system updates the entry accordingly.
- [ ] Trust: Every manual review action is logged with the reviewer ID and timestamp.

When every box above is ticked, stop and show the demo.
