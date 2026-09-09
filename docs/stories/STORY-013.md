# STORY-013 — Show job seekers recruiter responsiveness and follow-up patterns

As a job seeker, I want to see recruiter responsiveness and follow-up patterns, so that I can make informed decisions about my job applications.

**Release:** r2 · Enhanced Data Display and User Guidance (weeks 2–3)
**Owner:** Job Seeker
**Blocked by:** STORY-012

## The requirement this satisfies

- **REQ-013** (Functional, must) — The system must allow job seekers to see responsiveness and follow-up patterns.

## How to build it

Implement a display feature that shows responsiveness and follow-up patterns for recruiters. Ensure that each view is logged with user ID and timestamp.

## Failure paths you must handle

- Patterns are not displayed.
- Incorrect patterns are shown.
- User views are not logged.

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given a recruiter's interaction history, when I view it, then I can see patterns of responsiveness and follow-up.
- [ ] Given a recruiter with no follow-up, when I view their history, then it clearly indicates lack of follow-up.
- [ ] Trust: Every pattern view logs the user ID and timestamp.

When every box above is ticked, stop and show the demo.
