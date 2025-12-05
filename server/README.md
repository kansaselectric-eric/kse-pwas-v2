# KSE Tools Server (Node/Express)

Local proxy and utility APIs:
- POST /api/teams/notify: Send a Teams card. Body: { title, text, webhook? }
- POST /api/graph/token: Get a client credential token for Microsoft Graph (reads env)
- GET /api/health: Health check

## Environment
- Copy `env.example` ➜ `.env` in this directory and fill in secrets.
- `DATABASE_URL` (Postgres connection Prisma should use)
- `PORT`
- `TEAMS_WEBHOOK_URL` (optional default)
- `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` (Graph)
- `ACU_BASE_URL`, `ACU_TOKEN`, `ACU_TENANT` (optional)
- `OPENAI_API_KEY`, `OPENAI_VISION_MODEL` (optional, defaults to gpt-5.1), `OPENAI_BASE_URL`

## Prisma & Database
1. Install dependencies (`npm install` from repo root).
2. Set `DATABASE_URL` in `.env` to the populated CRM Postgres instance.
3. For **existing CRM data**, run `npm run prisma:db:pull` after connecting so the Prisma client stays in sync without modifying any records.
4. Run `npm run prisma:generate` whenever the schema or env changes.
5. For new databases run `npm run prisma:migrate:deploy` (or `npm run prisma:migrate:dev` locally) to apply `prisma/migrations/202412051600_init`.
6. Use `npm run prisma:studio` for read-only inspection. Avoid destructive commands such as `prisma migrate reset` or `prisma db push` against production—they would wipe the populated CRM tables.

## Scripts
- `npm run dev` — start with tsx watch
- `npm run build && npm start` — build and run
- `npm run prisma:generate` — regenerate the Prisma client
- `npm run prisma:migrate:dev|deploy` — evolve the schema
- `npm run prisma:db:pull` — refresh schema from an existing database
- `npm run prisma:studio` — inspect data safely




