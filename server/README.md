# KSE Tools Server (Node/Express)

Local proxy and utility APIs:
- POST /api/teams/notify: Send a Teams card. Body: { title, text, webhook? }
- POST /api/graph/token: Get a client credential token for Microsoft Graph (reads env)
- GET /api/health: Health check

Environment
- PORT
- TEAMS_WEBHOOK_URL (optional default)
- MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET (Graph)
- ACU_BASE_URL, ACU_TOKEN, ACU_TENANT (optional)

Scripts
- npm run dev — start with tsx watch
- npm run build && npm start — build and run



