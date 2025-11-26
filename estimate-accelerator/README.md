# Estimate Accelerator (Web)

OCR-enhanced PWA for turning RFP packages into structured take-offs with historical pricing signals. Ships as a static app — open `web/index.html` locally or host via Netlify.

## Highlights
- **Document ingestion**: Text, PDF, DOCX, and image uploads with Tesseract OCR fallback for scanned specs.
- **AI-style take-off**: Web Worker parses quantities, units, and descriptions, classifying them into electrical categories with confidence scoring.
- **Pricing intelligence**: `web/data/historical-bids.json` seeds benchmark pricing, win rates, and segment insights that surface automatically after each run.
- **Dictionaries**: Industry presets plus per-browser overrides for scope, long-lead, risks, and clarifications.
- **Exports**: CSV/JSON summary exports, clipboard copy, and dedicated take-off CSV.

## Customizing Historical Data
Update `web/data/historical-bids.json` with your bid history. Each record supports:

```json
{
  "item": "MV Feeder",
  "unit": "set",
  "avgUnitPrice": 64000,
  "avgLaborHours": 24,
  "segments": ["Industrial"],
  "winRate": 0.58,
  "keywords": ["mv feeder","medium voltage cable"]
}
```

The UI automatically recalculates segment leaderboards and price hints on load.

## TODO
- Wire OCR/take-off output to server-side AI models (OpenAI, Claude) for richer entity extraction.
- Push structured take-offs into estimating or ERP systems (Acumatica, InEight, etc.).
- Multi-user auth, job folders, and revision history aligned with the CRM experience.
- XLSX export + drag/drop BOM editing canvas.

