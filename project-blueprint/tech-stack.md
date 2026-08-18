# Tech Stack: VendorIQ

Grounded in `project-blueprint/architecture.md` and in this repo's own `CLAUDE.md`, which already mandates a real chunk of this stack (Node.js + Express + TypeScript backend, React + CRA + TypeScript frontend, Sequelize as the database contract, Zod at HTTP boundaries, and deployment via Docker Compose to a self-managed VPS). This document treats those as decided where they're decided, and rates them honestly anyway — a mandate isn't automatically the right call.

## Fit-rating key

| Icon | Meaning |
|---|---|
| 🟢 Great fit | Matches VendorIQ's actual size and needs. Pick it, move on. |
| 🟡 Good fit | Works, but there's a real caveat worth reading before you commit. |
| 🔴 Consider carefully | The single most likely place this plan hurts you later. |

## Headline: where this stack is most likely to break

The riskiest choice isn't a library — it's that the whole system's "always up to date, accurate" promise rests on one self-managed VPS running one Postgres container, with no backup, monitoring, or failover story described anywhere in this repo yet. A crashed container or a full disk breaks the day-one guarantee sentence directly, and nobody but you is watching for it. Two smaller, slower-burning risks sit behind it: the frontend is mandated onto Create React App, a toolchain the React team itself stopped recommending years ago, and Phase 2's AI Message Extraction Layer will eventually hand a third party (Anthropic) private recruiter correspondence that isn't only the job seeker's to share.

## Recommendations

Grouped exactly as the architecture is: things a person touches, things you write, things you store, things you depend on, and — separately, because these were never named as architecture components — what the data flow needs.

### Things a person touches

| Component | Technology | Rating | Why it fits VendorIQ |
|---|---|---|---|
| Frontend Web App | React 18 + Create React App (CRA) + TypeScript | 🔴 | It's what CLAUDE.md already mandates, and React itself is a fine, boring, well-documented choice for a dashboard-shaped app — but CRA, the build tool wrapped around it, is discontinued and no longer updated by its maintainers. |
| Message Upload Intake *(Phase 2, deferred)* | Browser `<input type="file">` + `multer` (Express upload middleware) | 🟡 | It's the same upload-handling library the Vendor Ingestion Stage already needs for CSV/file inputs, so it adds no new dependency category — the open question is where the uploaded file physically lives, which isn't decided yet. |

**Caveat — CRA (🔴):** CRA hasn't shipped a real update since 2023 and the React team's own docs no longer recommend it for new projects. It still works today. It will get harder to keep working (slower builds, aging Webpack config, security-audit warnings that pile up with no fix). Vite is the direct, low-drama replacement — same React code, different build tool. Changing this means updating CLAUDE.md itself (it's an explicit mandate there), so it's worth raising with your DRI rather than swapping quietly.

**Caveat — Message Upload Intake (🟡):** Decide disk-on-the-VPS vs. object storage (e.g. an S3-compatible bucket) before this ships. A single VPS disk filling up with uploaded message files is a realistic way to take the whole app down.

### Things you write

| Component | Technology | Rating | Why it fits VendorIQ |
|---|---|---|---|
| Backend API (Express Routes) | Express.js + TypeScript + Zod | 🟢 | Already mandated, and it's exactly proportionate — a handful of routes on a small team doesn't need a heavier framework. |
| Auth & Session Layer | Passport.js (local strategy) + `express-session` + `connect-pg-simple` + bcrypt | 🟡 | It's the standard, free, self-hosted way to do sessions on an Express + Postgres stack, and "session," not "token," is literally the word in the component's own name — but you now own every bit of its security surface yourself. |
| Vendor Ingestion Stage | Zod (schema) + `multer` (file/form uploads) + `csv-parse` (CSV) | 🟢 | This is the same contract-first pattern CLAUDE.md already requires everywhere else, applied to the one place raw external data enters the system. |
| Normalization Stage | Plain TypeScript (no new library) | 🟢 | This stage's whole job is reshaping data your own code already understands — reaching for a library here would be solving a problem you don't have. |
| Behavior Pattern Engine | Plain TypeScript contract module (internal scoring logic out of scope — see architecture.md) | 🟢 *(shell only)* | The outer shell — a typed function that takes an event history and returns a pattern — needs nothing but TypeScript; a framework would only get in the way of code this small. |

**Caveat — Auth & Session Layer (🟡):** Self-rolled auth means you own password-reset flows, session-fixation defenses, and every future security patch. A managed identity provider (Clerk, Auth0) removes that ownership for a monthly fee — reasonable to revisit if VendorIQ grows past a handful of users, but a paid external dependency is a governance-escalation item under this repo's own rules, not a quiet swap.

**Caveat — Behavior Pattern Engine (not rated):** Only the contract shell is rated here. The actual scoring methodology is intentionally undisclosed (per `backend/src/services/vendorIngestion/README.md`'s existing "no VendorIQ scoring or trade-secret methodology" boundary), so there is nothing to rate — don't read the 🟢 above as covering logic nobody has designed yet.

### Things you store

| Component | Technology | Rating | Why it fits VendorIQ |
|---|---|---|---|
| Vendor & Interaction Database | PostgreSQL 17 + Sequelize (typed models) | 🟢 | Job seeker → vendor → interaction event is a textbook relational shape with real foreign keys, and this repo's own `preview-db-init` folder already assumes Postgres — this is the least risky decision in the whole document. |

### Things you depend on

| Component | Technology | Rating | Why it fits VendorIQ |
|---|---|---|---|
| AI Message Extraction Layer *(Phase 2, deferred)* | Anthropic Claude API (Messages API, e.g. `claude-sonnet-5`) | 🔴 | It's the most capable off-the-shelf way to turn messy recruiter messages into structured events without training anything yourself — but it means a third party reads private correspondence that isn't only the job seeker's to hand over. |

**Caveat — AI Message Extraction Layer (🔴):** This is a compliance/security-posture question, not just a technical one — CLAUDE.md itself lists "compliance or security posture" and "paid external services" as things that must be escalated, not decided quietly inside a code change. Get an explicit privacy review and DRI sign-off before Phase 2 starts, not after.

### What the data flow needs *(not named in the component list — these came from tracing the flow, not the architecture table)*

| Need | Technology | Rating | Why it fits VendorIQ |
|---|---|---|---|
| Hosting & deployment | Docker Compose on a self-managed VPS + Nginx reverse proxy | 🔴 | It's what CLAUDE.md already commits to, and Docker Compose keeps dev/prod parity honest — but for one person maintaining one server, every OS patch, TLS renewal, and backup is now your job with nothing described to catch you if you miss one. |
| Structured logging & correlation IDs | `pino` (JSON structured logger for Node) | 🟢 | CLAUDE.md already requires JSON logs and correlation IDs on every request; pino produces that shape natively and fast, with nothing extra to configure. |
| Text extraction for uploaded messages *(Phase 2, deferred)* | `pdf-parse` for PDF exports; plain text/CSV reuses the existing Ingestion Stage | 🟡 | Recruiter message exports realistically arrive as PDF or plain text, and this covers both without inventing a new format-detection layer — the actual source format is still an open question per architecture.md. |

**Caveat — Hosting (🔴):** A managed platform (Render, Railway, Fly.io) would absorb patching, TLS, and often backups for a modest monthly cost, trading a little control for a lot of removed operational risk. This is the change I'd push hardest on if VendorIQ is a solo or two-person effort — but like Auth, it's a paid-external-service and production-infrastructure decision, which CLAUDE.md requires escalating rather than changing quietly.

## Copy-ready prompts

Every prompt below already names VendorIQ, so the answer is about this system, not a textbook. (Collected again, with working copy buttons, on the knowledge base's Prompts page.)

| Technology | Prompt |
|---|---|
| React + CRA | "Explain React and Create React App to me like I'm new to frontend tooling, using VendorIQ's Frontend Web App as the example. What would my first three components actually be?" |
| Passport.js + express-session | "Explain session-based authentication to me like I'm new to auth, using VendorIQ's Auth & Session Layer as the example. Walk me through what happens, step by step, from a job seeker typing their password to their dashboard loading." |
| Express + Zod | "Explain Express routing and Zod validation to me like I'm new to backend APIs, using VendorIQ's Backend API as the example. What would my first two routes actually look like?" |
| Zod + multer + csv-parse | "Explain schema validation and file uploads to me like I'm new to backend development, using VendorIQ's Vendor Ingestion Stage as the example. What does a rejected CSV upload actually look like to the job seeker?" |
| TypeScript (Normalization Stage) | "Explain why a 'normalization' step is its own module instead of being folded into ingestion, using VendorIQ as the example. What's the actual shape of a canonical interaction event?" |
| TypeScript contracts | "Explain what a 'contract-only' component means in software design, using VendorIQ's Behavior Pattern Engine as the example. What would its TypeScript input and output types look like, without designing the scoring logic itself?" |
| PostgreSQL + Sequelize | "Explain PostgreSQL to me like I'm new to databases, using VendorIQ as the example. What tables would I actually have, and how would they connect to each other?" |
| multer (uploads) | "Explain file upload handling to me like I'm new to it, using VendorIQ's Message Upload Intake as the example. What are the real risks of accepting a file from a stranger's browser?" |
| Claude API | "Explain the Anthropic Claude API to me like I'm new to AI APIs, using VendorIQ's AI Message Extraction Layer as the example. What would one request to extract a recruiter interaction from a message actually contain?" |
| Docker Compose + VPS | "Explain Docker Compose and running my own server to me like I'm new to deployment, using VendorIQ as the example. What breaks first if I don't touch this server for six months?" |
| pino (logging) | "Explain structured logging to me like I'm new to observability, using VendorIQ as the example. What would one log line look like when a job seeker's interaction fails validation?" |
| pdf-parse (text extraction) | "Explain text extraction from PDFs to me like I'm new to document processing, using VendorIQ's AI Message Extraction Layer as the example. What could go wrong turning a recruiter's PDF export into plain text?" |

## What to learn first, in order

1. **TypeScript** — every other row in this document is written in it; nothing else makes sense until this does.
2. **Express + Zod** — the Backend API and Vendor Ingestion Stage are the spine everything else attaches to.
3. **PostgreSQL + Sequelize** — you can't build the Behavior Pattern Engine or the dashboard without somewhere to read and write vendor history.
4. **React + CRA** — the frontend is the last thing a job seeker actually judges the system by, but it's the fastest to learn once the API exists to call.
5. **Passport.js + sessions** — bolt this on once there's something worth protecting (real user data in the database).
6. **pino / structured logging** — add this as you build, not after; retrofitting logging into working code is more painful than building it in.
7. **Docker Compose + VPS operations** — learn this in parallel with everything else, since you'll need it the first time you want to show anyone a working version.
8. **Claude API** — last, and only when Phase 2 actually starts; there's no reason to learn it before Phase 1 ships.

## Alternatives considered, and why not

| Instead of... | Considered | Why not (for VendorIQ, specifically) |
|---|---|---|
| React + CRA | Vite + React | Not a technical objection — Vite is arguably the better call — but CRA is what CLAUDE.md currently mandates, and changing that is a documented-mandate change, not a quiet swap. |
| Passport.js + sessions | Clerk / Auth0 (managed identity) | A paid external dependency; overkill for a handful of users, and a governance-escalation item under this repo's own rules before it's worth the monthly cost. |
| PostgreSQL | MongoDB | VendorIQ's data (job seeker → vendor → interaction) is inherently relational with real foreign keys — a document store would just make you reinvent joins in application code. |
| Express | Fastify or NestJS | Both are fine frameworks, but NestJS's decorators and dependency-injection machinery solve organization problems a ~10-component backend doesn't have yet, and Express is already mandated. |
| Docker Compose + VPS | Render / Railway / Fly.io (managed platform) | This is the alternative I'd actually lean toward for a solo builder — see the Hosting caveat above — but it's a production-infrastructure decision this repo requires escalating, not one this document can make for you. |
| Claude API | Self-hosted open-weight model | Meaningfully more infrastructure (GPU hosting, model serving) for a deferred, optional Phase 2 feature — revisit only if API cost or privacy requirements force it. |
| pino | Winston | Winston is more configurable, but pino's native JSON output matches CLAUDE.md's structured-logging requirement with less setup, and VendorIQ doesn't need Winston's extra transport flexibility. |

## How hard each decision is to undo

| Decision | Difficulty | Why |
|---|---|---|
| Frontend build tool (CRA) | Moderate | A real migration (config, test runner, env-var prefixes) but not a rewrite — the React components themselves barely change. |
| Auth & Session Layer | Moderate | Swapping to a managed provider means migrating stored users and sessions, but the rest of the app only ever sees "is this request authenticated," so the blast radius is contained. |
| Backend API framework (Express) | Hard | The entire backend is structured around it; changing frameworks later is close to a rewrite. |
| Vendor Ingestion Stage | Easy | Validation logic is isolated behind a contract by design — swap the library, keep the shape. |
| Normalization Stage | Easy | Pure functions with no external dependency to be locked into. |
| Behavior Pattern Engine (shell) | Easy | The contract insulates every caller from whatever the internals turn out to be. |
| Database (PostgreSQL) | Hard | Once real data exists, migrating engines is a project of its own, not a config change. |
| Message Upload Intake | Easy | Not built yet — the only "undo" cost right now is a design decision, not code. |
| AI Message Extraction Layer | Moderate | Swappable to another LLM provider behind the same contract, but prompt behavior has to be re-tuned, not just re-pointed. |
| Hosting (VPS + Docker Compose) | Moderate–Hard | Docker Compose itself is portable to most platforms, but DNS, TLS, and deploy scripts all need re-plumbing on a move. |
| Structured logging (pino) | Easy | Swappable behind a thin logging wrapper with minimal call-site changes. |
| Text extraction (Phase 2) | Easy | Deferred, isolated utility with no other component depending on its internals. |

## What this document does NOT tell you

- The actual Postgres table/column design — that's the natural next step, not this one.
- A resolution to the CRA-vs-Vite tension — that's a decision for you and your DRI to make and reflect back into CLAUDE.md, not something this document can settle unilaterally.
- The Behavior Pattern Engine's real scoring algorithm — still out of scope, per architecture.md's own boundary.
- A priced comparison of managed hosting platforms if you do move off the VPS.
- A specific testing framework recommendation (Jest is implied by the CRA/TypeScript convention but not evaluated here).
- CI/CD pipeline design — how code actually gets from a commit to that VPS beyond the `git pull && docker compose up` command CLAUDE.md already documents.
