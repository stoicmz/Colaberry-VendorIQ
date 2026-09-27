# Ownership rules for .colaberry/

Read this when compare_progress.py reports a difference. It tells you
whose change it is, and therefore which verdict applies.
Sources: docs/DATA_CONTRACT.md and CLAUDE.md. If they disagree with this
file, they win; say so in the report.

## Contents
1. plan.json
2. progress.json: the field-by-field split
3. manifest.json
4. Judging a difference (decision table)
5. Known traps

## 1. plan.json: platform-owned, unless hand-edited
- The platform replaces it wholesale when the plan is republished.
- The platform compares your copy against the hash it recorded for
  plan.json in manifest.json (`files[]`). If they differ, it assumes you
  took the file over and stops updating it.
  From then on, portal plan changes no longer arrive in the file.
- It carries no completion state: no `built` on a requirement, no
  `status` on a story. Completion lives only in progress.json.
- A hand-edited plan.json is a warning, not a STOP: it may be deliberate
  (e.g. REQ-019/STORY-015 added while waiting on the portal owner). Report
  it every time so it isn't forgotten.

## 2. progress.json: co-owned, split by field
| Field (per story)                | Owner    |
|----------------------------------|----------|
| `id`, `release`, `acceptance_total` | Platform |
| `criteria[].text`                | Platform |
| `verification` (the whole block) | Platform |
| the story list itself            | Platform |
| top-level `totals`, `project`, `schema_version` | Platform |
| `criteria[].passed`, `criteria[].evidence` | Yours |
| `files_touched`, `tests_added`, `notes` | Yours |
| `updated_at`                     | Yours in practice (the contract doesn't assign it; it's set alongside your fields) |

A sync merges rather than replaces, so your fields survive it, as long as
you don't overwrite the platform's side with a stale copy when you push.

A story in your copy but not GitHub's was added by hand. The platform
discards it, so flag it as STOP.

## 3. manifest.json: platform-owned, freshness only
`generated_at` changes on every sync; a difference there alone means
nothing. Never treat a manifest difference as a conflict.

## 4. Judging a difference
| Situation | Verdict |
|---|---|
| Only YOURS fields differ, nothing incoming | SAFE TO PUSH |
| Incoming Build Bot commit changed PLATFORM-OWNED fields; you changed only YOURS fields, or different stories | MERGE FIRST: keep GitHub's copy as the base, re-apply your fields |
| You and GitHub changed the same YOURS field on the same story | STOP: ask the user which is right |
| Your copy differs from GitHub's in a PLATFORM-OWNED field | STOP: you'd overwrite the platform |
| A story exists only in your copy | STOP: hand-added, will be discarded |
| Uncommitted .colaberry edits unrelated to the current work | STOP: don't let them ride along |
| Only manifest.json differs | ignore |
| plan.json hand-edited | warn, don't change the verdict |

## 5. Known traps
- **Stale edits from an earlier session.** During STORY-014, a
  half-finished STORY-015 edit sitting in progress.json got swept into the
  wrong commit. Uncommitted .colaberry changes are always worth naming.
- **Encoding.** These files contain em-dashes. Read them as UTF-8; the
  Windows default corrupts them.
- **A fingerprint mismatch doesn't prove a hand-edit.** The fingerprint to
  check is the plan.json entry in manifest.json's `files[]`, not the
  top-level `plan_sha256`. The platform's hashing method isn't documented,
  so report a mismatch as "the platform isn't updating it" without claiming
  why. Comparing against GitHub's copy proves nothing: once a hand-edit is
  pushed, the two are identical.
- **History, as of 2026-09-27.** The Build Bot has not written plan.json
  since it first appeared (STORY-000, 2026-08-17): none of its syncs from
  2026-09-08 onward touched it, and the file never matched the manifest
  fingerprint, even before REQ-019/STORY-015 were added by hand. The fix
  (having the platform rewrite plan.json) sits with the portal owner. When
  that lands, the check should report "matches"; if it doesn't, say so.
