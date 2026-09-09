# STORY-002 — Display recruiter interaction history on dashboard

As a job seeker, I want to view my interaction history with recruiters, so that I can track my job application progress.

**Release:** r0 · Initial Data Ingestion and Display (weeks 0–1)
**Owner:** Frontend Developer
**Blocked by:** nothing — you can start this now

## The requirement this satisfies

- **REQ-002** (Functional, must) — The system must display a dashboard showing recruiter interaction history to job seekers.
- **REQ-008** (Non-functional, must) — Every screen the job seeker uses must complete its primary action in three clicks or fewer.

## How to build it

Implement a dashboard view that lists recruiter interactions with a clickable link to view details. Ensure navigation from dashboard to detail view is within three clicks.

## Failure paths you must handle

- Dashboard fails to load interactions.
- Interaction details take more than three clicks to access.
- Interaction details fail to load.

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given a job seeker is logged in, when they navigate to the dashboard, then they see a list of recruiter interactions.
- [ ] Given a job seeker clicks on a recruiter interaction, when they view the details, then it loads within three clicks.
- [ ] Trust: Every interaction detail view is logged with a timestamp.

When every box above is ticked, stop and show the demo.
