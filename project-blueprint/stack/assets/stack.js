/* VendorIQ tech stack recommendations — single source of truth for every page in stack/. */
const STACK = {
  meta: {
    project: "VendorIQ",
    tagline: "One real, current, specific technology per architecture component — rated against VendorIQ's actual scale, not against what's popular.",
    generated: "2026-08-06",
    sourceDocs: ["architecture.md", "tech-stack.md"]
  },

  ratingKey: [
    { level: "green", icon: "🟢", label: "Great fit", meaning: "Matches VendorIQ's actual size and needs. Pick it, move on." },
    { level: "amber", icon: "🟡", label: "Good fit", meaning: "Works, but there's a real caveat worth reading before you commit." },
    { level: "red", icon: "🔴", label: "Consider carefully", meaning: "The single most likely place this plan hurts you later." }
  ],

  headline: "The riskiest choice isn't a library — it's that the whole system's “always up to date, accurate” promise rests on one self-managed VPS running one Postgres container, with no backup, monitoring, or failover story described anywhere in this repo yet. A crashed container or a full disk breaks the day-one guarantee sentence directly, and nobody but you is watching for it. Two smaller, slower-burning risks sit behind it: the frontend is mandated onto Create React App, a toolchain the React team itself stopped recommending years ago, and Phase 2's AI Message Extraction Layer will eventually hand a third party (Anthropic) private recruiter correspondence that isn't only the job seeker's to share.",

  groups: [
    { id: "touches", label: "Things a person touches", fromFlow: false, blurb: "The parts of VendorIQ a job seeker directly sees or interacts with." },
    { id: "write", label: "Things you write", fromFlow: false, blurb: "Code you author yourself, using a library rather than a managed service." },
    { id: "store", label: "Things you store", fromFlow: false, blurb: "Where VendorIQ's data actually lives between visits." },
    { id: "depend", label: "Things you depend on", fromFlow: false, blurb: "Third parties VendorIQ relies on but doesn't build itself." },
    { id: "flow", label: "What the data flow needs", fromFlow: true, blurb: "Never named in the architecture's component list — these came from tracing what has to happen for data to actually move, not from the component table." }
  ],

  recommendations: [
    {
      id: "frontend-web-app",
      component: "Frontend Web App",
      group: "touches",
      tech: "React 18 + Create React App (CRA) + TypeScript",
      rating: "red",
      why: "It's what CLAUDE.md already mandates, and React itself is a fine, boring, well-documented choice for a dashboard-shaped app — but CRA, the build tool wrapped around it, is discontinued and no longer updated by its maintainers.",
      caveat: "CRA hasn't shipped a real update since 2023 and the React team's own docs no longer recommend it for new projects. It still works today. It will get harder to keep working (slower builds, aging Webpack config, security-audit warnings that pile up with no fix). Vite is the direct, low-drama replacement — same React code, different build tool. Changing this means updating CLAUDE.md itself (it's an explicit mandate there), so it's worth raising with your DRI rather than swapping quietly.",
      prompt: "Explain React and Create React App to me like I'm new to frontend tooling, using VendorIQ's Frontend Web App as the example. What would my first three components actually be?",
      alternative: { name: "Vite + React", whyNot: "Not a technical objection — Vite is arguably the better call — but CRA is what CLAUDE.md currently mandates, and changing that is a documented-mandate change, not a quiet swap." },
      undo: { difficulty: "moderate", reason: "A real migration (config, test runner, env-var prefixes) but not a rewrite — the React components themselves barely change." },
      learnOrder: 4
    },
    {
      id: "message-upload-intake",
      component: "Message Upload Intake",
      group: "touches",
      tech: "Browser file input + multer (Express upload middleware)",
      rating: "amber",
      why: "It's the same upload-handling library the Vendor Ingestion Stage already needs for CSV/file inputs, so it adds no new dependency category — the open question is where the uploaded file physically lives, which isn't decided yet.",
      caveat: "Decide disk-on-the-VPS vs. object storage (e.g. an S3-compatible bucket) before this ships. A single VPS disk filling up with uploaded message files is a realistic way to take the whole app down.",
      prompt: "Explain file upload handling to me like I'm new to it, using VendorIQ's Message Upload Intake as the example. What are the real risks of accepting a file from a stranger's browser?",
      alternative: { name: "Direct-to-object-storage upload (pre-signed URLs)", whyNot: "Skips the VPS-disk risk entirely, but it's real added complexity for a feature that's already deferred and optional — revisit once Phase 2 actually starts." },
      undo: { difficulty: "easy", reason: "Not built yet — the only “undo” cost right now is a design decision, not code." },
      learnOrder: null
    },
    {
      id: "backend-api",
      component: "Backend API (Express Routes)",
      group: "write",
      tech: "Express.js + TypeScript + Zod",
      rating: "green",
      why: "Already mandated, and it's exactly proportionate — a handful of routes on a small team doesn't need a heavier framework.",
      caveat: null,
      prompt: "Explain Express routing and Zod validation to me like I'm new to backend APIs, using VendorIQ's Backend API as the example. What would my first two routes actually look like?",
      alternative: { name: "Fastify or NestJS", whyNot: "Both are fine frameworks, but NestJS's decorators and dependency-injection machinery solve organization problems a ~10-component backend doesn't have yet, and Express is already mandated." },
      undo: { difficulty: "hard", reason: "The entire backend is structured around it; changing frameworks later is close to a rewrite." },
      learnOrder: 2
    },
    {
      id: "auth-session",
      component: "Auth & Session Layer",
      group: "write",
      tech: "Passport.js (local strategy) + express-session + connect-pg-simple + bcrypt",
      rating: "amber",
      why: "It's the standard, free, self-hosted way to do sessions on an Express + Postgres stack, and “session,” not “token,” is literally the word in the component's own name — but you now own every bit of its security surface yourself.",
      caveat: "Self-rolled auth means you own password-reset flows, session-fixation defenses, and every future security patch. A managed identity provider (Clerk, Auth0) removes that ownership for a monthly fee — reasonable to revisit if VendorIQ grows past a handful of users, but a paid external dependency is a governance-escalation item under this repo's own rules, not a quiet swap.",
      prompt: "Explain session-based authentication to me like I'm new to auth, using VendorIQ's Auth & Session Layer as the example. Walk me through what happens, step by step, from a job seeker typing their password to their dashboard loading.",
      alternative: { name: "Clerk / Auth0 (managed identity)", whyNot: "A paid external dependency; overkill for a handful of users, and a governance-escalation item under this repo's own rules before it's worth the monthly cost." },
      undo: { difficulty: "moderate", reason: "Swapping to a managed provider means migrating stored users and sessions, but the rest of the app only ever sees “is this request authenticated,” so the blast radius is contained." },
      learnOrder: 5
    },
    {
      id: "vendor-ingestion",
      component: "Vendor Ingestion Stage",
      group: "write",
      tech: "Zod (schema) + multer (file/form uploads) + csv-parse (CSV)",
      rating: "green",
      why: "This is the same contract-first pattern CLAUDE.md already requires everywhere else, applied to the one place raw external data enters the system.",
      caveat: null,
      prompt: "Explain schema validation and file uploads to me like I'm new to backend development, using VendorIQ's Vendor Ingestion Stage as the example. What does a rejected CSV upload actually look like to the job seeker?",
      alternative: { name: "A hand-rolled validation function", whyNot: "Zod is already the mandated contract mechanism for this repo; writing validation by hand would duplicate a pattern that already exists everywhere else in the backend." },
      undo: { difficulty: "easy", reason: "Validation logic is isolated behind a contract by design — swap the library, keep the shape." },
      learnOrder: 2
    },
    {
      id: "normalization",
      component: "Normalization Stage",
      group: "write",
      tech: "Plain TypeScript (no new library)",
      rating: "green",
      why: "This stage's whole job is reshaping data your own code already understands — reaching for a library here would be solving a problem you don't have.",
      caveat: null,
      prompt: "Explain why a 'normalization' step is its own module instead of being folded into ingestion, using VendorIQ as the example. What's the actual shape of a canonical interaction event?",
      alternative: { name: "A mapping/transform library (e.g. a schema-to-schema mapper)", whyNot: "Adds a dependency to solve a problem plain TypeScript functions already solve at this scale." },
      undo: { difficulty: "easy", reason: "Pure functions with no external dependency to be locked into." },
      learnOrder: 3
    },
    {
      id: "engine-behavior-pattern",
      component: "Behavior Pattern Engine",
      group: "write",
      tech: "Plain TypeScript contract module (internal scoring logic out of scope)",
      rating: "green",
      ratingNote: "Shell only — see caveat.",
      why: "The outer shell — a typed function that takes an event history and returns a pattern — needs nothing but TypeScript; a framework would only get in the way of code this small.",
      caveat: "Only the contract shell is rated here. The actual scoring methodology is intentionally undisclosed (per backend/src/services/vendorIngestion/README.md's existing “no VendorIQ scoring or trade-secret methodology” boundary), so there is nothing to rate — don't read the green rating above as covering logic nobody has designed yet.",
      prompt: "Explain what a 'contract-only' component means in software design, using VendorIQ's Behavior Pattern Engine as the example. What would its TypeScript input and output types look like, without designing the scoring logic itself?",
      alternative: { name: "A rules engine library", whyNot: "Would presuppose the scoring approach is rule-based, which is exactly the undisclosed decision this document isn't allowed to make." },
      undo: { difficulty: "easy", reason: "The contract insulates every caller from whatever the internals turn out to be." },
      learnOrder: 3
    },
    {
      id: "database",
      component: "Vendor & Interaction Database",
      group: "store",
      tech: "PostgreSQL 17 + Sequelize (typed models)",
      rating: "green",
      why: "Job seeker → vendor → interaction event is a textbook relational shape with real foreign keys, and this repo's own preview-db-init folder already assumes Postgres — this is the least risky decision in the whole document.",
      caveat: null,
      prompt: "Explain PostgreSQL to me like I'm new to databases, using VendorIQ as the example. What tables would I actually have, and how would they connect to each other?",
      alternative: { name: "MongoDB", whyNot: "VendorIQ's data (job seeker → vendor → interaction) is inherently relational with real foreign keys — a document store would just make you reinvent joins in application code." },
      undo: { difficulty: "hard", reason: "Once real data exists, migrating engines is a project of its own, not a config change." },
      learnOrder: 3
    },
    {
      id: "ai-extraction",
      component: "AI Message Extraction Layer",
      group: "depend",
      tech: "Anthropic Claude API (Messages API, e.g. claude-sonnet-5)",
      rating: "red",
      why: "It's the most capable off-the-shelf way to turn messy recruiter messages into structured events without training anything yourself — but it means a third party reads private correspondence that isn't only the job seeker's to hand over.",
      caveat: "This is a compliance/security-posture question, not just a technical one — CLAUDE.md itself lists “compliance or security posture” and “paid external services” as things that must be escalated, not decided quietly inside a code change. Get an explicit privacy review and DRI sign-off before Phase 2 starts, not after.",
      prompt: "Explain the Anthropic Claude API to me like I'm new to AI APIs, using VendorIQ's AI Message Extraction Layer as the example. What would one request to extract a recruiter interaction from a message actually contain?",
      alternative: { name: "Self-hosted open-weight model", whyNot: "Meaningfully more infrastructure (GPU hosting, model serving) for a deferred, optional Phase 2 feature — revisit only if API cost or privacy requirements force it." },
      undo: { difficulty: "moderate", reason: "Swappable to another LLM provider behind the same contract, but prompt behavior has to be re-tuned, not just re-pointed." },
      learnOrder: 8
    },
    {
      id: "hosting",
      component: "Hosting & deployment",
      group: "flow",
      tech: "Docker Compose on a self-managed VPS + Nginx reverse proxy",
      rating: "red",
      why: "It's what CLAUDE.md already commits to, and Docker Compose keeps dev/prod parity honest — but for one person maintaining one server, every OS patch, TLS renewal, and backup is now your job with nothing described to catch you if you miss one.",
      caveat: "A managed platform (Render, Railway, Fly.io) would absorb patching, TLS, and often backups for a modest monthly cost, trading a little control for a lot of removed operational risk. This is the change I'd push hardest on if VendorIQ is a solo or two-person effort — but like Auth, it's a paid-external-service and production-infrastructure decision, which CLAUDE.md requires escalating rather than changing quietly.",
      prompt: "Explain Docker Compose and running my own server to me like I'm new to deployment, using VendorIQ as the example. What breaks first if I don't touch this server for six months?",
      alternative: { name: "Render / Railway / Fly.io (managed platform)", whyNot: "This is the alternative I'd actually lean toward for a solo builder — see the caveat — but it's a production-infrastructure decision this repo requires escalating, not one this document can make for you." },
      undo: { difficulty: "hard", reason: "Docker Compose itself is portable to most platforms, but DNS, TLS, and deploy scripts all need re-plumbing on a move." },
      learnOrder: 7
    },
    {
      id: "logging",
      component: "Structured logging & correlation IDs",
      group: "flow",
      tech: "pino (JSON structured logger for Node)",
      rating: "green",
      why: "CLAUDE.md already requires JSON logs and correlation IDs on every request; pino produces that shape natively and fast, with nothing extra to configure.",
      caveat: null,
      prompt: "Explain structured logging to me like I'm new to observability, using VendorIQ as the example. What would one log line look like when a job seeker's interaction fails validation?",
      alternative: { name: "Winston", whyNot: "Winston is more configurable, but pino's native JSON output matches CLAUDE.md's structured-logging requirement with less setup, and VendorIQ doesn't need Winston's extra transport flexibility." },
      undo: { difficulty: "easy", reason: "Swappable behind a thin logging wrapper with minimal call-site changes." },
      learnOrder: 6
    },
    {
      id: "text-extraction",
      component: "Text extraction for uploaded messages",
      group: "flow",
      tech: "pdf-parse for PDF exports; plain text/CSV reuses the existing Ingestion Stage",
      rating: "amber",
      why: "Recruiter message exports realistically arrive as PDF or plain text, and this covers both without inventing a new format-detection layer — the actual source format is still an open question per architecture.md.",
      caveat: "Deferred and low urgency, but worth naming now: nothing in the architecture yet says which formats VendorIQ actually has to accept, so this pick is a reasonable guess, not a settled decision.",
      prompt: "Explain text extraction from PDFs to me like I'm new to document processing, using VendorIQ's AI Message Extraction Layer as the example. What could go wrong turning a recruiter's PDF export into plain text?",
      alternative: { name: "Require plain-text or CSV export only (no PDF support)", whyNot: "Simpler, but pushes real work onto the job seeker to reformat their own message exports — worth reconsidering once real usage data exists." },
      undo: { difficulty: "easy", reason: "Deferred, isolated utility with no other component depending on its internals." },
      learnOrder: 8
    }
  ],

  learningOrder: [
    { order: 1, tech: "TypeScript", reason: "Every other row in this document is written in it; nothing else makes sense until this does." },
    { order: 2, tech: "Express + Zod", reason: "The Backend API and Vendor Ingestion Stage are the spine everything else attaches to." },
    { order: 3, tech: "PostgreSQL + Sequelize", reason: "You can't build the Behavior Pattern Engine or the dashboard without somewhere to read and write vendor history." },
    { order: 4, tech: "React + CRA", reason: "The frontend is the last thing a job seeker actually judges the system by, but it's the fastest to learn once the API exists to call." },
    { order: 5, tech: "Passport.js + sessions", reason: "Bolt this on once there's something worth protecting (real user data in the database)." },
    { order: 6, tech: "pino / structured logging", reason: "Add this as you build, not after; retrofitting logging into working code is more painful than building it in." },
    { order: 7, tech: "Docker Compose + VPS operations", reason: "Learn this in parallel with everything else, since you'll need it the first time you want to show anyone a working version." },
    { order: 8, tech: "Claude API", reason: "Last, and only when Phase 2 actually starts; there's no reason to learn it before Phase 1 ships." }
  ],

  notCovered: [
    "The actual Postgres table/column design — that's the natural next step, not this one.",
    "A resolution to the CRA-vs-Vite tension — that's a decision for you and your DRI to make and reflect back into CLAUDE.md, not something this document can settle unilaterally.",
    "The Behavior Pattern Engine's real scoring algorithm — still out of scope, per architecture.md's own boundary.",
    "A priced comparison of managed hosting platforms if you do move off the VPS.",
    "A specific testing framework recommendation (Jest is implied by the CRA/TypeScript convention but not evaluated here).",
    "CI/CD pipeline design — how code actually gets from a commit to that VPS beyond the git pull && docker compose up command CLAUDE.md already documents."
  ],

  architectureComponents: [
    "Frontend Web App", "Auth & Session Layer", "Backend API (Express Routes)", "Vendor Ingestion Stage",
    "Normalization Stage", "Behavior Pattern Engine", "Vendor & Interaction Database",
    "Message Upload Intake", "AI Message Extraction Layer"
  ]
};
