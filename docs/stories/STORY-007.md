# STORY-007 — Provide clear explanations of displayed data

As a job seeker, I want clear explanations of displayed data, so that I can easily interpret it.

**Release:** r2 · Enhanced Data Display and User Guidance (weeks 2–3)
**Owner:** Development Team
**Blocked by:** STORY-005

## The requirement this satisfies

- **REQ-006** (Functional, must) — The system must provide clear explanations of displayed data to job seekers.

## How to build it

Implement explanatory tooltips or sections on the dashboard.

## Failure paths you must handle

- Explanations are unclear
- Explanations are missing
- Tooltip fails to load

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given displayed data, when I view explanations, then I understand the data context.
- [ ] Given unclear data, when I view explanations, then I see a message indicating further review is needed.
- [ ] Trust: Explanation access is logged for audit purposes.

When every box above is ticked, stop and show the demo.
