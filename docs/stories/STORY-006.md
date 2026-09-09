# STORY-006 — Display message frequency and timestamps

As a job seeker, I want to see message frequency and timestamps, so that I can understand communication patterns.

**Release:** r2 · Enhanced Data Display and User Guidance (weeks 2–3)
**Owner:** Development Team
**Blocked by:** STORY-005

## The requirement this satisfies

- **REQ-011** (Functional, must) — The system must display message frequency and timestamps in the dashboard.

## How to build it

Enhance the dashboard to display message frequency and timestamps.

## Failure paths you must handle

- Frequency data is incorrect
- Timestamps are missing
- Display fails

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given ingested data, when I view the dashboard, then I see message frequency and timestamps.
- [ ] Given missing data, when I view the dashboard, then I see a message indicating incomplete data.
- [ ] Trust: Display actions are logged for audit purposes.

When every box above is ticked, stop and show the demo.
