---
name: platform-sync-check
description: Read-only pre-push safety check for VendorIQ. Fetches GitHub,
  lists any Colaberry Build Bot sync commits you don't have yet, compares your
  local .colaberry/progress.json and plan.json against GitHub's copies, and
  reports conflicts with a clear SAFE TO PUSH / MERGE FIRST / STOP verdict.
  Never edits, commits, or pushes. Use before any push, or whenever the user
  asks "is it safe to push", "did the platform sync", "check for Colaberry
  updates", or mentions the Build Bot, even if they don't say "sync".
argument-hint: "[optional: branch, default main]"
disallowed-tools: Edit, Write, NotebookEdit
allowed-tools: Bash(git fetch *) Bash(git status *) Bash(git log *) Bash(git diff *) Bash(git show *) Bash(python ${CLAUDE_SKILL_DIR}/scripts/compare_progress.py *) Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/compare_progress.py *)
---

# Platform sync check (read-only)

The Colaberry platform's Build Bot pushes "sync build plan" commits to this
repo, touching `.colaberry/plan.json`, `progress.json` and `manifest.json`.
Pushing without checking for them can overwrite the platform's side of
progress.json or bundle its changes into the wrong commit (this happened
during STORY-014). This skill only looks and reports. It never edits,
commits, merges or pushes. If the user wants any of that, finish the report
first and let them decide.

## 1. Fetch
Run `git fetch origin`. If it fails (offline, auth), the verdict is STOP:
you can't vouch for a remote you couldn't read. Report the error as-is.

## 2. What's coming in, what's going out
- Incoming: `git log HEAD..origin/<branch> --format="%h %an %s"`.
  Commits by "Colaberry Build Bot" are platform syncs; note any others too.
- Outgoing: `git log origin/<branch>..HEAD --oneline`.
- Uncommitted: `git status --short .colaberry/`.

## 3. Compare the .colaberry files
Run:

    python ${CLAUDE_SKILL_DIR}/scripts/compare_progress.py --branch <branch>

If `python` isn't found (common on Mac and Linux), run the same command
with `python3`. The script needs Python 3 and nothing else.

It prints, per story, which fields differ between your copy and GitHub's,
tagged PLATFORM-OWNED or YOURS, plus whether plan.json still matches the
platform's fingerprint in manifest.json. Read its output; don't redo the
comparison by hand. Exit code 2 means it could not check: that is a STOP.

## 4. Judge any differences
If the script reports any difference, read
[references/ownership-rules.md](references/ownership-rules.md) before
deciding what it means. It defines who owns each field and what the
platform does when plan.json is hand-edited.

## 5. Verdict
Give exactly one:
- **SAFE TO PUSH**: nothing incoming, and no local changes to
  platform-owned fields.
- **MERGE FIRST**: incoming Build Bot commits, but they don't touch the
  same story fields you changed. Say what to merge and why it's safe.
- **STOP**: fetch failed; you and the platform changed the same field; you
  edited a platform-owned field; or uncommitted .colaberry edits exist
  that don't belong to the current work. Say exactly which.

## 6. Report
Use this layout:

    Verdict: <SAFE TO PUSH | MERGE FIRST | STOP>
    Incoming: <n commits, n from Build Bot, one line each>
    Outgoing: <n commits>
    .colaberry differences: <per story/field, or "none">
    plan.json: <managed by the platform | not being updated by the platform (a warning, not a conflict)>
    Next step: <one plain sentence>
