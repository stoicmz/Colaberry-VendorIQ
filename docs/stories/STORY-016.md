# STORY-016 — Route attribution corrections through the job seeker

As a data reviewer, I want attribution errors I find to go back to the job seeker for correction, so that the person who verifies the data is never the person who changes it.

**Release:** r2 · Enhanced Data Display and User Guidance (weeks 2–3)
**Owner:** Development Team
**Blocked by:** STORY-011

## The requirement this satisfies

- **REQ-004** (Functional, must) — The system must allow data reviewers to manually verify data accuracy before it is displayed to job seekers.
- **REQ-007** (Safety, must) — The system must ensure data is correctly attributed to the right recruiter.

## How to build it

Build the request-and-response workflow on top of the correction workflow from STORY-011. The reviewer raises a request with a reason and has no path to edit the attribution directly. The job seeker answers with a correction, a confirmation, or an unavailable, each carrying a reason. A correction is stored as a new attested version with the original kept, never as an overwrite.

## Failure paths you must handle


## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given an interaction with incorrect attribution, when I identify it during review, then I can request a correction from the job seeker with a reason, and I cannot change the attribution myself.
- [ ] Given an attribution correction request, when the job seeker responds, by correcting the recruiter name or company, confirming the original is correct, or stating the information is unavailable, with a reason in each case, then the system records the response (any correction as a new attested version, with the original kept) and returns the interaction for review.
- [ ] Trust: Every request, response and review decision is logged with the actor's ID and timestamp.

When every box above is ticked, stop and show the demo.
