---
description: Test, format, and draft a PR for the current change
argument-hint: [pr-title]
allowed-tools: Bash(npm --prefix backend test:*), Bash(git add -u:*), Bash(git diff --cached:*)
---

1. Run the test command: `npm --prefix backend test`.
   If anything fails, STOP and report the failures. Do not continue.
   # WHY: verification is step one, and step one is allowed to say no.

2. On green, stage the changes: `git add -u`.
   # No formatter is configured in this repo (no prettier, no format script) — do not
   # invent one. This step only stages already-tracked, modified files.

3. Read the staged diff with `git diff --cached`, then draft a PR description titled
   "$ARGUMENTS", with:
   - **Summary** — what changed and why, in a few sentences.
   - **Test Evidence** — a line quoting the actual passing output from step 1.
   - **Risk** — what could break, or "none identified" if genuinely none.
   # WHY: $ARGUMENTS is whatever you type after /ship — the title travels into the body.

   This step only drafts and prints the PR description as text. It does not run
   `git commit` or `git push` — those are not in this command's allowed-tools, so it is
   structurally unable to ship the change. Shipping is a separate, deliberate action you
   take yourself after reviewing the draft.
