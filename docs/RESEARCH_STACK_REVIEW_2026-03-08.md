# RESEARCH_STACK_REVIEW_2026-03-08

Date: 2026-03-08  
Project: Rise-and-Shine  
Scope: Stack fit-for-purpose review against current North Star + MVP constraints  
Constraint posture: Lowest total cost, fastest reliable execution, avoid premature replatforming

---

## A) Executive Summary

**Verdict: PARTIAL FIT (keep current stack, but harden and simplify).**

The current stack (Next.js + Supabase + Vercel + OpenAI) is the right **MVP-now** choice for speed and cost. It already supports the core loop (onboarding → Next-3 queue → AI refinement → analytics). However, reliability and maintainability risks are concentrated in a few areas (monolithic data-access layer, mixed write semantics, auth/config fragility, and cost exposure on AI endpoints).

**Recommendation:** Do **not** replatform. Execute a focused hardening roadmap over 0–3 months, then add observability and selective modularization in 3–12 months.

---

## B) Current Stack Inventory

### Runtime / Framework
- **Node + Next.js (Pages Router)** (`next@16.1.6`, `react@19.2.3`)
- Monolith app with UI + API routes in one repo (`pages/*`, `pages/api/*`)

### Database / Data Layer
- **Supabase Postgres** via `@supabase/supabase-js`
- Data access mostly centralized in **`lib/db.js`** (multi-domain responsibilities)
- Planner atomic write function present in SQL: `db/PLANNER_APPLY_ATOMIC.sql`

### Auth
- Supabase Auth (email/password in `pages/login.js`)
- Dashboard auth via `hooks/useAuth.js`
- API auth guard via `lib/api-auth.js` using Bearer token and `auth.getUser(token)`
- Planner APIs now derive user identity from authenticated context (good direction)

### Hosting / Deployment
- **Vercel** deployment from main (README + production URL)
- API routes run as serverless functions

### Analytics
- Product analytics currently app-native via `task_events` and UI charts (Recharts)
- Planner refinement analytics tracked in-app (accepted/applied/dismissed)
- No dedicated external telemetry stack yet

### AI Integration
- OpenAI Responses API in `pages/api/planner/ai-refine.js`
- Model configurable via `PLANNER_MODEL` (fallback currently high-cost default)
- Cache layer exists (`planner_cache`) keyed by queue hash

### Automation / Integrations
- n8n noted as future capability (not critical-path runtime dependency now)
- Ingestion endpoint exists for project-folder import (`/api/ingest/projects`)

---

## C) Fit Analysis vs North Star + MVP Constraints

North Star priorities emphasize: rapid activation, clear Next-3 rationale, subtask orchestration, reliable AI suggestions, progressive onboarding, and strong reliability.

### Strong fit now
- Same-stack velocity is high for MVP shipping.
- Core product loop is implemented in one deployable surface.
- Verification scripts (`verify:*`) are unusually strong for this stage.
- Supabase + Vercel keeps ops overhead low.

### Partial fit / friction
- Reliability risk remains around planner writes and fallback behavior if RPC availability drifts.
- `lib/db.js` creates architectural drag for future features.
- AI endpoint config/auth failures directly impact core promise (already reflected in North Star priority #5).
- Queue + scoring + UI rationale consistency needs stronger deterministic guardrails.

### Conclusion
- **Fit for MVP delivery: yes.**
- **Fit for growth without hardening: no.**
- Therefore: **partial fit**.

---

## D) Cost Profile

## 1) Development Cost
- **Low-to-moderate** now (single JS/TS web stack, one repo, unified deploy surface).
- Cost rises if monolith coupling continues (slower changes, regression risk, more rework).

## 2) Infrastructure Cost (MVP)
- Vercel + Supabase can remain low at early stage.
- Biggest variable spend is AI calls.
- Current architecture can operate very cheaply if model selection/rate limits/caching are strict.

## 3) Scaling Cost
- App and DB will scale adequately for early growth.
- AI cost can outpace infra quickly if not budget-capped.
- Serverless/API cold starts and DB hotspots become meaningful at higher DAU but not immediate blockers.

## 4) Operational Complexity
- Currently moderate; would become high if fallback semantics and monolithic data layer remain unchanged.
- Best path: keep platform, reduce internal complexity.

---

## E) Reliability / Scalability Risks

1. **`lib/db.js` coupling hotspot** (multi-domain module).
2. **Planner write-mode divergence risk** (RPC atomic + rollback fallback paths).
3. **AI refine endpoint failure sensitivity** (auth/config/model output correctness).
4. **Cost blowout risk** from AI default model + no explicit rate-budget envelope.
5. **Ingestion endpoint security posture** depends on token configuration discipline.
6. **Limited observability** for planner write mode/fallback frequency and AI failure taxonomy.
7. **Queue behavior trust risk** if scoring/selection and “why chosen” rationale diverge over time.

---

## F) Recommended Stack Path in Phases

## MVP-now (0–3 months)
**Keep:** Next.js Pages Router, Supabase, Vercel, OpenAI integration pattern.  
**Change:** reliability guardrails + cost controls + bounded modularization.

- Enforce planner atomic RPC as production-like invariant.
- Add endpoint-level rate limits and per-user/day AI budget caps.
- Set cheap default planner model and explicit fallback order.
- Complete `lib/db.js` decomposition behind compatibility exports (no big-bang rewrite).
- Add operational telemetry for planner `write_mode`, AI error classes, and queue refill lifecycle.

## Growth (3–12 months)
**Keep:** Platform choices unless usage/profile proves otherwise.  
**Evolve:** stronger boundaries and observability.

- Move from “module by file” to “module by domain” (tasks/planner/profile/events).
- Add background job handling only where needed (timeouts/retries/batch analytics), not full re-architecture.
- Add social auth (Google/Apple) on existing Supabase auth foundation.
- Introduce SLA-style product metrics (activation completion, AI suggestion success, queue stability).

## Scale (>12 months, only if needed)
Only trigger when validated by load/cost/SLA pain.

- Consider separating planner compute service if API latency/cost isolation requires it.
- Consider read replicas/caching layers if analytics or feed reads become heavy.
- Keep Postgres/Supabase unless concrete limits are reached.

---

## G) Alternatives Considered (and why not now)

1. **Replatform to microservices now**  
   - Not chosen: high engineering overhead, slows MVP learning, unnecessary at current stage.

2. **Move off Vercel/Next to custom containers immediately**  
   - Not chosen: raises ops burden without near-term product upside.

3. **Replace Supabase with bespoke backend**  
   - Not chosen: would sacrifice speed and built-in auth/data tooling.

4. **Remove AI planner and ship deterministic-only planner**  
   - Not chosen: conflicts with core value proposition/North Star.

5. **Adopt heavy observability platform immediately**  
   - Not chosen: start with focused custom metrics/logging first to keep cost low.

---

## H) Top 12 Practical Recommendations (impact / effort / cost)

| # | Recommendation | Impact | Effort | Cost |
|---|---|---|---|---|
| 1 | Enforce atomic planner RPC in prod-like envs with alerting if fallback used | Very High | Medium | Low |
| 2 | Add AI endpoint rate limiting + per-user daily token/request budgets | Very High | Medium | Low-Med |
| 3 | Set low-cost default `PLANNER_MODEL` + model fallback ladder | High | Low | Very Low |
| 4 | Instrument `write_mode`, AI failure codes, queue refill events to dashboard | High | Medium | Low |
| 5 | Decompose `lib/db.js` into domain modules with compatibility facade | High | Medium | Low |
| 6 | Add contract tests for Next-3 selection/refill and planner apply invariants | High | Medium | Low |
| 7 | Add explicit “AI unavailable fallback UX” for all planner touchpoints | High | Low | Very Low |
| 8 | Require ingest token outside local dev (fail closed) | Med-High | Low | Very Low |
| 9 | Add idempotency keys for planner apply/refill endpoints | Medium | Medium | Low |
|10| Add structured config validation at startup (auth/AI/env sanity) | Medium | Low | Very Low |
|11| Add lightweight job queue only for long-running/non-interactive tasks | Medium | Medium | Low-Med |
|12| Define SLO-style product metrics tied to activation and AI success | Medium | Low | Very Low |

---

## I) Concrete Migration Guardrails (What **not** to rewrite yet)

1. **Do not rewrite Next.js Pages Router to App Router now.** No immediate ROI.
2. **Do not split into microservices now.** Keep monolith deployment simplicity.
3. **Do not replace Supabase/Postgres now.** Optimize schema/queries first.
4. **Do not add Kubernetes/complex infra now.** Cost and ops overhead are premature.
5. **Do not rebuild auth stack.** Extend Supabase auth (add providers) instead.
6. **Do not over-engineer event pipelines.** Start with focused telemetry in current stack.

---

## J) Canonical Wording Candidates for `PROJECT_NORTH_STAR.md`

If stack language is added, keep it concise and principle-driven:

### Candidate 1 (Implementation Principle)
> **Implementation principle:** Prefer the lowest-complexity stack that reliably ships the onboarding → Next-3 → AI-leverage loop; evolve architecture only when reliability, cost, or throughput data requires it.

### Candidate 2 (Reliability + Cost)
> **Technical priority:** Keep planner writes atomic and observable, keep AI suggestions budget-controlled and degradable, and avoid replatforming before validated scale constraints.

### Candidate 3 (Phase Gate)
> **Architecture phase gate:** MVP and early growth remain on the current Next.js + Supabase + Vercel foundation with modular hardening; service decomposition is deferred until measured bottlenecks justify it.

---

## Bottom Line

The current stack is the **right base** for 2026 execution goals **if** you prioritize hardening over rewriting. The fastest, cheapest path is: keep platform choices, tighten planner reliability and AI cost controls, and modularize the data layer incrementally.