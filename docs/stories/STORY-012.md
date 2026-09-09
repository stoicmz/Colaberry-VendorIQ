# STORY-012 — Display recruiter interaction reply status

As a job seeker, I want to see whether replies occurred in recruiter interactions, so that I can assess recruiter engagement.

**Release:** r2 · Enhanced Data Display and User Guidance (weeks 2–3)
**Owner:** Job Seeker
**Blocked by:** STORY-006

## The requirement this satisfies

- **REQ-012** (Functional, must) — The system must show whether replies occurred in recruiter interactions.

## How to build it

Enhance the interaction display to show reply status for each recruiter interaction. Ensure that each view is logged with user ID and timestamp.

## Failure paths you must handle

- Reply status is not displayed.
- Incorrect reply status is shown.
- User views are not logged.

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given a recruiter interaction, when I view the interaction details, then I can see whether a reply occurred.
- [ ] Given an interaction without a reply, when I view the details, then it clearly indicates no reply was made.
- [ ] Trust: Every interaction view logs the user ID and timestamp.

When every box above is ticked, stop and show the demo.
