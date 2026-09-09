# VendorIQ — Requirements

An AI-driven job-seeker protection platform that tracks recruiter and vendor behavior patterns over time.

This is the source of truth for what you are building. Your Claude Code prompts
point here. If you sharpen a requirement, edit it — your version is the real one.

| Kind | Meaning |
|---|---|
| Functional | something the system does |
| Safety | a guardrail, with a check that enforces it |
| Reliability | how it behaves when something fails |
| Constraint | a technology or vendor you must use — context, not a task |

## Audit

### REQ-018 — Observability · should

The system must maintain a log of manual reviews for audit purposes.

Fulfilled by: STORY-010

## Dashboard

### REQ-002 — Functional · must

The system must display a dashboard showing recruiter interaction history to job seekers.

Fulfilled by: STORY-002

### REQ-011 — Functional · must

The system must display message frequency and timestamps in the dashboard.

Fulfilled by: STORY-006

### REQ-012 — Functional · must

The system must show whether replies occurred in recruiter interactions.

Fulfilled by: STORY-012

### REQ-013 — Functional · must

The system must allow job seekers to see responsiveness and follow-up patterns.

Fulfilled by: STORY-013

## Data Analysis

### REQ-003 — Functional · must

The system must highlight red flags in recruiter interactions for manual review.

Fulfilled by: STORY-004

### REQ-005 — Functional · must

The system must flag uncertain data for manual review without making automated judgments.

Fulfilled by: STORY-005

### REQ-015 — Constraint

The system must not score or judge recruiter behavior automatically.

Context for the stories that use it — constraints do not get their own story.

## Data Ingestion

### REQ-001 — Functional · must

The system must ingest recruiter interaction data from a CSV/XLSX file.

Fulfilled by: STORY-001

### REQ-009 — Constraint

The system must not integrate with Gmail, Outlook, LinkedIn, Slack, CRM systems, or ATS systems.

Context for the stories that use it — constraints do not get their own story.

## Data Verification

### REQ-004 — Functional · must

The system must allow job seekers to manually verify data accuracy before displaying it.

Fulfilled by: STORY-003

### REQ-007 — Safety · must

The system must ensure data is correctly attributed to the right recruiter.

Fulfilled by: STORY-003

### REQ-010 — Safety · must

The system must support manual data review to ensure completeness and correctness.

Fulfilled by: STORY-011

### REQ-014 — Safety · must

The system must ensure data is clean before ingestion.

Fulfilled by: STORY-014

## User Feedback

### REQ-016 — Reliability · should

The system must provide a trial period with real users to ensure reliability.

Fulfilled by: STORY-008

### REQ-017 — Reliability · should

The system must gather positive user feedback to confirm reliability and ease of use.

Fulfilled by: STORY-009

## User Guidance

### REQ-006 — Functional · must

The system must provide clear explanations of displayed data to job seekers.

Fulfilled by: STORY-007

## User Interface

### REQ-008 — Non-functional · must

Every screen the job seeker uses must complete its primary action in three clicks or fewer.

Fulfilled by: STORY-002
