# Field Reports

Progressive Web App (PWA) for daily field reporting plus an Apps Script backend that saves files to Drive and logs summaries to Sheets.

## PWA
- Location: `field-reports/mobile-app/`
- Features: offline capture, background sync, photos/videos/voice memos, Tailwind UI.

### Run locally
Open `index.html` in a static server (recommended) or directly in your browser. Ensure the Service Worker and manifest are accessible from the same origin.

### Configure endpoint
Edit `app.js` and `service-worker.js`, replace `YOUR_APPS_SCRIPT_WEB_APP_URL` with your deployed Apps Script web app URL.

## Apps Script Backend
- Location: `field-reports/apps-script/`
- Deploy `Code.gs` as a Web App (Execute as: User deploying; Who has access: Anyone).
- Scopes: Drive + Sheets.
- Creates Drive folder structure and appends summary rows to the `KSE_Field_Reports` sheet in the active spreadsheet.

## TODO
- AI summarization pipeline (materials, risks, safety).
- Permission management, OAuth login.
- Acumatica integration.


