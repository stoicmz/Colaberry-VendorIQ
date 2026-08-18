# Architecture: Foundation Scaffold

Status: **Foundation approved and built 2026-07-30** (Session `CC-20260730-v2h7`). This document is the authoritative record of what exists, what's deliberately deferred, and why — superseding the in-chat architecture proposal it was built from.

## Tree (as built)

```
Colaberry-AI-Project/
├── CLAUDE.md
├── PROGRESS.md
├── backend/
│   ├── README.md
│   └── src/
│       ├── services/
│       │   ├── README.md
│       │   ├── agents/README.md
│       │   └── vendorIngestion/README.md
│       ├── intelligence/README.md
│       ├── scripts/README.md
│       ├── seeds/README.md
│       ├── routes/README.md
│       ├── models/README.md
│       ├── config/README.md
│       └── middleware/README.md
├── directives/
│   ├── README.md
│   └── vendor_ingestion_stage.md
├── tests/
│   ├── README.md
│   └── systemV2/README.md
└── docs/
    ├── README.md
    └── ARCHITECTURE.md
```

No `.ts`/`.js`/config files exist yet — every leaf here is documentation (`README.md` or a directive). No dependencies, no `package.json`, no git repo initialized.

## Per-folder record

| Folder | Purpose | CLAUDE.md rule | Status | Verification |
|---|---|---|---|---|
| `backend/` + subfolders | Node/Express/TS execution layer | Architecture Layer 3 (L42); Folder Responsibilities (L53-61) | **BUILT** (structure + READMEs only) | `Get-ChildItem -Recurse backend` |
| `backend/src/services/vendorIngestion/` | Home of `vendor_ingestion_stage` | One responsibility per module (L101) | **BUILT** (folder + README; code not yet written) | Directory exists; README enumerates planned modules |
| `directives/` | Layer 1 SOPs | Architecture Layer 1 (L40) | **BUILT** | `directives/vendor_ingestion_stage.md` exists |
| `directives/vendor_ingestion_stage.md` | SOP for the ingestion stage | Directive validation rule (L250-254) | **BUILT** | Contains all required sections: goal, scope, inputs, outputs, validation rules, edge cases, idempotency, Failure-First Design (4 questions), verification |
| `tests/` + `tests/systemV2/` | Layer 4 verification | Architecture Layer 4 (L43); Testing & Validation Rules (L227-254) | **BUILT** (empty — nothing to test yet) | Directory exists |
| `docs/` | Architecture notes, docs | Folder Responsibilities (L71) | **BUILT** — elevated from an earlier "LATER" call the moment this document was requested | This file |

## Deliberately NOT created this pass

| Folder | Why not | Reference |
|---|---|---|
| `/system` | Portal-owned, auto-generated. Claude must never manually create or edit it. | CLAUDE.md L76, L30 |
| `/execution` | CLAUDE.md describes this as legacy pre-Node Python reference code. This repo has no such legacy code to reference — creating an empty folder for it would be scaffolding for a hypothetical that doesn't exist here. Flagged for the DRI as a likely stale rule inherited from a template `CLAUDE.md`. | CLAUDE.md L74 |
| `/frontend` | No UI component approved yet (Week 3 component is backend-only). Creating it now would be speculative. | CLAUDE.md L62-67; "don't design for hypothetical future requirements" |
| `/scripts` (root), `/nginx`, `/preview-db-init` | No operational script, deploy config, or preview-stack Docker setup exists to justify them yet. | CLAUDE.md L68, L72, L77 |
| `/intelligence` (top-level) | Reserved/in-flight subsystem; rule itself says check `backend/src/intelligence/` first, which now exists. | CLAUDE.md L75 |
| `.claude/` | Skills (`/telemetry-emission`, `/openclaw-outreach`, `/screenshot-review`, design skills) are already invocable in this session without a local `.claude/` folder — nothing concrete to put there yet. Claude Code config changes have a dedicated `/update-config` skill; creating `.claude/settings.json` speculatively would cross into that skill's territory without a specific configuration need. | Config Ownership (CLAUDE.md L8-12) |
| `package.json` / any dependency manifest | Explicitly out of scope this pass — no dependencies installed. | User instruction |
| `git init` | Not requested. Repo currently has no version control. Flagging as a likely near-term need, not acting on it unprompted. | — |

## `vendor_ingestion_stage` — placement summary

| Artifact | Path | Status |
|---|---|---|
| Directive (SOP) | `directives/vendor_ingestion_stage.md` | Built |
| Zod schema/contract | `backend/src/services/vendorIngestion/vendorIngestionSchema.ts` | Not built — planned |
| Format parser | `backend/src/services/vendorIngestion/vendorIngestionParser.ts` | Not built — planned |
| Orchestration service | `backend/src/services/vendorIngestion/vendorIngestionService.ts` | Not built — planned |
| Unit tests | `backend/src/services/vendorIngestion/vendorIngestionService.test.ts` | Not built — planned |
| HTTP route (if HTTP-triggered) | `backend/src/routes/vendorIngestionRoutes.ts` | Not built — trigger mechanism (HTTP vs script) unconfirmed |
| Persistence model (if persisted) | `backend/src/models/VendorIngestionRecord.ts` | Not built — persistence need unconfirmed |

## Open items for next approval cycle

1. Confirm whether `vendor_ingestion_stage` is HTTP-triggered (upload endpoint) or file-drop/script-triggered — determines whether `vendorIngestionRoutes.ts` or a `backend/src/scripts/` entry point is built first.
2. Confirm whether validated records persist (needs `VendorIngestionRecord.ts` + a migration in `backend/src/seeds/`) or the stage is pure pass-through to a downstream normalization stage.
3. `Telemetry Synchronization Contract` (`BuildManifest` emission, CLAUDE.md L26-30) was not invoked for this change — there is no running backend/portal endpoint yet to receive it. Revisit once `/api/portal/project/telemetry` exists at runtime.
4. `git init` — this repo has no version control yet. Recommend doing this before any code lands, but not done here since it wasn't requested.
