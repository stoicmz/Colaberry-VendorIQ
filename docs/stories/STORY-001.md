# STORY-001 — Ingest recruiter interaction data from CSV/XLSX

As a job seeker, I want to upload my recruiter interaction data, so that I can see it on the dashboard.

**Release:** r0 · Initial Data Ingestion and Display (weeks 0–1)
**Owner:** Development Team
**Blocked by:** nothing — you can start this now

## The requirement this satisfies

- **REQ-001** (Functional, must) — The system must ingest recruiter interaction data from a CSV/XLSX file.

## How to build it

Implement file upload functionality and parse CSV/XLSX data for ingestion.

## Failure paths you must handle

- File format is not supported
- File is corrupted
- File contains no data

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given a CSV/XLSX file with recruiter interactions, when I upload it, then the data is ingested into the system.
- [ ] Given an invalid file format, when I attempt to upload, then I receive an error message.
- [ ] Trust: Data ingestion is logged for audit purposes.

When every box above is ticked, stop and show the demo.
