# Project Folder Ingestion (Category Workspaces -> Tasks)

This adds a lightweight ingestion path from category folders into Supabase tasks.

## What it does

Script: `scripts/ingest-project-folders.mjs`

- Scans `RiseAndShine/*/inbox` for `.md` or `.txt` files
- Extracts tasks from markdown bullets/checklists
- Maps folder to category (e.g. `RentalHouse` -> `Rental House`)
- Creates missing tasks in Supabase (`status=todo`, `priority=Medium`)
- Logs `task_events` with source metadata
- Moves processed files to `RiseAndShine/*/processed`

## Required env vars (`.env.local`)

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RISE_DEFAULT_USER_ID`

## Commands

```bash
npm run ingest:projects:dry
npm run ingest:projects
```

## n8n-ready webhook trigger path

API route: `POST /api/ingest/projects`

- Optional auth: set `RISE_INGEST_TOKEN` in `.env.local`
- Send either `Authorization: Bearer <token>` or `x-rise-ingest-token: <token>`
- Body: `{ "dry_run": true|false }` (optional)

Example:

```bash
curl -X POST http://localhost:3000/api/ingest/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RISE_INGEST_TOKEN" \
  -d '{"dry_run":false}'
```

This is designed for n8n Cron/Webhook/HTTP nodes to trigger inbox ingestion safely.

## Task format examples

These lines are ingested as task titles:

```md
- [ ] Call supplier for estimate
- [ ] Review permit docs
- Draft rough budget
```

## Notes

- Duplicate protection: skips existing non-archived tasks with same title/category
- Designed to be safe to run repeatedly
- Good first step before wiring n8n webhook automation
