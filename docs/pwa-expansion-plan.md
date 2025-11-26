## PWA Expansion Plan

### CRM Baseline Guardrails
- Secure session handling: server-issued JWT + refresh flow, Dexie-backed offline cache, queue with retry/backoff.
- AI copilots wired to `/api/ai/*` routes for transcription, extraction, and narration.
- Observability: Sentry hooks, structured logging, network state badges throughout the shell.
- Export surface: CSV/JSON + copy-to-clipboard for every major view.

### Estimate Accelerator
- **Done (Phase 1)**: OCR ingestion, worker-based take-off extraction, historical pricing dataset, AI confidence badges, CSV exports.
- **Next**:
  - Push take-off payloads to `server/src/routes/ai.ts` for LLM refinement + unit normalization.
  - Add Acumatica quote stub endpoint so estimators can publish scoped BOMs.
  - Multi-user queue with Dexie + background sync to support field scans offline.

### Field Reports
- Extend existing IndexedDB queue with CRM-style auth (token reuse, `/api/auth/me`).
- Hook photo/audio attachments to server-side AI summarization (safety, manpower deltas).
- Add dashboard cards (per-project streaks, unresolved safety flags) using CRM component patterns.

### Project Management React App
- Reuse CRM Dexie wrapper for offline board edits.
- Embed CRM AI narration drawer for meeting recaps and variance explanations.
- Wire KPIs to server Graph route instead of static JSON; schedule background refresh jobs.

### Smart Contacts
- Elevate to CRM parity: auth-gated access, offline Dexie copy of contact graph, AI assistant that drafts outreach sequences.
- Add CRM-style segmentation chips, recency scoring, Teams deep links.

### Opportunity Radar / Customer Intel
- Replace Apps Script polling with server-side cron + webhook push into Dexie stores.
- Surface CRM's AI drawer for "account at risk" notices and gate reviews.
- Add map visualizations using CRM's location utilities (project lat/lng capture).

### Labor Planner
- Shift sheets logic into PWA with offline-capable staffing table; reuse CRM queue + AI to forecast overtime risk.
- Integrate with `server/src/routes/teams.ts` for roster and badge authenticators.

### BD Forecast / Estimating Mobile App
- Mirror CRM's weekly summary generator, including CSV/markdown exports and AI narration.
- Add auth + roles (BD lead vs estimator) with Dexie-cached assignments.
- Introduce shared UI kit components from `packages/ui` (button, input, toast) for visual consistency.

### Cross-App Initiatives
- Centralize auth + storage helpers (`packages/ui` or a new `packages/core`) to avoid duplicating Dexie/service-worker boilerplate.
- Create PWA-level feature flags (similar to CRM's `AUTH_DISABLED`) to toggle between demo/offline/server-backed states.
- Instrument all PWAs with consistent analytics + logging (Sentry + console wrappers).


