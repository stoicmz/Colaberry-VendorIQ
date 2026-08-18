---
name: mvp-scoper
description: Use when the user wants to know what to build first, see what their idea could look like, and get a short pitch for it.
allowed-tools: Read, Write, Bash
---

# MVP Scoper

Turns an already-designed idea into three concrete, usable artifacts: the smallest real slice to build first, a visual mockup of what it looks like, and a one-page pitch. This skill does not design the architecture or pick the stack — it reads those decisions and scopes down from them.

## Required inputs

- **`project-blueprint/architecture.md`** — required. Read it first (via the `Read` tool; a missing file returns an error rather than throwing). If it doesn't exist, stop and tell the user to produce it first (e.g. via the `system-architect` skill) — do not invent an architecture to scope from.
- **`project-blueprint/tech-stack.md`** — required. Same rule: if it doesn't exist, stop and ask for it rather than guessing technologies.

Both files are the only source of fact for this skill. Don't reach for outside knowledge about the idea, the stack, or the build order — if it's not in one of these two files, it doesn't go in the output.

## Step 1: Extract what Week 1 actually needs

From `architecture.md`, pull: the one-paragraph idea, the day-one guarantee sentence (if present), the component list, and Phase 1 of the Build Order.
From `tech-stack.md`, pull: the specific technology recommended for each Phase 1 component, and its fit rating.

Then cut further than Phase 1. A real Week 1 slice is usually narrower than the architecture's own "Phase 1" — it proves ONE core loop end-to-end (e.g., "a user can do the one thing this idea is for, once, badly, all the way through") rather than building every Phase 1 component to production quality. Look for what can be faked, hardcoded, or skipped without lying about what's proven:
- Auth can be a single hardcoded test user instead of real signup/login.
- Validation can cover the happy path only, not every edge case.
- A database can be a single seeded table instead of the full schema.
- A UI can be one working screen instead of the full navigation.

Name each cut explicitly — the plan must be honest about what it's skipping, not silent about it.

## Step 2: Write `project-blueprint/mvp-plan.md`

Fill in `template.md` exactly as structured — do not add sections, remove sections, or reorder them. Every checklist item must name the specific technology it uses, pulled from `tech-stack.md` (not a generic placeholder like "the backend"). Every item traces back to a component actually named in `architecture.md`.

## Step 3: Build `project-blueprint/mockup.html`

A single, self-contained HTML file — inline `<style>`, no external stylesheets, no CDN, no build step, opens correctly from disk (`file://`). This is a real mockup, not a wireframe:

- **Real content, not placeholders.** Every label, headline, sample row, and piece of body copy must be written for THIS idea specifically, in the voice a real user of it would see. No "Lorem ipsum," no "Item 1 / Item 2," no "Company Name." If the idea tracks something, show 3–5 real-feeling sample entries with real-sounding names and values, not `[data]`.
- **Real visual design, not gray boxes.** Pick a small, cohesive color palette that matches the idea's actual tone (calm and trustworthy for something people rely on to make decisions, energetic for a consumer social app, etc.) — not default browser styling, not a single shade of Bootstrap blue. Use real typography (a system font stack is fine), spacing, and at least one accent color used consistently for the same kind of thing everywhere it appears.
- **Icons, inline only.** No icon fonts, no external image files — small inline SVGs or a sparing, purposeful use of Unicode symbols. Icons should label real concepts from the idea (e.g., a clock for "time since last contact"), not decorate empty space.
- **Pick the one screen that sells the idea.** Default to the core app view (the screen a real user would actually work in day to day) over a marketing landing page, unless the idea is explicitly a consumer/marketing-led product where the landing page IS the product's front door. Show it populated with realistic data, not empty states.
- **Responsive enough to not look broken** at common widths — relative units, no fixed-width layouts wider than the viewport.

## Step 4: Generate `project-blueprint/one-pager.pdf`

This must be a real, single-page PDF file, produced by an actual PDF-writing tool. **Never** write HTML or Markdown and rename the file `.pdf` — a renamed file is not a PDF and does not satisfy this step.

Content (short, punchy, non-technical — this is a pitch, not a spec):
- A headline naming the idea.
- One sentence on who needs it.
- One sentence on why it matters (the outcome it changes, not how it's built).
- 3–5 short, icon-led lines on what it does (verb-first, plain language — "Logs every recruiter interaction automatically," not "Ingests structured interaction events via a validated API contract").
- No architecture terms, no technology names, no component names.

**Generation procedure — pick exactly one path, in this order of preference, and use `Bash` for nothing beyond what's described here:**

1. Write the one-pager's content as a small, print-styled standalone HTML file to `tmp/mvp-scoper-onepager-source.html` (this repo's own scratch folder — safe to delete, never committed). Style it for a single printed page: an `@page` rule with a fixed size (e.g. `@page { size: Letter; margin: 0.6in; }`), layout that fits one page without a page break, print-safe colors (avoid pure white text on a light background that some PDF renderers flatten to grayscale).
2. **Preferred: headless Chrome or Edge print-to-PDF.** Run one `Bash` command to confirm a Chrome or Edge executable exists on this machine (check the handful of standard install locations for the current OS, or `where`/`which` the common binary names), then run exactly one command using that executable's headless print-to-PDF flag, pointed at the file from step 1, writing directly to `project-blueprint/one-pager.pdf`. This needs no new dependency and is the most portable option.
3. **If no browser is available: Python + reportlab.** Only if a `python`/`python3` with `reportlab` already importable is confirmed by one quick check — do not `pip install` anything (new dependencies are a deliberate add, not a drive-by install per this repo's rules). Write a short one-off script that draws the same content (headline, sub-line, bullet list with simple icon glyphs) directly to `project-blueprint/one-pager.pdf` via reportlab's canvas, then run it.
4. **If neither is available: Node + puppeteer.** Only if `node` and an already-installed `puppeteer` are confirmed by one quick check, same no-install rule. Write a short one-off script that loads the file from step 1 and calls `page.pdf()` to `project-blueprint/one-pager.pdf`.
5. If none of the three are available, stop and tell the user which tools were checked and came up missing, rather than faking the file.
6. Confirm the resulting `project-blueprint/one-pager.pdf` exists and has a non-trivial size before reporting success.
7. Delete `tmp/mvp-scoper-onepager-source.html` once the PDF is confirmed — it was scratch, not a deliverable.

## Rules

- Three files, no more, no fewer, unless a required step genuinely can't complete (see the PDF fallback-exhausted case above) — don't leave partial/placeholder versions of a file you couldn't finish.
- `architecture.md` and `tech-stack.md` are the only source of fact for what the idea is and what tech it uses — don't invent components or technologies not named in them.
- `mockup.html` must be a real mockup: real content, real color, real icons, self-contained, no CDN, opens from `file://`.
- `one-pager.pdf` must be produced by an actual PDF-generation tool — never a renamed `.md`/`.html`.
- `Bash` is used only to detect an available PDF tool and to run the single command that generates the PDF (plus deleting the scratch HTML afterward) — not for anything else in this skill.

## Report

When finished, report to the user:
1. Every file created, with its exact path.
2. One line on what each file contains.
3. Which tool actually generated the PDF (headless Chrome/Edge, reportlab, or puppeteer).
