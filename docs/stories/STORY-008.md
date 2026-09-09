# STORY-008 — Collect user feedback during trial period

As a product manager, I want to collect user feedback during a trial period, so that I can assess system reliability.

**Release:** r3 · User Feedback and Trial Period (weeks 3–4)
**Owner:** Product Management
**Blocked by:** STORY-007

## The requirement this satisfies

- **REQ-016** (Reliability, should) — The system must provide a trial period with real users to ensure reliability.

## How to build it

Set up a feedback collection mechanism during the trial period.

## Failure paths you must handle

- Feedback is not collected
- Feedback is lost
- Report generation fails

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given a trial period, when users provide feedback, then it is collected and stored.
- [ ] Given no feedback, when the trial ends, then I see a report indicating no feedback was received.
- [ ] Trust: Feedback collection is logged for audit purposes.

When every box above is ticked, stop and show the demo.
