# STORY-000: Build the Command Center

## Summary

Build the VendorIQ Command Center: a single static site, entry point `index.html` at the repo root, that shows what the project is, what it is meant to move, and how far along it is — sourced at runtime from `.colaberry/plan.json`, `.colaberry/progress.json`, and `.colaberry/manifest.json`. This is the first artifact of the programme and the one demoed from throughout.

## Role

Not a user-facing product story — this is the project's own status instrument. No single role from `plan.derived.roles` owns it; it exists for whoever is reviewing the project (the student, the portal, a reviewer).

## Scope

Nine tabs: Overview, Outcomes, Users and use case, Guardrails, Systems, Project management, AI agents, Knowledge base, Data model. A global sample/real data toggle. A "Data as of" staleness stamp on every tab, sourced from `.colaberry/manifest.json`.

## Non-Goals

- No fabricated KPI numbers, customer names, or integration statuses.
- No proprietary VendorIQ scoring or trade-secret methodology.
- No writes to `/system` (portal-owned).

## Acceptance Criteria (Done means)

- Given the Command Center, when it is opened, then every tab is reachable and every card drills down one level.
- Given sample mode, when any tab is shown, then the sample data is visibly labelled as sample.
- Given the data files, when any tab renders, then its content comes from `.colaberry/plan.json` and `.colaberry/progress.json` read at runtime rather than from hard-coded values.
- Given `.colaberry/manifest.json`, when any tab is shown, then it displays how old the data is and warns when that age exceeds a week.
- Trust — no tab shows a number, a connection or a result the project has not actually produced.

## Build checkpoint

The build stops after the Overview tab for review before the remaining eight tabs are built. While paused, all nine tabs are reachable from the nav; the eight not yet built show a plain "not built yet" state rather than appearing locked or gated.

## Verification

Tracked in `.colaberry/progress.json` under story id `STORY-000`. Confirmed only when every criterion above is genuinely true AND a commit exists naming `STORY-000`.
