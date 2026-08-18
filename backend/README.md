# backend/

Node.js + Express + TypeScript execution layer (Architecture Layer 3). Deterministic, testable services — never the orchestration or planning layer.

## Structure

| Subfolder | Purpose |
|---|---|
| `src/services/` | Business logic services |
| `src/services/agents/` | Agent orchestration (openclaw, intelligence, marketing) |
| `src/intelligence/` | Planning, prompt generation, decision engines |
| `src/scripts/` | One-off operational scripts, single responsibility |
| `src/seeds/` | Seed data and migrations |
| `src/routes/` | Express route definitions |
| `src/models/` | Sequelize models |
| `src/config/`, `src/middleware/` | Infra wiring |

See root `CLAUDE.md` → Folder Responsibilities for the full contract. No business logic belongs outside this tree; no orchestration/planning belongs inside it.
