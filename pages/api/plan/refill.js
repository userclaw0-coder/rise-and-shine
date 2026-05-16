import { createClient } from "@supabase/supabase-js";
import {
  computeTaskScore,
  buildRationale,
} from "../../../lib/scoring";
import { reduceParentsToBestSubtask } from "../../../lib/today-queue";
import { getAuthenticatedUserId } from "../../../lib/api-auth";
import {
  listAccessibleCategoriesWithMeta,
  listBacklogTasksForActor,
} from "../../../lib/projectCollaboration";
import { buildAeAdjustments } from "../../../lib/dailyReflection";
import {
  identifyVectorGaps,
  inventActionForGap,
} from "../../../lib/inventNextAction";
import { pickWithVectorBundling } from "../../../lib/vectorBundling";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Build the Map<outcome_id, {unmetCount, totalCount}> that ISC-pull scoring
// reads. Kept tolerant of legacy outcome shapes that lack a criteria array.
function buildOutcomeIscState(profile) {
  const map = new Map();
  const outcomes = Array.isArray(profile?.desired_outcomes)
    ? profile.desired_outcomes
    : [];
  for (const o of outcomes) {
    if (!o?.id) continue;
    const criteria = Array.isArray(o.criteria) ? o.criteria : [];
    map.set(String(o.id), {
      unmetCount: criteria.filter((c) => !c?.met).length,
      totalCount: criteria.length,
    });
  }
  return map;
}

// Turn an invented proposal into a scoring candidate. We synthesize a
// minimal task shape so vectorBundling can read the right vector keys.
function inventedAsCandidate(invented, baseScore) {
  const synthetic = { id: `inv:${invented.vector_key || invented.title}` };
  const m = /^outcome:(.+)$/.exec(invented.vector_key || "");
  if (m) synthetic.outcome_ids = [m[1]];
  const d = /^domain:(.+)$/.exec(invented.vector_key || "");
  if (d) synthetic.primary_life_domain = d[1];
  return {
    task: synthetic,
    score: baseScore,
    invented,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    const userId = await getAuthenticatedUserId(req);

    const {
      date,
      mode,
      force,
      base_category_weights,
      quick_win_minutes,
    } = req.body || {};

    const today = date || new Date().toISOString().slice(0, 10);
    const chosenMode = mode || "Strategic Push";

    const { data: plan, error: planErr } = await supabase
      .from("daily_plans")
      .select("*")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle();
    if (planErr) throw planErr;

    const existingQueue = Array.isArray(plan?.queue) ? plan.queue : [];
    if (!force && existingQueue.length === 3) {
      return res.json({ ok: true, date: today, queue: existingQueue, reused: true });
    }

    const morningState = plan?.morning_state || null;

    const [
      tasks,
      categories,
      { data: completedEvents, error: compErr },
      { data: profileRow },
      { data: workspaceRows },
      aeAdjustments,
    ] = await Promise.all([
      listBacklogTasksForActor(userId, { includeArchived: false }),
      listAccessibleCategoriesWithMeta(userId),
      supabase
        .from("task_events")
        .select("task_id,created_at,event_type")
        .or(`user_id.eq.${userId},actor_user_id.eq.${userId}`)
        .eq("event_type", "completed")
        .order("created_at", { ascending: false }),
      supabase
        .from("user_profile")
        .select("profile")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("shared_project_workspaces")
        .select("category_id, workspace")
        .eq("owner_user_id", userId),
      buildAeAdjustments(userId, today),
    ]);
    if (compErr) throw compErr;

    const profile = profileRow?.profile || {};
    const prefs = profile.preferences || {};
    const orderIds = prefs.category_order_ids;
    const derivedWeights = {};
    if (Array.isArray(orderIds) && orderIds.length > 0 && categories?.length) {
      for (let i = 0; i < orderIds.length; i++) {
        const cat = (categories || []).find((c) => c.id === orderIds[i]);
        if (cat) derivedWeights[cat.name] = Math.max(1, orderIds.length - i);
      }
    }
    const effectiveWeights =
      Object.keys(derivedWeights).length > 0
        ? {
            ...(base_category_weights || prefs.base_category_weights || {}),
            ...derivedWeights,
          }
        : base_category_weights || prefs.base_category_weights;

    const catMap = Object.fromEntries((categories || []).map((c) => [c.id, c.name]));

    const lastCompletedMap = {};
    const todayCompletedIds = new Set();
    const recentCompletedIds = new Set();
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    for (const ev of completedEvents || []) {
      if (!lastCompletedMap[ev.task_id]) lastCompletedMap[ev.task_id] = ev.created_at;
      if (!ev.created_at) continue;
      if (ev.created_at.slice(0, 10) === today) todayCompletedIds.add(ev.task_id);
      if (ev.created_at.slice(0, 10) >= sevenDaysAgo)
        recentCompletedIds.add(ev.task_id);
    }

    const withMeta = (tasks || []).map((t) => ({
      ...t,
      category:
        (typeof t.category === "string" ? t.category : t.category?.name) ||
        catMap[t.category_id] ||
        "Unknown",
      tags: Array.isArray(t.tags)
        ? t.tags
            .map((tag) =>
              typeof tag === "string" ? tag : tag?.tag?.name || tag?.name || ""
            )
            .filter(Boolean)
        : [],
    }));
    const filtered = withMeta
      .filter((t) => t.status !== "done" && t.status !== "archived")
      .filter((t) => !todayCompletedIds.has(t.id))
      .filter((t) => t.category !== "Daily Repeat")
      .filter((t) => !t.tags.includes("blocked") && !t.tags.includes("waiting"));

    // --- Cross-project arbiter signals ---
    const nextActionTaskIds = new Set();
    const staleProjectCategoryIds = new Set();
    const THIRTY_DAYS_MS = 30 * 86400 * 1000;
    for (const row of workspaceRows || []) {
      const ws = row.workspace || {};
      if (ws.next_action?.task_id) nextActionTaskIds.add(ws.next_action.task_id);
      const alignedAt = ws.last_aligned_at
        ? new Date(ws.last_aligned_at).getTime()
        : 0;
      if (!alignedAt || Date.now() - alignedAt > THIRTY_DAYS_MS) {
        staleProjectCategoryIds.add(String(row.category_id));
      }
    }
    const quarterFocusOutcomeIds = new Set(
      Array.isArray(profile.quarter_focus)
        ? profile.quarter_focus.map(String)
        : []
    );
    const dailyCap = prefs.daily_capacity || {};
    const capacity = dailyCap[today] || "normal";
    const activeSituations = Array.isArray(prefs.life_situations)
      ? prefs.life_situations.filter((s) => !s.archived_at)
      : [];
    const lifeSituationKeywords = new Set();
    for (const s of activeSituations) {
      const parts = String(s.label || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 3);
      for (const w of parts) lifeSituationKeywords.add(w);
    }

    const scoringOptions = {
      mode: chosenMode,
      now: new Date(),
      baseCategoryWeights: effectiveWeights,
      quickWinMinutes: quick_win_minutes ?? prefs.quick_win_definition_minutes,
      nextActionTaskIds,
      quarterFocusOutcomeIds,
      capacity,
      lifeSituationKeywords,
      staleProjectCategoryIds,
      outcomeIscState: buildOutcomeIscState(profile),
      morningEnergy: morningState?.energy || null,
      aeAdjustments,
    };

    const reduced = reduceParentsToBestSubtask(filtered, {
      dailyTemplateTaskIds: [],
      lastCompletedMap,
      ...scoringOptions,
    });

    // Score every reduced candidate up front.
    const scored = reduced.map((t) => {
      const lastCompletedAt = lastCompletedMap[t.id] || null;
      const result = computeTaskScore(t, { ...scoringOptions, lastCompletedAt });
      return { task: t, score: result.score, breakdown: result.components };
    });
    // Filter out blocked/waiting (sameframe as before but post-scoring view).
    const scoredEligible = scored.filter(
      (e) => !(e.task.tags || []).includes("blocked") && !(e.task.tags || []).includes("waiting")
    );
    scoredEligible.sort((a, b) => b.score - a.score);

    // --- Invention path: at most one invented slot per refill, for the
    // strongest vector gap not addressed by an existing task. ---
    let invented = null;
    const lifeDomains = profile.life_domains
      ? Object.keys(profile.life_domains)
      : [];
    const desiredOutcomes = Array.isArray(profile.desired_outcomes)
      ? profile.desired_outcomes
      : [];
    const recentCompletionRows = (tasks || []).filter((t) =>
      recentCompletedIds.has(t.id)
    );
    const gaps = identifyVectorGaps({
      desiredOutcomes,
      candidateTasks: filtered,
      recentCompletions: recentCompletionRows,
      lifeDomains,
    });
    if (gaps.length > 0) {
      const topGap = gaps[0];
      const availableCategoryNames = (categories || []).map((c) => c.name);
      const recentContextLines = recentCompletionRows
        .slice(0, 6)
        .map((t) => `- ${t.title}`)
        .join("\n");
      invented = await inventActionForGap({
        gap: topGap,
        morningState,
        recentContext: recentContextLines || null,
        availableCategories: availableCategoryNames,
      });
    }

    // Combine into a single scored pool. Invented entries get a score
    // halfway between the top real score and the 5th real score — enough
    // to make slot-2 contention but not enough to always crowd out real
    // top-priority work.
    const realTop = scoredEligible.slice(0, 5).map((e) => e.score);
    const inventedScore =
      realTop.length >= 2
        ? Math.round(((realTop[0] || 0) + (realTop[realTop.length - 1] || 0)) / 2)
        : (realTop[0] || 0) - 5;
    const combined = invented
      ? [...scoredEligible, inventedAsCandidate(invented, inventedScore)]
      : scoredEligible;

    const pickedSlots = pickWithVectorBundling(combined, { count: 3 });

    const types = ["Quick Win", "High Leverage", "Progress"];
    const newQueue = pickedSlots.map((entry, idx) => {
      const type = types[idx] || "Progress";
      if (entry.invented) {
        return {
          slot: idx + 1,
          type,
          task_id: null,
          invented: entry.invented,
          why:
            entry.invented.why ||
            `Designed to move ${entry.invented.vector_label || "a starving vector"} forward`,
        };
      }
      const why = buildRationale(
        entry.task,
        { components: entry.breakdown || {} },
        chosenMode
      );
      return {
        slot: idx + 1,
        type,
        task_id: entry.task.id,
        why,
      };
    });

    const payload = {
      user_id: userId,
      date: today,
      mode: chosenMode,
      queue: newQueue,
      refilled_count: (plan?.refilled_count || 0) + 1,
      last_refilled_at: new Date().toISOString(),
    };

    const { error: upErr } = await supabase
      .from("daily_plans")
      .upsert(payload, { onConflict: "user_id,date" });
    if (upErr) throw upErr;

    return res.json({
      ok: true,
      date: today,
      queue: newQueue,
      reused: false,
      invented: !!invented,
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || String(e) });
  }
}
