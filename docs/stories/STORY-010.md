# STORY-010 — Maintain a log of manual reviews for audit purposes

As a compliance officer, I want a log of manual reviews, so that I can ensure audit compliance.

**Release:** r4 · Audit and Reliability Assurance (weeks 4–5)
**Owner:** Compliance Team
**Blocked by:** STORY-009

## The requirement this satisfies

- **REQ-018** (Observability, should) — The system must maintain a log of manual reviews for audit purposes.

## How to build it

Implement a logging mechanism for manual reviews.

## Failure paths you must handle

- Logs are incomplete
- Access is unauthorized
- Log retrieval fails

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given manual reviews, when they are logged, then I can access the log for audit purposes.
- [ ] Given no reviews, when I access the log, then I see a message indicating no reviews are logged.
- [ ] Trust: Log access is restricted to authorized personnel.

When every box above is ticked, stop and show the demo.
