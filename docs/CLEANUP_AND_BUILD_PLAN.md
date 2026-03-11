# Rise-and-Shine: Repo Review & Cleanup / Build Plan

**Date:** 2026-03-10  
**Purpose:** Full repo review, cleanup recommendations, and a concrete plan to get the app on track for building out features.

---

## 1. What This Repo Is

- **Product:** Personal “execution OS” — daily Next-3 queue, backlog, AI planner refinement, onboarding, analytics, health/ideas/notes.
- **Stack:** Next.js 16 (Pages Router), React 19, Supabase, Tailwind v4, Recharts, OpenAI for planner.
- **Deploy:** Vercel from `main` → https://rise-and-shine-hazel.vercel.app

**Current health:** Build passes. Lint has 10 warnings (unused constants in `AiPlannerGuidance.js` — fixable). Verification scripts exist (`verify:scoring`, `verify:queue`, `verify:planner`, etc.) and are part of `verify:release`.

---

## 2. Repo Structure (Summary)

| Area | Location | Notes |
|------|----------|--------|
| Routes & API | `pages/` | today, backlog, templates, analytics, onboarding, weekly-review, vision, health, ideas, notes, login; APIs under `api/` |
| Data & logic | `lib/` | `db.js` (large), scoring, today-queue, planner-apply*, planner-refinement-events, task-enrichment, api-auth, projectIngestion |
| UI | `components/` | DashboardLayout, ProgressToOutcome, QueueBehaviorHelper, SubtaskOrchestrator, SectionCard, AiPlannerGuidance, Modal, OutcomeExplanation |
| Docs | `docs/` | Canonical specs and reports (see §3) |
| Prompts/copy | `packets/` | 141 files (CURSOR_PROMPT_*.txt, CURSOR_PACKET_*.md) — copy bundles that were inlined into AiPlannerGuidance.js |
| Scripts | `scripts/` | Verification (scoring, queue, planner, refinement-events, task-enrichment), ingest-project-folders |
| Config | Root | next.config.ts, tsconfig.json, postcss, eslint flat config |

---

## 3. Documentation Cleanup

### 3.1 Duplicate / Confusing Filenames

- **PROJECT_SPEC.md**  
  - **Root:** Feature-focused (“Rise & Shine Dashboard — Project Spec”: tasks, tags, daily templates, key outcomes algorithm).  
  - **docs/:** Different content (“Strategic Life Operating System”, Vision/Situation/Action engines).  
  - **Recommendation:** Pick one as the single “product spec”. Prefer keeping the **root** version as the main feature spec (it matches README and CURRENT_STATE_SNAPSHOT) and either rename `docs/PROJECT_SPEC.md` to e.g. `docs/VISION_AND_STRATEGY.md` or merge the vision/strategy intro into it and remove the root duplicate. Then update README and CURRENT_STATE_SNAPSHOT to point at the chosen path.

- **ARCHITECTURE_NOTES.md**  
  - **Root:** Short UX/vision paragraph.  
  - **docs/:** Technical decomposition plan for `lib/db.js`.  
  - **Recommendation:** Treat **docs/ARCHITECTURE_NOTES.md** as the canonical architecture doc. Replace root `ARCHITECTURE_NOTES.md` with a one-line pointer to `docs/ARCHITECTURE_NOTES.md`, or delete the root file and add the pointer in README.

- **SCORING_MODEL.md**  
  - Exists at **root** and in **docs/**. Confirm they are identical; if so, keep only `docs/SCORING_MODEL.md` and remove root, with README referencing `docs/`.

### 3.2 Root-Level Status / One-Off Docs

- **CURRENT_STATE_SNAPSHOT.md** — Useful; keep. Update “Canonical Source of Truth” paths to use repo-relative paths (e.g. `PROJECT_SPEC.md`, `docs/DEV_AGENT_REPORT.md`) and the single canonical PROJECT_SPEC path you choose.
- **V3_STATUS.md** — Overlaps with DEV_AGENT_REPORT and CURRENT_STATE_SNAPSHOT. Either fold into DEV_AGENT_REPORT or archive (e.g. `docs/archive/`) and link from DEV_AGENT_REPORT.
- **RELEASE_CHECKLIST.md** — Good; keep at root.
- **PROJECT_NORTH_STAR.md** — Keep at root as the strategy north star (per DEV_AGENT_REPORT).

### 3.3 Canonical Doc Map (After Cleanup)

Suggested single sources of truth:

- **Strategy / vision:** `PROJECT_NORTH_STAR.md`
- **Product / features:** One `PROJECT_SPEC` (root or docs, after merge/rename)
- **Scoring:** `docs/SCORING_MODEL.md`
- **Architecture / db decomposition:** `docs/ARCHITECTURE_NOTES.md`
- **Execution status / iterations:** `docs/DEV_AGENT_REPORT.md`
- **Schema / data:** `docs/SCHEMA_ALIGNMENT.md`, `docs/DATA_MODEL.md`
- **Algorithms:** `docs/NEXT_ACTION_ALGO_V2.md`
- **Onboarding:** `docs/ONBOARDING_FLOW.md`
- **Releases:** `RELEASE_CHECKLIST.md`

---

## 4. Code Cleanup

### 4.1 Lint

- **AiPlannerGuidance.js:** 10 unused constants (AUTONOMY_HEADLINE, AUTONOMY_SAFE_PAUSE_RULE, etc.). Fix by either using them in the UI (e.g. section titles) or prefixing with `_` so they are intentionally reserved and lint-clean.

### 4.2 Data Layer (lib/)

- **lib/db.js** is large (~900 lines) and multi-domain (user, templates, tasks, events, daily_plans, ideas, health, etc.). This matches the risk called out in PROJECT_NORTH_STAR and ARCHITECTURE_NOTES.
- **Planner refinement events:** Two modules:
  - `lib/planner-refinement-events.js` — event semantics and `countRefinementActions` (used by analytics).
  - `lib/db/planner-refinement-events.js` — DB query `getPlannerRefinementEventsInRange`; re-exported from `lib/db.js`.
- Naming is easy to confuse. Recommendation: keep both but make the split obvious (e.g. add a short comment at the top of each: “Event type mapping and counts” vs “DB query for planner refinement events in range”). No need to rename immediately if you proceed with the planned `lib/db/*` decomposition.

- **Planner apply:** Multiple coordinated modules (`planner-apply.js`, `planner-apply-transaction.js`, `planner-apply-rpc.js`, `planner-apply-policy.js`) used by `pages/api/planner/apply.js`. Structure is clear; follow the architecture plan to move toward atomic apply (transaction/RPC) and reduce rollback complexity.

### 4.3 packets/ and AiPlannerGuidance.js

- **packets/:** 141 prompt/copy files that were effectively inlined into `components/AiPlannerGuidance.js`. The component is the runtime source of truth; the packets are useful as edit history and for regenerating copy.
- **Recommendation:** Keep `packets/` but treat it as reference/authoring, not loaded at runtime. Optionally add a one-line README in `packets/` explaining that the live strings live in `components/AiPlannerGuidance.js`. Do not duplicate edits in both places long term — either edit the component and periodically sync to packets, or move copy to a single data file (e.g. JSON/JS module) and have the component import it.

### 4.4 RiseAndShine/ Folder

- Contains subfolders (e.g. Business, Home, Boat, Vehicles, Personal, MomandDad, RentalHouse) with READMEs. Appears to be project-folder content for ingestion (see PROJECT_FOLDER_INGESTION, ingest scripts).
- If this is sample/test data, consider adding a short README at `RiseAndShine/README.md` and ensuring it’s not deployed as part of the app. If it’s user-specific, ensure it’s in `.gitignore` or a separate repo.

### 4.5 .gitignore

- Already ignores `.env*`, `data/`, `node_modules`, `.next`, `n8n_data/config`, etc. `.worktrees/` added. No critical gaps found.

---

## 5. Architecture Priorities (From PROJECT_NORTH_STAR & ARCHITECTURE_NOTES)

1. **Decompose `lib/db.js`** into domain modules under `lib/db/*` with unchanged public interfaces (already started with planner-refinement-events).
2. **Planner apply:** Move to atomic DB writes (transaction or RPC) instead of endpoint-level rollback.
3. **Repo hygiene:** Keep runtime/build artifacts out of source of truth; docs/code only.

---

## 6. Product Priorities (From PROJECT_NORTH_STAR)

1. “Why this task now” rationale for each Next-3 item.
2. Subtask orchestration (generate → edit/approve → best to Next-3, rest to backlog).
3. AI Planner as core; consistent strategy suggestions and fallbacks.
4. Progress-to-outcome visibility in UI.
5. Progressive onboarding and queue behavior clarity.
6. Native auth baseline; plan Google/Apple.

---

## 7. Cleanup Plan (Ordered)

| Phase | Action | Outcome |
|-------|--------|---------|
| **A. Quick wins** | Fix 10 lint warnings in `AiPlannerGuidance.js` (prefix unused constants with `_` or use them). | `npm run lint` clean. |
| **A** | Decide canonical PROJECT_SPEC (root vs docs) and rename/merge so there’s one. Update README and CURRENT_STATE_SNAPSHOT. | Single source of truth for “product spec”. |
| **A** | Point root ARCHITECTURE_NOTES to `docs/ARCHITECTURE_NOTES.md` or remove root copy. | One place for architecture notes. |
| **B. Docs** | If root and docs SCORING_MODEL.md are identical, keep only `docs/SCORING_MODEL.md`, update refs. | No duplicate scoring doc. |
| **B** | Archive or merge V3_STATUS into DEV_AGENT_REPORT; link from DEV_AGENT_REPORT. | Fewer overlapping status docs. |
| **B** | Use repo-relative paths in CURRENT_STATE_SNAPSHOT and README. | Portable references. |
| **C. Code** | Add one-line “purpose” comments to `lib/planner-refinement-events.js` and `lib/db/planner-refinement-events.js`. | Clear split between semantics and DB. |
| **C** | Optional: Add `packets/README.md` explaining that live copy is in `components/AiPlannerGuidance.js`. | Clear ownership of copy. |
| **D. Later** | Proceed with `lib/db/*` extraction in small PRs; then atomic planner apply. | Lower risk, clearer boundaries. |

---

## 8. Build-Out Plan (Next Steps for the App)

1. **Run quality gates:** `npm run verify:release` (or at least `lint` + `build`) before and after cleanup.
2. **Product:** Tackle North Star items in order: e.g. “why this task now” and queue behavior clarity first, then subtask orchestration and progress-to-outcome.
3. **Architecture:** Continue db decomposition and planner-apply atomicity as you touch those areas; no need to do everything upfront.
4. **Docs:** After cleanup, keep CURRENT_STATE_SNAPSHOT and DEV_AGENT_REPORT updated so the next agent or developer sees a single narrative (strategy in North Star, status in DEV_AGENT_REPORT, spec in one PROJECT_SPEC).

---

## 9. One-Line Summary

**Cleanup:** Fix lint, consolidate duplicate/overlapping docs (one PROJECT_SPEC, one ARCHITECTURE_NOTES, one SCORING_MODEL), clarify root vs docs roles, then proceed with db decomposition and atomic planner apply in small steps. **Build-out:** Follow PROJECT_NORTH_STAR product priorities and RELEASE_CHECKLIST for each milestone.
