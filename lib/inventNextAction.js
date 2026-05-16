// Invention path — when no existing task addresses an important vector
// gap, the designer proposes a single low-activation-energy ≤30-min
// standalone action that moves that gap forward. The proposal lives
// ephemerally in Today's Commitment until completed; promotion to a real
// task happens on completion (see /api/today/promote-slot).
//
// Conservatism is the design constraint here. The default bias is to
// surface or decompose existing user-authored work; we only invent when a
// vector is clearly starving (no recent activity, no candidate task that
// hits it) AND the gap is one the user cares about (linked to a desired
// outcome, a stalled ISC, a starving need, or a known fire).
//
// One invention per refill maximum. Keep the AI from inventing your day.

import { chatCompletion } from "./ai-provider.js";

const RECENT_ACTIVITY_DAYS = 7;

function safeJsonParse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const m = String(text).match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

/**
 * Identify vector gaps from the user's state. Returns up to N candidate
 * gaps ordered by importance:
 *   1. Outcomes with stalled ISCs AND no candidate task addressing them.
 *   2. Life-domains with zero recent completions AND no candidate task.
 *
 * `candidateTasks` is the pool the refill scorer is already considering.
 * `recentCompletions` is an array of completed task rows from the last
 *  RECENT_ACTIVITY_DAYS days (used to identify "starving" vectors).
 */
export function identifyVectorGaps({
  desiredOutcomes,
  candidateTasks,
  recentCompletions,
  lifeDomains,
}) {
  const outcomeCovered = new Set();
  const domainCovered = new Set();
  for (const t of candidateTasks || []) {
    for (const id of t.outcome_ids || []) outcomeCovered.add(String(id));
    if (t.primary_life_domain) domainCovered.add(t.primary_life_domain);
  }

  const domainActive = new Set();
  for (const t of recentCompletions || []) {
    if (t?.primary_life_domain) domainActive.add(t.primary_life_domain);
    for (const id of t?.outcome_ids || []) outcomeCovered.add(String(id));
  }

  const gaps = [];

  // 1. Stalled outcomes — has unmet ISCs, no candidate addresses it.
  for (const o of desiredOutcomes || []) {
    if (!o?.id) continue;
    const criteria = Array.isArray(o.criteria) ? o.criteria : [];
    if (criteria.length === 0) continue;
    const unmet = criteria.filter((c) => !c?.met).length;
    if (unmet === 0) continue;
    if (outcomeCovered.has(String(o.id))) continue;
    gaps.push({
      kind: "outcome",
      vector_key: `outcome:${o.id}`,
      id: o.id,
      label: o.title,
      severity: unmet, // more unmet ISCs = higher severity
    });
  }

  // 2. Starving domains — known life domain, no recent completions, no
  // candidate addresses it.
  for (const domain of lifeDomains || []) {
    if (!domain) continue;
    if (domainActive.has(domain)) continue;
    if (domainCovered.has(domain)) continue;
    gaps.push({
      kind: "domain",
      vector_key: `domain:${domain}`,
      id: domain,
      label: domain,
      severity: 1,
    });
  }

  return gaps.sort((a, b) => b.severity - a.severity);
}

const SYSTEM_PROMPT = `You design a single low-activation-energy bite-size action for a vector that's been starving — no existing task in the user's backlog addresses it, and the user hasn't moved on it recently.

CORE PRINCIPLE: the hardest part is getting started. Your proposed action must be doable in ≤30 minutes with zero decisions to make and zero missing context. The user should know exactly what to do when they sit down.

BIAS TOWARD MICRO-CONNECTION + MICRO-MAINTENANCE: most gaps surface in relationship / health / lifestyle vectors that don't naturally show up as project tasks. Examples of well-shaped proposals:
  - "Send Lynn a 2-line midday text checking in"
  - "Walk around the block once after dinner"
  - "Text Mom asking how she's doing"
  - "Open the boat insurance doc and skim the renewal date"

KEEP IT HUMAN. Verb-first titles, specific, friction-less. NEVER propose research / planning / "look into" actions — those have high activation energy because they're vague.

Output strict JSON only. No prose, no markdown.
Schema: {"title":"verb-first action ≤120 chars","minutes":N,"why":"one short reason this clears the gap","suggested_category":"existing category name or null"}`;

function buildUserPrompt({
  gap,
  morningState,
  recentContext,
  availableCategories,
}) {
  const lines = [
    `VECTOR GAP: ${gap.label} (${gap.kind})`,
    morningState?.energy
      ? `MORNING ENERGY: ${morningState.energy}`
      : null,
    morningState?.focus_text
      ? `ON THE USER'S MIND: ${morningState.focus_text}`
      : null,
    recentContext ? `RECENT CONTEXT (last 7 days):\n${recentContext}` : null,
    Array.isArray(availableCategories) && availableCategories.length > 0
      ? `AVAILABLE CATEGORIES (pick one or null): ${availableCategories.join(", ")}`
      : null,
    "",
    "Propose ONE action per the rules above. Return JSON only.",
  ].filter(Boolean);
  return lines.join("\n");
}

/**
 * Run the invention LLM call for a single vector gap. Returns a shaped
 * `invented` block ready to slot into the queue, or null on failure /
 * bad parse. Never throws.
 */
export async function inventActionForGap({
  gap,
  morningState = null,
  recentContext = null,
  availableCategories = [],
}) {
  if (!gap?.vector_key) return null;
  try {
    const result = await chatCompletion({
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildUserPrompt({
            gap,
            morningState,
            recentContext,
            availableCategories,
          }),
        },
      ],
      tier: "extractor",
    });
    const parsed = safeJsonParse(result?.content);
    if (!parsed || !parsed.title) return null;
    const minutes = Math.min(45, Math.max(5, Number(parsed.minutes) || 15));
    return {
      title: String(parsed.title).slice(0, 200),
      minutes,
      why: parsed.why ? String(parsed.why).slice(0, 240) : null,
      vector_key: gap.vector_key,
      vector_kind: gap.kind,
      vector_label: gap.label,
      suggested_category:
        parsed.suggested_category
          ? String(parsed.suggested_category).slice(0, 120)
          : null,
    };
  } catch {
    return null;
  }
}

export const _internal = { SYSTEM_PROMPT, RECENT_ACTIVITY_DAYS, safeJsonParse };
