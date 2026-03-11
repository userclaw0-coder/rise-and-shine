# PROJECT_NORTH_STAR — Rise-and-Shine

## Vision
Help AI-curious people improve life execution by giving clear next actions and practical AI leverage guidance they can apply immediately.

## Primary User
- Primary: General self-improvement users who want clearer daily execution and practical AI onboarding.
- Secondary: AI-curious builders/operators who want stronger execution and output without defaulting the product voice to operator complexity.

## Core Value
Fast onboarding into an AI-guided execution loop: identify the next 3 high-impact actions, break them into bite-size subtasks, surface high-leverage AI strategy suggestions for the tasks in front of the user, and teach where AI can help now and for repeatable future workflows. The product reduces decision fatigue and the “what should I do next?” loop so users feel in control of their day. Next 3 is ranked against the user’s stated outcomes and priorities so the list feels personally meaningful, not generic.

## UX Principles
- **One clear next step at a time.** Default view answers “What do I do next?” in one glance; avoid competing CTAs or multiple modes on the same screen.
- **Progressive disclosure.** Onboarding and settings reveal complexity only when needed (e.g. “Refine these 3 with AI” after basics; deeper profile later). Quick-start path reaches “Next 3 in front of you” in under 3 minutes.
- **Consistent patterns.** Same interaction patterns for complete, snooze, move to backlog, and “why this task” across Today, backlog, and planner so users build one mental model.
- **Low friction for capture.** Adding a task or idea is never more than one tap or shortcut away; categorization can be suggested or deferred.
- **Feedback on every action.** Every tap has visible feedback (checkmark, toast, state change) so users never wonder if the app registered the action.
- **Recoverable errors.** When AI or data is missing, the app still shows a usable Next 3 and a clear next step (e.g. add tasks, try again), never a dead end. Errors show one suggested next step, not a generic code.

## Interface Strategy
- **Visual clarity over decoration.** Plenty of whitespace, clear hierarchy (one primary action per card/section), limited palette so Next 3 and CTAs stand out.
- **Warm but focused.** Typography and color feel approachable, not cold or corporate; copy is concise and encouraging. One accent for primary actions.
- **Consistent component language.** Buttons, cards, and list items follow the same rules (e.g. primary = solid, secondary = outline; completed = strikethrough + check). Same spacing scale and radius across the app.
- **Motion with purpose.** Micro-interactions reinforce feedback; avoid decorative motion that doesn’t inform the user.
- **Mobile-first for key flows.** Today and capture work great on small screens; desktop enhances with larger views and keyboard shortcuts.

## MVP Done When
User can:
- complete progressive onboarding (fast value first, deeper profile refinement later) and define outcomes/tasks/needs/vision
- receive an outcome-aligned Next 3 action set with clear “why this task now” rationale on each item
- generate subtasks for larger tasks, review/edit/approve them, promote the next-best approved subtask into Next-3, and store remaining approved subtasks in backlog with parent linkage
- identify at least one explicit AI-leverage path during onboarding + first planning cycle
- view consistent AI Planner strategy suggestions for active high-leverage tasks/subtasks, with explicit fallback state if AI is unavailable
- authenticate via native sign-in/auth baseline, with planned social pathways for Sign in with Google and Sign in with Apple
- capture/add tasks quickly and review category/project pages
- execute the daily queue and complete weekly review flow
- review meaningful analytics including visible progress-to-outcome signals tied to completed tasks/subtasks
- (Post–30-day win) view an inspirational AI-generated vision board integrating their photo

## Activation North-Star Event
User completes onboarding and receives:
1. Outcome-aligned Next 3 tasks.
2. Actionable subtask breakdown for each task.
3. At least one explicit AI-leverage suggestion path.
4. Clear “why this task now” rationale for each Next-3 item.

## Offer Structure
- Free + trial entry includes full onboarding, first Next 3 tasks, subtask breakdown, and AI leverage suggestions.
- Trial window: 7 days.
- Post-trial: upsell to full subscription for ongoing planning, execution support, and deeper AI leverage.
- **Conversion hook:** User has completed at least one full Next-3 cycle and seen one AI suggestion applied; trial-end messaging reminds them of that win and offers continuity.

## Positioning
- **One-liner (for landing/marketing):** “Your next 3 actions, chosen for today — with AI that explains why and how.”
- **Differentiator:** We’re not a generic to-do app or a generic AI chat. We combine prioritized daily focus (exactly 3), AI that suggests and explains, and lightweight structure (outcomes, modes, weekly review) so you stay in motion without over-planning.

## Product Strategy Priorities (Approved 2026-03-08)
1. Add high-quality “why this task now” explanation to each Next-3 item.
2. Ship subtask orchestration flow (generate → user edit/approve → best subtask to Next-3 → remaining approved subtasks to backlog).
3. Keep AI Planner as a core component and ensure strategy suggestions are generated consistently for current high-leverage tasks/subtasks.
4. Add visible progress-to-outcome line-of-sight in UI (small progress indicators tied to task/subtask completion).
5. Immediate reliability fix: resolve current AI Planner auth/config regression (“authentication required”) and verify suggestion generation end-to-end.
6. Ship progressive onboarding UX with quick-start activation and optional deeper profile refinement.
7. Make queue behavior explicit in UI microcopy (stable Next-3 until all complete or manual refresh).
8. Use privacy-first defaults for share artifacts, with editable details before posting.
9. Implement native auth baseline and plan social auth expansion (Google + Apple).
10. Future direction (not immediate MVP): approve-to-execute AI-mediated strategy actions for supported workflows.

## Virality + Organic Growth Strategy (Approved 2026-03-08)
- Shareable “Today’s 3” card.
- Weekly before/after execution summary card.
- Referral loop with trial extension incentive.
- Optional 7-day clarity sprint challenge mechanic.
- Onboarding acquisition asset: “Explore how can I use AI to get to where I want to be?” quiz leading into onboarding.

## Not Now
Business CRM/sales/enterprise operator workflows.

## 30-Day Win
Stable onboarding-to-Next-3 execution loop for general self-improvement users, with clear completion/consistency gains, visible AI-leverage adoption, and strong early retention signals.

## Change Note (2026-03-08)
Marketing and design strategy decisions were integrated directly into canonical sections (Vision/Primary User/Core Value/MVP/Activation/Offer + approved product/virality/design priorities) to avoid parallel narratives and source-of-truth drift.

## Change Note (2026-03-10)
UX principles, interface strategy, positioning (one-liner + differentiator), emotional payoff and outcome alignment in Core Value, vision board phased to post–30-day win, conversion hook, and graceful-degradation / quick-start in UX. Extended strategy: `docs/NORTH_STAR_EVALUATION_AND_STRATEGY.md`.

---

## Architecture Review Addendum (2026-03-06)

Technical decomposition and implementation details also live in `docs/ARCHITECTURE_NOTES.md`.

### Current architecture strengths
- Clear product loop coverage (onboarding → daily execution → analytics).
- Deterministic verification scripts exist for core planner paths (`verify:scoring`, `verify:queue`, `verify:planner`, `verify:refinement-events`).
- Recent auth-boundary hardening in planner APIs is directionally correct.

### Highest architecture risks now
1. **Monolithic data-access layer (`lib/db.js`) still carries multi-domain responsibility.**
2. **Planner apply path uses compensating rollback instead of a true transactional boundary.**
3. **Runtime artifacts (`.next`, `node_modules`, `n8n_data`) remain in active repo surface and increase operational drift risk.**

### North-star aligned architecture priorities (next 30 days)
- Finish bounded decomposition of `lib/db.js` into domain modules (planner/events/tasks/profile).
- Introduce atomic planner apply writes (DB transaction/RPC) for task + tags + events.
- Tighten repo hygiene and runtime separation so source-of-truth stays code/docs only.

### Concrete development tasks
- Ship `lib/db/*` domain extraction plan in 3 PRs with unchanged public interfaces.
- Replace endpoint-local rollback logic with atomic DB-level write unit and explicit failure semantics.
- Add `.gitignore`/ops cleanup for mutable runtime files and keep n8n state outside tracked repo paths.
