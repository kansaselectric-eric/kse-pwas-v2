## Architecture Overview

### Monorepo Layout
- `field-reports/`: PWA for daily reporting + Apps Script microservice (Drive/Sheets).
- `opportunity-radar/`: Apps Script for refreshing opportunities into Sheets.
- `estimate-accelerator/`: Web app to parse RFP text and extract scope.
- `smart-contacts/`: Web app for searching JSON contact data.
- `customer-intel/`, `labor-planner/`, `bd-forecast/`: Apps Script utilities.
- `docs/`: Architecture, roadmap, and security.

### PWAs
- Offline-first via Service Worker caching.
- Background Sync to retry queued uploads automatically.
- IndexedDB local storage for offline queue in `field-reports`.
- TailwindCSS via CDN for consistent styling.

### Apps Script Microservices
- Deployed as Web Apps or bound scripts.
- Field Reports service (`doPost`) receives JSON with base64 files, writes to Drive, logs to Sheets.
- Other Apps Scripts expose menu-driven operations (refresh, update) that operate on Sheets.
- CORS enabled for web-app to Apps Script communication where applicable.

### Data Flow: Field Reports
1. Field user fills report, attaches media, and submits.
2. If offline, report is saved into IndexedDB and synced when network is available or via Background Sync.
3. Apps Script receives the payload, decodes files, saves to Drive in structured project/date folders.
4. A summary row is appended to `KSE_Field_Reports` sheet.
5. Future: AI summarization runs on Apps Script/Cloud backend.

### Deployment
- Static web apps (`estimate-accelerator`, `smart-contacts`, `field-reports/mobile-app`) can be deployed to Netlify easily.
  - Set the publish directory to the respective `web/` or `mobile-app/` folder.
  - Ensure the Service Worker and `manifest.json` are accessible from the site root for each app.
- Apps Scripts:
  - Open in Google Apps Script editor, set scopes if prompted, deploy as Web App or bind to Sheets as needed.
  - For `field-reports`, copy the deployed web app URL into `app.js` and `service-worker.js`.

### Philosophy
- Simple, composable tools.
- Web-first with progressive enhancement (offline support).
- Sheets/Drive as operational backbone, upgradeable with APIs later (Acumatica, OAuth).


