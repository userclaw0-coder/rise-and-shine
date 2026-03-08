# DESIGN_AGENT_REVIEW_2026-03-08

## A) Context sync summary (source-of-truth alignment)

This review is grounded in and aligned to the following canonical files:

1. `/home/clawofhank/rise-and-shine/PROJECT_NORTH_STAR.md`
2. `/home/clawofhank/rise-and-shine/docs/PROJECT_SPEC.md`
3. `/home/clawofhank/rise-and-shine/docs/ONBOARDING_FLOW.md`
4. `/home/clawofhank/rise-and-shine/docs/NEXT_ACTION_ALGO_V2.md`
5. `/home/clawofhank/rise-and-shine/README.md`

### Key alignment takeaways
- **North-star loop is clear:** onboarding → Next-3 queue → subtask orchestration → AI leverage suggestions → weekly review → analytics/progress signals.
- **Primary UX promise is strong:** “clear next actions + practical AI leverage now,” with explicit trial entry and conversion path.
- **Algorithm and UX shape are coherent:** stable 3-slot queue with quick-win / high-leverage / progress logic and refill cadence supports momentum.
- **Most important near-term UX risk is trust/reliability:** planner auth/config regression and inconsistent AI suggestions can collapse perceived product value quickly.

---

## B) UX strengths

1. **Clear product narrative and positioning**
   - The promise is easy to grasp: “What do I do next, and how can AI help?”

2. **Strong activation definition**
   - Activation event includes outcome-aligned Next-3, subtask breakdown, AI-leverage suggestion path, and rationale (“why now”). This is unusually concrete and measurable.

3. **Good execution psychology in queue design**
   - Fixed 3-slot queue prevents decision churn and endless reprioritization.
   - Slot structure (quick win + leverage + progress) balances motivation and meaningful progress.

4. **Thoughtful behavior model**
   - Uses needs balance, momentum, impact, urgency, importance, and staleness—not a one-dimensional scoring model.

5. **Retention scaffolding exists**
   - Weekly review, analytics, and visible progress-to-outcome signals set a foundation for habit formation and long-term adoption.

6. **Early built-in virality concepts are practical**
   - “Today’s 3” and before/after weekly cards are naturally shareable without requiring complex social mechanics.

---

## C) UX/design gaps and risks

1. **Onboarding cognitive load risk (10–15 min target may still feel heavy)**
   - The full onboarding asks for deep introspection + structured input + needs framework + constraints. For AI-curious but busy users, this may feel like homework.

2. **Potential mismatch between onboarding depth and immediate value delivery**
   - If users do not quickly see quality Next-3 outputs, perceived effort/value ratio drops.

3. **“Why this task now” is listed as priority but is vulnerable to generic output**
   - If rationale text is templated or vague, trust degrades (“AI fluff” effect).

4. **Subtask orchestration UX complexity**
   - Generate → edit/approve → promote best subtask → backlog parent linkage is valuable but can feel operationally dense if interaction design is not ultra-light.

5. **AI Planner reliability/trust is a top UX blocker**
   - Auth/config errors directly attack the app’s core identity as AI-guided.

6. **Queue refill behavior can feel unintuitive without microcopy**
   - “Do not refill until all 3 complete” is smart for focus, but users may perceive app as stale or broken unless the rule is clearly visible.

7. **Progress-to-outcome line-of-sight may be too abstract**
   - If analytics show activity metrics but weak causal linkage to stated outcomes, users won’t feel meaningful progress.

8. **Audience focus update (approved direction)**
   - Prioritize “general self-improvement users” as primary audience in UX language, onboarding tone, and examples.
   - Keep builder/operator support as a secondary-compatible path without making it the default narrative.

9. **Shareability concepts need privacy-safe defaults**
   - Users may avoid sharing if cards expose sensitive goals/tasks by default.

10. **Missing conversion-focused trial UX details**
   - Offer exists, but in-product paywall moments, upgrade prompts, and “aha before ask” timing are not yet explicit in documented flows.

---

## D) Recommendations by area

### 1) Onboarding

- **Adopt progressive onboarding with “minimum viable clarity” first pass**
  - Step 1 (3–4 min): desired outcomes + brain dump + available hours + one leverage area.
  - Step 2 (optional deepening): six-needs + full domain vision + identity language.
  - Immediate output after Step 1: first quality Next-3 + one AI leverage suggestion.

- **Add confidence and quality indicators during onboarding**
  - Show “Planning confidence: low/medium/high” with specific missing inputs.
  - Provide “Improve my plan quality” nudges instead of blocking progression.

- **Use concrete examples + one-tap starter chips at every text-heavy step**
  - Reduces blank-page anxiety and speeds completion.

- **Add “Skip for now” safely on reflective steps**
  - Ensure users can complete activation without perfect profile depth.

- **End onboarding with a visible activation checklist**
  - [ ] Next-3 generated
  - [ ] Subtasks approved
  - [ ] 1 AI leverage path selected
  - [ ] Why-now rationale reviewed

### 2) Daily execution UX

- **Design queue card anatomy for clarity and speed**
  - Title
  - Why now (1 sentence)
  - Expected duration (15–60m)
  - Outcome link (“Advances: X”) 
  - Friction hint (“Start with: …”)

- **Make queue behavior explicit in UI**
  - Microcopy: “Your 3 stay stable until all are done. Complete all 3 or tap Refresh.”

- **Create a one-tap “Start mode”**
  - Opens focused execution view with timer, minimal distractions, and completion CTA.

- **Add interruption-safe states**
  - “Paused,” “Deferred with reason,” and “Blocked” should be fast and guilt-free.

- **Surface replacement logic for blocked items**
  - If task becomes blocked, provide guided replace action instead of manual backlog surgery.

### 3) AI planner UX

- **Reliability-first UX contract + modern auth roadmap**
  - Never show silent failure.
  - Show explicit state: “AI unavailable, using rule-based fallback queue.”
  - Add explicit auth/config roadmap to support trustworthy access: email/password baseline, then **Sign in with Google** and **Sign in with Apple**.
  - Ensure AI planner suggestion generation is tied to authenticated session health and visible status.

- **Standardize suggestion payload quality**
  - Every AI suggestion should include:
    - Action statement
    - Why it matters now
    - Time estimate
    - Expected result
    - Optional automation/tool path

- **Add “explainability toggles”**
  - Compact view by default, expandable “How this was chosen” for trust.

- **Create a lightweight approval pattern**
  - Batch approve/edit for subtasks with keyboard-friendly flow.

- **Instrument suggestion acceptance metrics**
  - Track viewed/accepted/edited/rejected to iteratively improve recommendation quality.

### 4) Progress & retention loops

- **Implement outcome-linked progress bars**
  - Not only task completion; map completed work to specific desired outcomes.

- **Introduce streaks with quality safeguards**
  - Reward “meaningful completion” (high-leverage/progress tasks) over pure checkbox volume.

- **Weekly review should generate 3 artifacts automatically**
  - Wins summary
  - Bottleneck diagnosis
  - Next-week strategic shift recommendation

- **Build recovery UX for missed days**
  - “Reset gently” flow that avoids shame and quickly reboots momentum.

- **Expose “AI leverage adoption” as a core retention metric**
  - Show users where they saved effort using AI in the week.

### 5) Sharing / virality UX

- **Ship privacy-first share cards**
  - Default anonymized mode with editable text before sharing.

- **Design two share formats**
  - Public motivation card (high-level)
  - Builder mode card (specific, tactical)

- **Use referral moment after a real win**
  - Trigger referral ask post “all 3 complete” or weekly review completion, not during onboarding.

- **Add “7-day clarity sprint” with social proof hooks**
  - Daily completion visuals and end-of-week summary card.

- **Incorporate the quiz acquisition path into onboarding handoff**
  - “Explore how AI can help” quiz should pre-fill onboarding fields to reduce friction.

---

## E) Prioritized Top 10 design actions (impact/effort)

| # | Action | Impact | Effort |
|---|---|---|---|
| 1 | Fix AI planner reliability + explicit fallback UX state | H | M |
| 2 | Implement “Why this task now” card field with quality rules | H | M |
| 3 | Progressive onboarding (quick-start + deepen later) | H | M |
| 4 | Ship activation checklist at onboarding completion | H | L |
| 5 | Build subtask approval UX (batch approve/edit/promote) | H | M |
| 6 | Add queue behavior microcopy + visible refill rule | M | L |
| 7 | Add outcome-linked progress indicators in Today + Analytics | H | M |
| 8 | Add social auth roadmap: Sign in with Google + Sign in with Apple | H | M |
| 9 | Launch privacy-safe “Today’s 3” and weekly summary share cards | M | M |
|10| Add weekly recovery flow for missed days (“restart plan”) | M | L |

---

## F) MVP-now vs later boundaries

### MVP-now (must ship to validate core loop)
- Stable onboarding-to-Next-3 flow with immediate visible value.
- High-quality, non-generic “why this task now” rationale on each queue item.
- Subtask orchestration core flow (generate/edit/approve/promote/backlog linkage).
- Reliable AI planner suggestions (with fallback + transparent states).
- Outcome-linked progress visibility.
- Basic share card for Today’s 3 and weekly summary (privacy-first).
- Clear auth/config path with social sign-in planning for Google + Apple (at minimum documented and sequenced).

### Later (after core loop and trust are proven)
- AI-mediated approve-to-execute automations.
- Rich challenge mechanics and social/community layers.
- Advanced personalization modes by user segment/persona.
- Deep business workflow automations and CRM-adjacent capabilities.
- Local-first or personal AI agent ecosystem extensions.

---

## G) Suggested canonical wording candidates for PROJECT_NORTH_STAR integration

- “Rise-and-Shine turns life goals into the next three actions you can execute today with confidence.”
- “Every Next-3 item must show a clear ‘why now’ rationale, expected effort, and outcome linkage.”
- “Onboarding is progressive: users get value fast, then deepen profile quality over time.”
- “AI planner trust is non-negotiable: reliable suggestions, explicit fallback states, no silent failures.”
- “Subtask orchestration is the execution engine: generate, edit, approve, promote, and preserve parent context.”
- “Progress must be visible from completed action to desired outcome, not just task counts.”
- “Retention is built through momentum loops: daily execution, weekly reflection, and low-friction restart after setbacks.”
- “Sharing is privacy-first and win-triggered, not interruption-driven.”
- “Trial conversion should follow demonstrated value: first clear wins, then upgrade ask.”
- “Design for both clarity and speed: fewer decisions, stronger defaults, faster starts.”
- “Primary UX audience is general self-improvement users; advanced builder/operator workflows should remain optional, not default.”
- “Authentication should evolve toward low-friction trusted access with Sign in with Google and Sign in with Apple.”

---

## Implementation note
This review intentionally does **not** modify `/home/clawofhank/rise-and-shine/PROJECT_NORTH_STAR.md`; it is a decision packet for product/design prioritization and execution planning.
