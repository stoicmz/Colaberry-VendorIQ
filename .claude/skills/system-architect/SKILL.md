---
name: system-architect
description: Use when the user has a project idea and wants a system architecture, a technical design, or a diagram of how it would work.
---

# System Architect

Turn a one-paragraph project idea into a concrete system architecture: the real components this specific idea needs, a Mermaid diagram of how they connect, and a plain-English explanation of each one. Save the result to `project-blueprint/architecture.md`.

## Input

A one-paragraph description of a project idea, provided by the user in the conversation. If the user's description is missing entirely (not just terse), ask for it before proceeding — everything below depends on having an actual idea to read.

## Step 1: Read the idea for what it actually needs

Do not start from a generic template (frontend + backend + database + "AI layer" bolted on regardless). Read the paragraph and identify only the components this idea actually implies:

- **Frontend** — is there a user-facing surface? What kind (web app, mobile, CLI, chat interface, embedded widget)? Skip it if the idea has no user-facing surface (e.g., a pure backend pipeline or a scheduled job).
- **Backend / API** — what logic needs to run server-side? What operations does it expose?
- **Database / storage** — what data actually needs to persist, and what shape is it (relational, document, blob/file storage, vector store)? Don't default to "a database" if the idea is stateless.
- **External services** — what third-party APIs, payment processors, auth providers, messaging platforms, or data sources does the idea explicitly or implicitly depend on?
- **AI / agent layer** — only include this if the idea actually involves an LLM, an agent, generation, classification, or similar. Do not add an AI layer to an idea that doesn't call for one.
- **Anything else the idea specifically calls for** — a queue, a cron/scheduler, a webhook receiver, a real-time channel (websockets), a CDN, auth/session layer, etc. Include only what the paragraph's described behavior actually requires.

If a plausible idea has only three real components, the architecture has three components. Padding the list with unused boilerplate pieces is a defect, not thoroughness.

## Step 2: Design the data flow

For each component identified, work out:
- What triggers it (a user action, a schedule, an event from another component)
- What it sends and to whom
- What it stores or reads

This becomes the edges in the diagram — label them with what actually flows (e.g., "user query", "generated draft", "order confirmation"), not generic arrows.

## Step 3: Produce the Mermaid flowchart

Write a genuine `flowchart` (not a placeholder or boilerplate shape) that reflects the specific components and flows from Steps 1–2. Use `flowchart TD` or `flowchart LR`, whichever reads more naturally for the shape of this system. Label every edge with what moves across it. Group related nodes with `subgraph` only when it clarifies rather than adds noise (e.g., grouping "Frontend" nodes, or an "External Services" cluster).

Do not reuse a fixed set of boxes/arrows across different project ideas — the diagram's shape must change with the idea.

## Step 4: Explain each component in plain English

For every component in the diagram, write exactly one sentence a non-technical stakeholder could follow — what it does and why it's there, no jargon (avoid terms like "REST endpoint," "ORM," "vector embedding" without translation). Example: instead of "Postgres relational store for normalized order records," write "A database that keeps track of every order so nothing gets lost if the app restarts."

## Step 5: Write the file

Create `project-blueprint/architecture.md` (relative to the repo root; create the `project-blueprint/` directory if it doesn't exist) with this structure:

```markdown
# Architecture: <short project name derived from the idea>

## The Idea
<the one-paragraph idea as given>

## Components
- **<Component name>** — <one plain-English sentence>
- **<Component name>** — <one plain-English sentence>
...

## Diagram

```mermaid
<the flowchart from Step 3>
```

## How Data Flows
<a short paragraph walking through the main path end-to-end, in plain English, e.g. "When a user submits X, it goes to Y, which checks Z, then...">
```

## Step 6: Report

When finished, report to the user:
1. The exact file path (`project-blueprint/architecture.md`)
2. The final `description` used (the one-line description of what the architecture covers)
3. The component list identified in Step 1

Do not just say "done" — the report must include all three items explicitly so the user can verify the output without opening the file.
