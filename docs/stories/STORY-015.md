# STORY-015 — Require attestation that submitted interaction data is factual

As a recruiter relying on VendorIQ, I want every submitted interaction to carry the job seeker's attestation that it is factual, so that unattested or disputed submissions are never shown as confirmed recruiter history without a human review.

**Release:** r1 · Red Flag Highlighting and Manual Review (weeks 1–2)
**Owner:** Development Team
**Blocked by:** nothing — you can start this now

## The requirement this satisfies

- **REQ-019** (Safety, must) — The system must require job seekers to attest that submitted interaction data is factual, and must not treat unattested or disputed submissions as confirmed recruiter history without manual review.

## How to build it

Author: the student (REQ-019, safety/guardrails). Attestation is captured at submission time and stored with the submission; disputed or unattested rows must never reach the confirmed-history view without manual review.

## Failure paths you must handle


## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given a job seeker uploads recruiter interaction data, when they submit the file, then the system requires them to attest the data is factual before any row is accepted.
- [ ] Given an interaction that was never attested or is later disputed, when it exists in the system, then it is routed to manual review instead of being treated as confirmed recruiter history.
- [ ] Trust: every attestation is logged against its submission with a timestamp.

When every box above is ticked, stop and show the demo.
