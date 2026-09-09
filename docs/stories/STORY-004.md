# STORY-004 — Highlight red flags in recruiter interactions

As a job seeker, I want to see red flags in recruiter interactions, so that I can focus on potential issues.

**Release:** r1 · Red Flag Highlighting and Manual Review (weeks 1–2)
**Owner:** Development Team
**Blocked by:** STORY-003

## The requirement this satisfies

- **REQ-003** (Functional, must) — The system must highlight red flags in recruiter interactions for manual review.

## How to build it

Implement logic to identify and highlight red flags in recruiter interactions.

## Failure paths you must handle

- Red flags are not identified
- Incorrect data is flagged
- Highlighting fails

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given ingested data, when red flags are identified, then they are highlighted on the dashboard.
- [ ] Given no red flags, when I view the dashboard, then no highlights are shown.
- [ ] Trust: Red flag identification is logged for audit purposes.

When every box above is ticked, stop and show the demo.
