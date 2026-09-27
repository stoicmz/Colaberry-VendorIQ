# STORY-015 — Require attestation that submitted interaction data is factual

As a job seeker, I want to attest that the recruiter interaction data I submit is
factual, so that VendorIQ's tracked history of a recruiter cannot be poisoned by a
fabricated claim.

**Release:** r0 · Initial Data Ingestion and Display (weeks 0–1)
**Owner:** Development Team
**Blocked by:** STORY-001 — extends the existing CSV/XLSX upload flow rather than
replacing it

## Where this came from

Not part of the original plan. Surfaced while building STORY-003: every existing
SAFE requirement (REQ-007, REQ-010, REQ-014) protects the job seeker from bad data.
None of them protect the recruiter from a fabricated submission — and the system's
whole value ("tracks recruiter and vendor behavior patterns over time") depends on
entries not being weaponizable by either side. See `docs/REQUIREMENTS.md` → REQ-019
for the full context this was raised under.

## The requirement this satisfies

- **REQ-019** (Safety, must) — The system must require job seekers to attest that
  submitted interaction data is factual, and must not treat unattested or disputed
  submissions as confirmed recruiter history without manual review.

## How to build it

Extend the upload flow from STORY-001 to require an explicit attestation (e.g. a
required checkbox or confirmation field) before any row is accepted — the file
being well-formed is not the same as its contents being true. Per REQ-005/REQ-015,
this cannot be an automated truth-check: the system does not get to decide what is
factual. Any interaction later disputed, or submitted without attestation, routes
into the existing manual-review path (STORY-003/STORY-005/STORY-011) rather than
being auto-resolved or silently kept as confirmed history.

## Failure paths you must handle

- A submission is accepted without attestation.
- A disputed entry is left standing as confirmed recruiter history instead of being
  routed to manual review.
- An attestation is not logged against the submission it belongs to.

## Acceptance — your stop condition

- [ ] Given a job seeker uploads recruiter interaction data, when they submit the
      file, then the system requires them to attest the data is factual before any
      row is accepted.
- [ ] Given an interaction that was never attested or is later disputed, when it
      exists in the system, then it is routed to manual review instead of being
      treated as confirmed recruiter history.
- [ ] Trust: Every attestation is logged against its submission with a timestamp.

When every box above is ticked, stop and show the demo.
