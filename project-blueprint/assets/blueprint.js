/* VendorIQ project blueprint — single source of truth for every page. */
const BLUEPRINT = {
  meta: {
    project: "VendorIQ",
    tagline: "A trustworthy, always-current picture of recruiter behavior for job seekers.",
    generated: "2026-08-06",
    sourceDoc: "architecture.md"
  },

  idea: {
    paragraph: "VendorIQ is a web app that helps job seekers track vendor, agency, and recruiter behavior so they can make better decisions during the job search. It’s designed for people who interact with multiple recruiters and want a clear, trustworthy picture of how each one behaves over time. In the future, users may optionally allow VendorIQ to organize recruiter messages or upload a compiled message file for aggregation, but on day one the system must reliably capture and display recruiter behavior patterns in a simple, easy‑to‑understand format. Every component in the system exists to guarantee that this behavior tracking is accurate, clear, and always up to date.",
    guaranteeSentence: "on day one the system must reliably capture and display recruiter behavior patterns in a simple, easy-to-understand format — accurate, clear, and always up to date",
    guaranteeOwner: "engine-behavior-pattern",
    scopeNote: "This repo already has an approved foundation scaffold for VendorIQ (backend/src/services/vendorIngestion/, directives/vendor_ingestion_stage.md) that explicitly excludes “VendorIQ scoring or trade-secret methodology” from any implementation artifact. This blueprint follows the same boundary: the Behavior Pattern Engine is specified as a contract only — its internal scoring formulas are intentionally not designed or disclosed here."
  },

  components: [
    {
      id: "frontend-web-app",
      name: "Frontend Web App",
      category: "day-one",
      layer: "Frontend",
      summary: "The screen a job seeker uses to log an interaction with a recruiter and see that recruiter's behavior history in plain language.",
      words: ["web app", "display ... in a simple, easy-to-understand format"],
      persists: false,
      usesAI: false,
      userFacing: true
    },
    {
      id: "auth-session",
      name: "Auth & Session Layer",
      category: "day-one",
      layer: "Auth",
      summary: "Makes sure each job seeker only ever sees and edits their own tracked recruiters — nobody else's.",
      words: ["job seekers (individual users tracking their own picture)"],
      persists: true,
      usesAI: false,
      userFacing: false
    },
    {
      id: "backend-api",
      name: "Backend API (Express Routes)",
      category: "day-one",
      layer: "Backend",
      summary: "The front door for every request — routes a new interaction to be saved, or a dashboard request to be answered.",
      words: ["capture and display (the two operations every request is one of)"],
      persists: false,
      usesAI: false,
      userFacing: false
    },
    {
      id: "vendor-ingestion",
      name: "Vendor Ingestion Stage",
      category: "day-one",
      layer: "Backend",
      summary: "Checks that a new interaction record is well-formed before anything else touches it, so bad data never corrupts a vendor's history.",
      words: ["reliably capture", "reuses the already-approved vendor_ingestion_stage in this repo"],
      persists: false,
      usesAI: false,
      userFacing: false,
      note: "Existing scaffold, reused from backend/src/services/vendorIngestion/."
    },
    {
      id: "normalization",
      name: "Normalization Stage",
      category: "day-one",
      layer: "Backend",
      summary: "Converts every accepted interaction — however it arrived — into one consistent internal shape, so the Behavior Pattern Engine never has to special-case its inputs.",
      words: ["clear, trustworthy picture (one picture requires one consistent shape)"],
      persists: false,
      usesAI: false,
      userFacing: false
    },
    {
      id: "engine-behavior-pattern",
      name: "Behavior Pattern Engine",
      category: "day-one",
      layer: "Backend",
      summary: "Recomputes a vendor's behavior pattern from their complete interaction history every time a new event lands, so what's displayed is never stale.",
      words: ["accurate, clear, and always up to date", "how each one behaves over time"],
      persists: false,
      usesAI: false,
      userFacing: false,
      guaranteeComponent: true,
      note: "Contract only. Internal scoring methodology is proprietary — see idea.scopeNote."
    },
    {
      id: "database",
      name: "Vendor & Interaction Database",
      category: "day-one",
      layer: "Data",
      summary: "Keeps a permanent record of every recruiter, every logged interaction, and each vendor's current computed pattern, so nothing is lost between visits.",
      words: ["track ... over time (state that must outlive a single session)"],
      persists: true,
      usesAI: false,
      userFacing: false
    },
    {
      id: "message-upload",
      name: "Message Upload Intake",
      category: "deferred",
      layer: "Backend",
      summary: "Lets a job seeker optionally hand VendorIQ a compiled file of recruiter messages instead of logging interactions one at a time.",
      words: ["upload a compiled message file for aggregation"],
      persists: false,
      usesAI: false,
      userFacing: true,
      phase: "Phase 2 (deferred, optional)"
    },
    {
      id: "ai-extraction",
      name: "AI Message Extraction Layer",
      category: "deferred",
      layer: "AI",
      summary: "Reads the uploaded messages and pulls out structured interaction events by understanding what each message means, then feeds them through the same ingestion path as manual entries.",
      words: ["organize recruiter messages ... for aggregation"],
      persists: false,
      usesAI: true,
      userFacing: false,
      phase: "Phase 2 (deferred, optional)"
    }
  ],

  diagram: {
    mermaid: "flowchart TD\n    User([\"Job Seeker\"])\n    Auth[Auth and Session Layer]\n    Frontend[Frontend Web App]\n    API[\"Backend API - Express Routes\"]\n    Ingest[Vendor Ingestion Stage]\n    Norm[Normalization Stage]\n    Engine[\"Behavior Pattern Engine (contract only)\"]\n    DB[(Vendor and Interaction Database)]\n\n    User -->|\"signs in\"| Auth\n    Auth -->|\"authenticated session\"| Frontend\n    User -->|\"logs a recruiter interaction\"| Frontend\n    Frontend -->|\"new interaction submission\"| API\n    API -->|\"raw interaction record\"| Ingest\n    Ingest -->|\"schema-validated record\"| Norm\n    Norm -->|\"canonical interaction event\"| DB\n    DB -->|\"new event stored\"| Engine\n    Engine -->|\"reads full vendor event history\"| DB\n    Engine -->|\"writes updated behavior pattern\"| DB\n    API -->|\"requests vendor profile\"| DB\n    DB -->|\"vendor profile plus behavior pattern\"| API\n    API -->|\"behavior summary\"| Frontend\n    Frontend -->|\"clear, up-to-date picture\"| User\n\n    subgraph Future[\"Phase 2 (Deferred, Optional)\"]\n        Upload[Message Upload Intake]\n        Extract[AI Message Extraction Layer]\n    end\n    User -.->|\"uploads compiled message file (future)\"| Upload\n    Upload -.->|\"raw message text\"| Extract\n    Extract -.->|\"extracted interaction events (by meaning)\"| API",
    interpretation: "Every write passes through validation and normalization before the engine ever sees it, and every read comes back through the same API — so the picture on screen is always built from clean, current data, and Phase 2 (dashed) plugs into the exact same path without changing anything downstream."
  },

  dataFlow: {
    steps: [
      { n: 1, actor: "Job Seeker", component: "auth-session", action: "Signs in", detail: "Auth & Session Layer verifies the job seeker and hands the Frontend an authenticated session scoped to their own data only." },
      { n: 2, actor: "Job Seeker", component: "frontend-web-app", action: "Logs a recruiter interaction", detail: "The job seeker records what happened with a vendor (e.g. contacted, responded, scheduled, ghosted, offered) in the Frontend Web App." },
      { n: 3, actor: "Frontend Web App", component: "backend-api", action: "Submits the interaction", detail: "The Frontend sends the new interaction to the Backend API." },
      { n: 4, actor: "Backend API", component: "vendor-ingestion", action: "Validates the record", detail: "The Vendor Ingestion Stage checks the record against its schema; malformed submissions are rejected with a structured, field-level reason — never silently dropped." },
      { n: 5, actor: "Vendor Ingestion Stage", component: "normalization", action: "Normalizes the record", detail: "The Normalization Stage reshapes the validated record into the one canonical event format the rest of the system understands." },
      { n: 6, actor: "Normalization Stage", component: "database", action: "Persists the event", detail: "The canonical event is written to the Vendor & Interaction Database, permanently, keyed to that vendor." },
      { n: 7, actor: "Database", component: "engine-behavior-pattern", action: "Triggers recompute", detail: "Storing a new event triggers the Behavior Pattern Engine, which reads that vendor's entire interaction history and writes back an updated behavior pattern — this is what keeps the picture always up to date instead of a stale snapshot." },
      { n: 8, actor: "Job Seeker", component: "frontend-web-app", action: "Opens the dashboard", detail: "The Backend API reads the vendor's profile and current behavior pattern from the database and returns it to the Frontend, which renders it in plain language." },
      { n: 9, actor: "Job Seeker (future)", component: "message-upload", action: "Uploads a compiled message file (Phase 2, optional)", detail: "The Message Upload Intake hands the file to the AI Message Extraction Layer, which parses it into structured interaction events and submits them through the exact same Backend API → Ingestion → Normalization path used by manual entries." }
    ],
    sequenceMermaid: "sequenceDiagram\n    actor JS as Job Seeker\n    participant FE as Frontend Web App\n    participant API as Backend API\n    participant ING as Vendor Ingestion Stage\n    participant NORM as Normalization Stage\n    participant ENG as Behavior Pattern Engine\n    participant DB as Vendor and Interaction Database\n\n    JS->>FE: logs a recruiter interaction\n    FE->>API: new interaction submission\n    API->>ING: raw interaction record\n    ING->>NORM: schema-validated record\n    NORM->>DB: canonical interaction event, store\n    DB->>ENG: new event available\n    ENG->>DB: read full vendor event history\n    ENG->>DB: write updated behavior pattern\n    API->>DB: request vendor profile\n    DB->>API: vendor profile plus behavior pattern\n    API->>FE: behavior summary\n    FE->>JS: clear, up-to-date picture",
    interpretation: "Nothing reaches the database unvalidated and unnormalized, and nothing the job seeker sees skips a fresh recompute — the two guarantees (accurate, always up to date) are enforced on every single request, not just at signup."
  },

  buildOrder: {
    phases: [
      {
        id: "phase-1",
        name: "Phase 1 — Core Capture",
        window: "Weeks 1–2",
        start: "2026-08-10",
        durationDays: 12,
        builds: ["auth-session", "backend-api", "vendor-ingestion", "frontend-web-app"],
        proves: "A job seeker can create an account and log a recruiter interaction that persists correctly — and is rejected cleanly, with a specific reason, when malformed."
      },
      {
        id: "phase-2",
        name: "Phase 2 — Behavior Pattern Engine",
        window: "Weeks 3–4",
        start: "2026-08-22",
        durationDays: 15,
        builds: ["normalization", "engine-behavior-pattern"],
        proves: "Logged events reliably turn into an accurate, current behavior pattern — the day-one guarantee sentence, satisfied end to end. (Engine ships as a contract; internal scoring logic is a separate, access-controlled effort.)"
      },
      {
        id: "phase-3",
        name: "Phase 3 — Trustworthy Display",
        window: "Weeks 5–6",
        start: "2026-09-06",
        durationDays: 12,
        builds: ["database"],
        proves: "The computed pattern reads as a simple, clear, trustworthy picture to a non-technical job seeker — not a raw data dump. This phase gates the day-one release."
      },
      {
        id: "phase-4",
        name: "Phase 4 — Deferred Message Aggregation",
        window: "Weeks 7–9 (optional, post-launch)",
        start: "2026-09-19",
        durationDays: 15,
        builds: ["message-upload", "ai-extraction"],
        proves: "Optional automated ingestion produces interaction events of the same quality as manual entry, without changing anything downstream of the Backend API."
      }
    ],
    ganttMermaid: "gantt\n    title VendorIQ Build Order\n    dateFormat  YYYY-MM-DD\n    axisFormat  %b %d\n    section Phase 1 - Core Capture\n    Auth and Session Layer            :p1a, 2026-08-10, 5d\n    Backend API and Vendor Ingestion   :p1b, after p1a, 7d\n    Frontend logging form              :p1c, after p1a, 7d\n    section Phase 2 - Behavior Pattern Engine\n    Normalization Stage                :p2a, after p1b, 5d\n    Behavior Pattern Engine contract   :p2b, after p2a, 10d\n    section Phase 3 - Trustworthy Display\n    Dashboard and history views        :p3a, after p2b, 7d\n    Vendor comparison view             :p3b, after p3a, 5d\n    section Phase 4 - Deferred (optional)\n    Message Upload Intake              :p4a, after p3b, 5d\n    AI Message Extraction Layer        :p4b, after p4a, 10d",
    interpretation: "Phase 3 is the make-or-break phase — it's where a working engine either does or doesn't read as trustworthy to a real job seeker — and Phase 4 is deliberately last and optional, matching the paragraph's own “may optionally allow” framing."
  },

  assumptions: [
    {
      assumption: "Job seekers manually log interactions on day one; there is no inbox/API integration yet.",
      impact: "The system's accuracy is bounded by what users diligently log. Since the AI extraction path is deferred, this keeps day-one scope small and auditable — but the tradeoff is explicit and known, not hidden."
    },
    {
      assumption: "“Behavior pattern” means a set of metrics computed from discrete event types (e.g. contacted, responded, scheduled, ghosted, rejected, offered).",
      impact: "If the real metric set differs, only the Behavior Pattern Engine's contract (its input event vocabulary) needs revision — the rest of the architecture is unaffected."
    },
    {
      assumption: "The Behavior Pattern Engine's internal scoring methodology is proprietary, per this repo's existing convention.",
      impact: "This blueprint defines the engine's contract only. If that convention changes, a separate, access-controlled design pass is needed for the actual scoring logic — not a change to this architecture."
    },
    {
      assumption: "Each job seeker's tracked data is private to them; there is no cross-user or crowdsourced vendor reputation pool on day one.",
      impact: "If crowdsourcing is wanted later, that's a compliance/privacy-relevant redesign (a governance-boundary decision requiring escalation per CLAUDE.md), not an incremental addition."
    },
    {
      assumption: "“Web app” means a responsive browser app, not a native mobile app.",
      impact: "Build targets are web-only; no app-store distribution, push notifications, or offline-mobile design is assumed."
    }
  ],

  coverage: {
    covered: [
      "An individual job seeker privately logging and viewing their own recruiter interactions.",
      "Reliable, validated capture of interaction data (reusing the repo's existing vendor_ingestion_stage).",
      "An always-current behavior pattern, recomputed on every new event.",
      "A simple, plain-language display of that pattern.",
      "An explicit, optional Phase 2 path for uploading compiled message files."
    ],
    notCovered: [
      "Cross-user or crowdsourced recruiter reputation — this design only covers an individual job seeker's private view, not a shared “how does this recruiter treat everyone” pool.",
      "The Behavior Pattern Engine's actual scoring formulas — deliberately excluded; see idea.scopeNote.",
      "Phase 2's exact extraction mechanics — which NLP approach, which message sources, and what accuracy guarantee the AI Message Extraction Layer offers are open questions, not designed here.",
      "Notifications or alerts (e.g. “this recruiter has gone quiet for two weeks”) — not mentioned in the source paragraph, not included.",
      "Monetization, admin tooling, or multi-org/enterprise features — out of scope; the paragraph describes an individual job seeker's tool."
    ]
  },

  openQuestion: {
    question: "Should the Behavior Pattern Engine's scoring methodology stay permanently proprietary, or will it eventually need to be disclosed (e.g. to job seekers, for trust, or to regulators, for fairness/audit)?",
    branchA: {
      label: "Stays proprietary",
      consequence: "The Engine remains a black-box contract forever. VendorIQ can iterate on scoring freely without a public spec to maintain, but job seekers must trust the output without seeing the method — and any future “why did this vendor score low” feature is blocked."
    },
    branchB: {
      label: "Becomes disclosed / auditable",
      consequence: "The Engine needs an explainability layer (e.g. “why this score” breakdowns) and the scoring logic needs a documented, versioned spec — a real design and engineering effort, not a docs change. This is the single decision most likely to reshape the architecture, since it adds a new user-facing surface and a new contract."
    }
  }
};
