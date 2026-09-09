# STORY-005 — Flag uncertain data for manual review

As a job seeker, I want uncertain data to be flagged for manual review, so that I can make informed decisions.

**Release:** r1 · Red Flag Highlighting and Manual Review (weeks 1–2)
**Owner:** Development Team
**Blocked by:** STORY-003

## The requirement this satisfies

- **REQ-005** (Functional, must) — The system must flag uncertain data for manual review without making automated judgments.

## How to build it

Implement a system to flag uncertain data for manual review.

## Failure paths you must handle

- Uncertain data is not flagged
- Flags are not displayed
- Notification fails

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given uncertain data, when it is flagged, then I am notified for manual review.
- [ ] Given certain data, when I view it, then no flag is shown.
- [ ] Trust: Flagging actions are logged for audit purposes.

When every box above is ticked, stop and show the demo.
