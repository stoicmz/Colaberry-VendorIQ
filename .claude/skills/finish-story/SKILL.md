---
name: finish-story
description: Closes out a VendorIQ story the way the Colaberry platform
  requires. Checks each acceptance criterion in docs/stories/STORY-nnn.md
  against real evidence (running the tests), records the honest result in
  .colaberry/progress.json (passed flags, files_touched, tests_added, notes)
  for that story only, then commits with a "Story: STORY-nnn" trailer, checks
  for Colaberry Build Bot sync commits, and pushes. Reports partly finished
  stories as partly finished, and flags a story that's missing from
  progress.json. Use this whenever the user says a story is done, asks to
  wrap up, close out, mark complete, or verify STORY-nnn, or asks to update
  progress.json or commit finished story work, even if they only say "I
  think we're done with this one."
---

# Finish a VendorIQ story

The Colaberry platform counts a story as done only when two things are true:
its criteria are marked in `.colaberry/progress.json`, AND a pushed commit
names it with a `Story: STORY-nnn` trailer. Missing either half leaves the
story unverified. Your job is to make both halves true, and honest.

## 1. Find the story and its criteria
- Identify the story ID (ask if the user didn't name one).
- Read `docs/stories/STORY-nnn.md`: the acceptance criteria are the checkbox
  list under "Acceptance — your stop condition".
- Find the same story in `.colaberry/progress.json` (`stories[]`, match on `id`).
- If the story is NOT in progress.json, stop and tell the user. The platform
  owns that list and discards entries it didn't create, so adding one by hand
  achieves nothing. The fix is to have it added in the Colaberry portal.

## 2. Check each criterion against real evidence
- Run the tests (`npm test` in `backend/`). Read the output; don't assume.
- For each criterion, decide pass/fail from what you can actually point to:
  a passing test, working code, a log entry. "The code looks right" is not
  evidence.
- CLAUDE.md also requires tests for the happy path AND at least one failure
  path. If a failure path isn't tested, say so.
- Show the user a table: criterion → pass/fail → evidence. Get their OK
  before writing anything.

## 3. Update progress.json, this story only
The file is shared: the platform owns the story list, criteria text and
`verification` block; you own only these fields on this one story:
- `criteria[].passed`: true only where step 2 found evidence
- `files_touched`, `tests_added`: real repo paths
- `notes`: one or two sentences on what was built and any design choice
- `updated_at`: now, in ISO format

Never change criterion text, add criteria, or edit `verification` or
`totals`. A partly finished story is a normal, expected state; leave
unproven criteria `false`. Read and write the JSON as UTF-8: the file
contains em-dashes that Windows' default encoding corrupts.

## 4. Commit
- Stage only this story's files plus `.colaberry/progress.json`. Never
  `git add .` or `git add -A`.
- Before staging progress.json, run `git diff .colaberry/progress.json`. If it
  holds edits to OTHER stories left from an earlier session, don't sweep them
  in; tell the user and isolate this story's changes.
- Message format (matching past commits):

      STORY-nnn: <short summary of what was built>

      <2–4 lines: what it does and any notable decision>

      Story: STORY-nnn

## 5. Check for platform sync, then push
- `git fetch origin`, then compare with `origin/main`.
- If a "Colaberry Build Bot" commit (`chore(colaberry): sync build plan`)
  landed, merge it before pushing. For progress.json, keep the platform's
  version as the base and re-apply only this story's fields from step 3.
- Push, then confirm `git status` shows main in sync with origin/main.

## 6. Report back
Tell the user: which criteria passed and which didn't (with why), the commit
hash, and that it's pushed. If anything is still false, say plainly that the
story is partly done and what's left.
