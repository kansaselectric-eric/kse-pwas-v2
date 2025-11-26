# KSE PM React Dashboard

Vite + React + TypeScript + Tailwind PWA showing KPIs and schedule health.

## Setup
1. Set env var for Apps Script endpoint in a `.env.local` (same dir):

```
VITE_PM_ENDPOINT=https://script.google.com/macros/s/DEPLOYED_PM_SCRIPT_URL/exec
```

2. Install deps at the monorepo root and run:

```
npm run pm:dev
```

## Build
```
npm run pm:build && npm run pm:preview
```

## Tests
```
npm -w project-management/react-app run test
```




