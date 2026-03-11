# PROJECT_NORTH_STAR — Evaluation & Strategy Addendum

**Purpose:** Evaluate the North Star for content, UX, marketability, and interface strategy; suggest concrete additions and priorities so the finished product is up-to-date, attractive, and easy to use.

**Canonical North Star:** `PROJECT_NORTH_STAR.md` (repo root). This doc is the extended strategy reference.

**Option B applied (2026-03-10):** Key points (emotional payoff, outcome alignment, UX principles, interface strategy, positioning, conversion hook, vision board phase, graceful degradation, quick-start, architecture link) were integrated into `PROJECT_NORTH_STAR.md`. This file remains the detailed rationale and optional further refinements.

---

## 1. Content evaluation

### Strengths
- **Clear primary user** (general self-improvement + AI-curious) and **single activation event** (onboarding → Next 3 + subtasks + AI leverage + “why now”).
- **MVP checklist** is concrete and testable.
- **Product priorities** and **virality** are approved and sequenced.
- **Offer structure** (free + 7-day trial, then subscription) is explicit.
- **Not Now** scopes out enterprise/CRM cleanly.

### Gaps and suggestions

| Gap | Suggestion |
|-----|-------------|
| **Emotional payoff** is implied (“clear next actions”) but not named. | Add one line under Vision or Core Value: e.g. “Reduce decision fatigue and the ‘what should I do next?’ loop so users feel in control of their day.” Makes marketing and onboarding copy easier. |
| **Outcomes vs tasks** appear in MVP (“outcome-aligned Next 3”) but the link between **life outcomes** and **today’s 3** could be clearer. | In North Star or PROJECT_SPEC, state explicitly: “Next 3 is ranked against the user’s stated outcomes/priorities so the list feels personally meaningful, not generic.” |
| **Failure modes** (AI down, empty backlog, overwhelm) are only partly covered (fallback state). | Add a short “Graceful degradation” principle: e.g. “When AI or data is missing, the app still shows a usable Next 3 and clear next step (e.g. add tasks, try again), never a dead end.” |
| **Vision board** is in MVP but not in product priorities. | Either add “Vision board (AI + photo)” to the priorities list with a phase (e.g. post–30-day win) or move it to “Future / post-MVP” so the 30-day win stays focused. |
| **Architecture addendum** is valuable but mixes strategy (North Star) with implementation (db decomposition, RPC). | Keep in North Star as “Technical alignment” or move to `docs/ARCHITECTURE_NOTES.md` and reference it from North Star so the main doc stays product/UX/market facing. |

---

## 2. UX strategy for “easy to use”

The North Star describes *what* the product does and *when* MVP is done, but not *how* it should feel or look. Adding a short **UX principles** block helps align design and implementation.

### Suggested addition: UX principles

Add a section (to North Star or PROJECT_SPEC) such as:

- **One clear next step at a time.** Default view answers “What do I do next?” in one glance. Avoid competing CTAs or multiple “modes” on the same screen.
- **Progressive disclosure.** Onboarding and settings reveal complexity only when needed (e.g. “Refine these 3 with AI” after basics; deeper profile later).
- **Consistent patterns.** Same interaction patterns for “complete,” “snooze,” “move to backlog,” and “why this task” across Today, backlog, and planner so users build a single mental model.
- **Low friction for capture.** Adding a task or idea is never more than one tap or shortcut away; categorization can be suggested or deferred.
- **Feedback on every action.** Every tap does something visible (checkmark, toast, state change) so users never wonder if the app registered the action.
- **Recoverable errors.** Errors (e.g. planner failure, network) show a clear message and one suggested next step (retry, work without AI, contact support), not a generic error code.

### UX priorities not yet explicit in North Star

| Area | Suggestion |
|------|-------------|
| **Mobile / responsive** | State explicitly: “Today and capture flows are fully usable on mobile (responsive or PWA); desktop is primary for weekly review and deeper settings.” |
| **Accessibility** | Add: “Meet WCAG 2.1 AA for core flows (Today, onboarding, task capture) so the app is usable with keyboard and screen readers.” |
| **Loading and empty states** | “Every list and queue has a clear empty state (what to do) and loading state (skeleton or spinner), never a blank screen.” |
| **Onboarding length** | “Quick-start path reaches ‘Next 3 in front of you’ in &lt; 3 minutes; optional deeper profile can follow without blocking.” |

---

## 3. Marketability and positioning

### Current positioning
- “AI-curious people,” “clear next actions,” “practical AI leverage” — good for early adopters and clarity.
- Risk: “AI-guided” can feel vague or gimmicky if the differentiator isn’t crisp.

### Suggestions for marketability

| Element | Current | Suggestion |
|---------|---------|------------|
| **One-liner** | Vision is a sentence; no single tagline. | Add a **positioning one-liner** for landing/marketing: e.g. “Your next 3 actions, chosen for today — with AI that explains why and how.” Keeps “Next 3” and “AI” and “explains” in one line. |
| **Differentiator** | Implied (Next 3 + AI + subtasks). | State explicitly: “We’re not a generic to-do app or a generic AI chat: we combine **prioritized daily focus** (exactly 3), **AI that suggests and explains**, and **lightweight structure** (outcomes, modes, weekly review) so you stay in motion without over-planning.” |
| **Social proof / trust** | Not in North Star. | Post-MVP: add “Social proof and trust” as a theme — e.g. testimonials, “X tasks completed this week,” or optional shareable wins that don’t expose private data. |
| **Trial-to-paid** | 7-day trial, then upsell. | Clarify the “aha” moment that converts: e.g. “Conversion hook: user has completed at least one full Next-3 cycle and seen one AI suggestion applied; trial end reminds them of that win and offers continuity.” |
| **Virality** | Shareable Today’s 3, weekly summary, referral, quiz. | Prioritize: “Today’s 3” card and “weekly before/after” are the two most on-brand and low-friction; referral and 7-day challenge can follow. Ensure share artifacts are **privacy-first and editable** (already in priorities). |

---

## 4. Interface strategy: up-to-date and attractive

The North Star doesn’t yet spell out **visual and interaction design** direction. Adding a short **interface strategy** keeps the product feeling modern, cohesive, and easy to use.

### Suggested addition: Interface strategy

- **Visual clarity over decoration.** Plenty of whitespace, clear hierarchy (one primary action per card/section), limited palette so “Next 3” and CTAs stand out. Avoid dense, enterprise-style UIs.
- **Warm but focused tone.** Typography and color feel approachable (not cold or corporate) but still oriented toward focus and momentum (e.g. calm greens/blues or warm neutrals with one accent for actions). Copy is concise and encouraging, not cutesy or long.
- **Consistent component language.** Buttons, cards, and list items follow the same rules (e.g. primary action = solid, secondary = outline or text; completed = strikethrough + subtle check). Same spacing scale and corner radius across the app.
- **Motion with purpose.** Micro-interactions (e.g. check animation, list reorder) reinforce feedback; avoid decorative motion that doesn’t inform the user.
- **Mobile-first for key flows.** Today and capture work great on small screens; navigation and actions are thumb-friendly. Desktop enhances with larger views and keyboard shortcuts.
- **Design system.** Capture the above in a small design system (tokens for color, type, spacing, plus key components) so the app stays consistent as features grow. Can start as a doc or Figma; later codify in code (e.g. Tailwind theme, shared components).

### Practical next steps for interface

| Step | Action |
|------|--------|
| 1 | Add “Interface strategy” (or “Design principles”) to North Star or PROJECT_SPEC with the bullets above (short version). |
| 2 | Audit current UI: list pages/components that feel dated or inconsistent (e.g. Today vs backlog vs onboarding). |
| 3 | Define a minimal token set: primary/secondary/neutral colors, 2–3 type sizes, 1–2 radii, spacing scale. Apply to one flow first (e.g. Today), then roll out. |
| 4 | Align empty/loading/error states with “feedback on every action” and “recoverable errors” so the app feels reliable and understandable. |

---

## 5. Recommended changes to PROJECT_NORTH_STAR.md

### Option A — Minimal (reference only)
- Keep North Star as-is.
- Add at the end: “Strategy addendum (UX, marketability, interface): `docs/NORTH_STAR_EVALUATION_AND_STRATEGY.md`.”

### Option B — Integrate key points
- **Vision / Core Value:** Add one line on emotional payoff (e.g. reduce decision fatigue, feel in control).
- **New short section: “UX principles”** (4–6 bullets: one clear next step, progressive disclosure, consistent patterns, low-friction capture, feedback on every action, recoverable errors).
- **New short section: “Interface strategy”** (visual clarity, warm but focused, consistent components, motion with purpose, mobile-first key flows).
- **New short subsection under Offer or Virality: “Positioning”** — one-liner + one paragraph differentiator.
- **MVP / Priorities:** Clarify vision board phase or move to post-MVP; add “Graceful degradation” and “Quick-start &lt; 3 min” where relevant.
- **Technical:** Keep architecture addendum or move to `docs/ARCHITECTURE_NOTES.md` and link from North Star.

### Option C — Full strategy doc
- Keep North Star focused on product/MVP/activation/offer.
- Turn this evaluation into the single **Product & Design Strategy** doc (UX principles, interface strategy, marketability, positioning) and reference it from both North Star and PROJECT_SPEC so design and marketing have one place to look.

---

## 6. Summary

| Dimension | Verdict | Top suggestion |
|-----------|---------|-----------------|
| **Content** | Strong and actionable; a few gaps. | Add emotional payoff, outcome–Next 3 link, graceful degradation; clarify vision board phase. |
| **UX** | Implicit; not codified. | Add “UX principles” (one clear next step, progressive disclosure, feedback, recoverable errors, mobile/responsive, accessibility baseline). |
| **Marketability** | Good audience and offer; positioning can be sharper. | Add a one-liner and a one-paragraph differentiator; clarify trial conversion “aha” and prioritize shareable assets. |
| **Interface** | Not specified. | Add “Interface strategy” (clarity, warm but focused, consistent components, motion with purpose, mobile-first, design system direction). |

Adopting **Option B** (integrate key points into North Star) plus this doc as the extended strategy reference gives you a single North Star that’s still readable while making UX, marketability, and interface explicit and actionable.
