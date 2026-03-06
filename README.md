# Rise-and-Shine

Personal execution OS for daily momentum: capture tasks, rank next actions, run focused daily queue, reflect weekly, and track energy/health trends.

Production: https://rise-and-shine-hazel.vercel.app

## What this app does

- **Today queue (Next-3):** surfaces the best three actions from backlog using weighted scoring.
- **Backlog + templates:** capture recurring patterns and projects.
- **Planner refinement:** AI-assisted task rewrite/effort/tag suggestions with apply + analytics events.
- **Onboarding (6-step):** identity, life domains, six-needs profile, brain dump, energy/time, strategic focus.
- **Analytics:** momentum, completion timing, planner refinement stats.
- **Health + notes + ideas:** lightweight personal operating data in one place.

## Tech stack

- Next.js (Pages Router)
- React
- Supabase (DB + API client)
- Recharts (analytics visualizations)

## Project structure

- `pages/` – routes + API endpoints
  - key routes: `today`, `backlog`, `templates`, `analytics`, `onboarding`, `weekly-review`
  - key APIs: `api/planner/ai-refine`, `api/planner/apply`, `api/ingest/projects`
- `lib/` – DB access and core ranking/scoring logic
- `docs/` – canonical product/algorithm/docs + dev agent report
- `scripts/` – ingestion helpers

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` (or export env vars) with required values:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RISE_DEFAULT_USER_ID=

# Optional/feature flags
OPENAI_API_KEY=
PLANNER_MODEL=
RISE_PROJECT_ROOT=
RISE_INGEST_TOKEN=
```

3. Start dev server:

```bash
npm run dev
```

4. Open http://localhost:3000

## Quality gates

Run before commit/push:

```bash
npm run lint
npm run build
```

## Ingestion scripts

Project-folder ingest:

```bash
npm run ingest:projects
npm run ingest:projects:dry
npm run ingest:projects:webhook:test
```

## Deployment

Deployed on Vercel from `main` branch.

Recommended post-deploy checks:

1. `https://rise-and-shine-hazel.vercel.app/today`
2. `https://rise-and-shine-hazel.vercel.app/analytics`
3. `https://rise-and-shine-hazel.vercel.app/onboarding`
4. Browser console is clean on changed pages.

## Canonical docs

- `docs/PROJECT_SPEC.md`
- `docs/NEXT_ACTION_ALGO_V2.md`
- `docs/SCHEMA_ALIGNMENT.md`
- `docs/ONBOARDING_FLOW.md`
- `docs/DEV_AGENT_REPORT.md`

## Team workflow note

The manager loop appends every iteration outcome to `docs/DEV_AGENT_REPORT.md` with one of:

- **Code change proof:** commit hash + branch
- **No-code-change proof:** reason + verification + next step
