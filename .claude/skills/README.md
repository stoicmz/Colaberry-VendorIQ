# VendorIQ Skills

Skills are instructions Claude Code follows for specific tasks. They load
automatically for anyone who clones this repo, and Claude uses one when your
request matches its description. You can also run one directly by typing
`/<skill-name>`.

## What's here

| Skill | What it does | Say something like | Changes anything? |
|---|---|---|---|
| **finish-story** | Checks a story's acceptance criteria against real test results, updates `.colaberry/progress.json` for that story, commits with a `Story:` trailer, and pushes | "STORY-004 is done", "let's wrap up STORY-004" | **Yes: edits progress.json, commits, pushes.** Pauses for your OK first |
| **platform-sync-check** | Before a push, checks GitHub for Colaberry Build Bot syncs and compares the `.colaberry/` files. Verdict: SAFE TO PUSH / MERGE FIRST / STOP | "is it safe to push?", "did the platform sync?" | No, read-only. File editing is blocked while it runs |
| **data-quality-gate** | Validates a dataset against a quality contract: PASS/WARN/FAIL per check, then PUBLISH or BLOCK | "is this file ready to publish to the dashboard?" | No, never modifies the dataset |
| **etl-failure-triage** | Diagnoses why a data pipeline, load, or refresh failed; ranks likely causes with evidence | "why did last night's load fail?" | No, never modifies pipeline code |
| **executive-dashboard-brief** | Turns an incident, failed refresh, or data-quality result into a short leadership update | "turn this into an update for leadership" | No, writes its answer in the chat |
| **mvp-scoper** | Decides what to build first, and produces a plan and a one-page pitch | "what should I build first?" | **Yes: writes `project-blueprint/mvp-plan.md`, `mockup.html` and `one-pager.pdf`** |
| **system-architect** | Turns a project idea into an architecture with a diagram and plain-English explanations | "design the architecture for this idea" | **Yes: writes `project-blueprint/architecture.md`** |

## Things to know

- **The repo is public.** Everything in this folder can be read by anyone.
  Never put passwords, keys, or personal data in a skill.
- **Pre-approved commands.** A skill's `allowed-tools` line lets it run the
  listed commands without asking you. `platform-sync-check` pre-approves only
  read-only git commands and its own script. `mvp-scoper` pre-approves
  reading and writing files but asks before any terminal command.
- **Requirements.** `platform-sync-check` needs Python 3 (built-in modules
  only, nothing to install).

## Adding or changing a skill

1. Create `.claude/skills/<skill-name>/SKILL.md`. The folder name and the
   `name:` field must match.
2. Write the `description` as `description: >` followed by indented text, so
   colons and quotes can't break it.
3. Test it: ask in plain words without naming it, try a request it should
   *not* trigger on, and try one failure case.
4. Commit only that skill's folder, with a message saying what it does.
5. Add a row to the table above.
