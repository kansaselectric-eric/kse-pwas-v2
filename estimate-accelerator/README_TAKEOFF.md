## Estimate Accelerator Takeoff Pipeline

This module is **isolated** from the CRM. It has its own API + database and includes **guarded destructive reset** logic.

### Boundaries / CRM Safety
- All persistence, APIs, and pipeline code live under `estimate-accelerator/`.
- The Estimate Accelerator API uses **only** `ESTACC_DATABASE_URL`.
- Destructive DB operations refuse to run unless the database name contains one of:
  - `estacc`, `estimate`, `estimate_accelerator`, `estimate-accelerator`
- Destructive DB reset additionally refuses to run if it detects CRM-like tables (e.g. `accounts`, `opportunities`).

### Database
- **Migrations**: `estimate-accelerator/api/migrations/*.sql`
- **Reset (destructive)**: `npm run estacc:db:reset` (requires `ESTACC_DB_RESET_CONFIRM=YES`)
- **Migrate**: `npm run estacc:db:migrate`

Schema highlights (see `migrations/001_init.sql`):
- `projects`
- `plan_sets`, `plan_set_sheets`
- `extraction_sessions`, `extraction_artifacts`
- `takeoff_items`, `takeoff_edits`
- `labor_assemblies`, `productivity_modifiers`, `project_modifier_overrides`
- `takeoff_labor_lines`
- `symbol_library`, `assembly_symbol_mappings`
- `bids`, `actuals`, `variance_events`

### Automatic Takeoff Workflow (upload → takeoff)
1. Web UI renders PDF pages at high DPI (pdf.js) and POSTs each page image to:
   - `POST /api/ocr/vision`
   - Includes `sessionId`, `pageIndex`, `fileName`
2. API persists artifacts + uses OpenAI Responses API (vision) with `text.format` JSON schema output.
3. When user clicks **Analyze**, UI calls:
   - `POST /api/estimate/takeoff` with `{ sessionId }`
4. Server pipeline:
   - Reads stored `page_render` artifacts
   - Page region detection → crop → tile extraction (2x2 then 3x3 escalation)
   - De-dupe items and persist `takeoff_items`
   - Compute labor using `labor_assemblies` + `productivity_modifiers` and persist `takeoff_labor_lines`
5. Export:
   - `GET /api/estimate/takeoff/:sessionId.tsv`

### Labor hours computation
For each `takeoff_item`:
- **Base hours** = `qty * labor_assemblies.hours_per_unit`
- **Modifiers** applied in order:
  - multiplier: `total *= factor`
  - additive: `total += factor`

### Tests
From `estimate-accelerator/api`:
- `npm test`
Includes minimal tests for:
- migration file presence/content
- labor math
- TSV generation
