# VendorIQ — Stories

14 stories across 5 releases, walking-skeleton first:
the earliest release proves the thinnest end-to-end path including the trust
spine, and later releases stack features on top of something already working.

## Before the releases — start here

- **[STORY-000](stories/STORY-000.md)** — Build your Command Center

The first thing you build, on day one, before any part of the system itself. It is
the page you keep open for the rest of the programme and demo from. It belongs to no
release and fulfils none of your requirements, because it is the window onto your
system rather than a part of it.

## r0 · Initial Data Ingestion and Display — weeks 0–1

**Goal:** Establish basic data ingestion and display capabilities with manual verification.
**Done when you can show:** Show ingestion of CSV/XLSX data and display on dashboard with manual verification process.

- **[STORY-001](stories/STORY-001.md)** — Ingest recruiter interaction data from CSV/XLSX
- **[STORY-002](stories/STORY-002.md)** — Display recruiter interaction history on dashboard
- **[STORY-003](stories/STORY-003.md)** — Manual verification of data accuracy and attribution
- **[STORY-014](stories/STORY-014.md)** — Ensure data is clean before ingestion

## r1 · Red Flag Highlighting and Manual Review — weeks 1–2

**Goal:** Introduce red flag highlighting and manual review capabilities.
**Done when you can show:** Demonstrate red flag identification and manual review process on dashboard.

- **[STORY-004](stories/STORY-004.md)** — Highlight red flags in recruiter interactions _(waits on STORY-003)_
- **[STORY-005](stories/STORY-005.md)** — Flag uncertain data for manual review _(waits on STORY-003)_
- **[STORY-011](stories/STORY-011.md)** — Support manual data review for completeness and correctness _(waits on STORY-003)_

## r2 · Enhanced Data Display and User Guidance — weeks 2–3

**Goal:** Enhance data display with message frequency, timestamps, and user guidance.
**Done when you can show:** Show enhanced dashboard with message frequency, timestamps, and explanations.

- **[STORY-006](stories/STORY-006.md)** — Display message frequency and timestamps _(waits on STORY-005)_
- **[STORY-007](stories/STORY-007.md)** — Provide clear explanations of displayed data _(waits on STORY-005)_
- **[STORY-012](stories/STORY-012.md)** — Display recruiter interaction reply status _(waits on STORY-006)_
- **[STORY-013](stories/STORY-013.md)** — Show job seekers recruiter responsiveness and follow-up patterns _(waits on STORY-012)_

## r3 · User Feedback and Trial Period — weeks 3–4

**Goal:** Implement user feedback mechanisms and conduct a trial period.
**Done when you can show:** Present user feedback collection and trial period results.

- **[STORY-008](stories/STORY-008.md)** — Collect user feedback during trial period _(waits on STORY-007)_
- **[STORY-009](stories/STORY-009.md)** — Ensure positive user feedback confirms reliability _(waits on STORY-008)_

## r4 · Audit and Reliability Assurance — weeks 4–5

**Goal:** Ensure audit capabilities and reliability assurance through logs and feedback.
**Done when you can show:** Show audit log functionality and reliability assurance through user feedback.

- **[STORY-010](stories/STORY-010.md)** — Maintain a log of manual reviews for audit purposes _(waits on STORY-009)_
