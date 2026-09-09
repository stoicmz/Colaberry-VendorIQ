# STORY-003 — Manual verification of data accuracy and attribution

As a data reviewer, I want to manually verify data accuracy and attribution, so that data is correctly attributed to the right recruiter.

**Release:** r0 · Initial Data Ingestion and Display (weeks 0–1)
**Owner:** Data Reviewer
**Blocked by:** nothing — you can start this now

## The requirement this satisfies

- **REQ-004** (Functional, must) — The system must allow job seekers to manually verify data accuracy before displaying it.
- **REQ-007** (Safety, must) — The system must ensure data is correctly attributed to the right recruiter.

## How to build it

Implement a manual review interface that allows data reviewers to verify and correct recruiter attributions. Ensure that each correction is logged with the reviewer ID and timestamp.

## Failure paths you must handle

- Incorrect attribution is not flagged for review.
- Manual corrections are not saved.
- Reviewer ID is not logged with corrections.

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given a set of recruiter interaction data, when I manually review the data, then I can confirm the data is accurately attributed to the correct recruiter.
- [ ] Given a data entry with incorrect attribution, when I identify and correct it, then the system updates the attribution correctly.
- [ ] Trust: Every manual correction is logged with the reviewer ID and timestamp.

When every box above is ticked, stop and show the demo.
