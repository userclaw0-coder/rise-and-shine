// Morning Approvals — batch decisions served once per local morning.
//
// GET   → gathers overnight signals, calls the coach for structured
//         proposals (break_down / new_next_action / reorder), returns
//         { proposals }.
// POST  → body { approved: [ ... full proposal payloads ... ] }.
//         Executes each via the existing tool executors, writes the
//         preferences.morning_approvals marker.

import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from "../../../lib/api-auth";
import { chatCompletion } from "../../../lib/ai-provider";
import { executeTool } from "../../../lib/jarvis-tools";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoMinusHours(hours) {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

async function gatherSignals(userId) {
  const today = todayStr();
  const yesterdayIso = isoMinusHours(30);

  const [profileRes, wsRes, eventsRes] = await Promise.all([
    supabase.from("user_profile").select("profile").eq("user_id", userId).maybeSingle(),
    supabase
      .from("shared_project_workspaces")
      .select("category_id, workspace")
      .eq("owner_user_id", userId),
    supabase
      .from("task_events")
      .select("task_id, created_at")
      .eq("user_id", userId)
      .eq("event_type", "completed")
      .gte("created_at", yesterdayIso),
  ]);

  const profile = profileRes?.data?.profile || {};
  const prefs = profile.preferences || {};
  const lastDismissed = prefs.morning_approvals?.last_dismissed_date || null;
  const capacity = prefs.daily_capacity?.[today] || "normal";
  const lifeSituations = Array.isArray(prefs.life_situations)
    ? prefs.life_situations.filter((s) => !s.archived_at)
    : [];

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("user_id", userId);
  const catMap = new Map((categories || []).map((c) => [c.id, c.name]));

  // Project buckets
  const needsBreakdown = [];
  const nullNextAction = [];
  const drifted = [];

  for (const row of wsRes?.data || []) {
    const ws = row.workspace || {};
    const next = ws.next_action;
    const catName = catMap.get(row.category_id) || "Project";
    if (!next) {
      nullNextAction.push({ category_id: row.category_id, project_name: catName });
      continue;
    }
    if (next.needs_breakdown) {
      needsBreakdown.push({
        category_id: row.category_id,
        project_name: catName,
        next_action: next,
      });
      continue;
    }
    const setAt = next.set_at ? new Date(next.set_at).getTime() : 0;
    if (setAt && Date.now() - setAt > 48 * 3600 * 1000) {
      drifted.push({
        category_id: row.category_id,
        project_name: catName,
        next_action: next,
      });
    }
  }

  const completedIds = (eventsRes?.data || []).map((e) => e.task_id);
  let unlockedChildren = [];
  if (completedIds.length > 0) {
    const { data: children } = await supabase
      .from("tasks")
      .select("id, title, category_id, parent_task_id, status, effort_hours")
      .eq("user_id", userId)
      .in("parent_task_id", completedIds)
      .in("status", ["todo", "doing"])
      .is("archived_at", null)
      .limit(20);
    unlockedChildren = children || [];
  }

  return {
    today,
    lastDismissed,
    capacity,
    lifeSituations,
    needsBreakdown,
    nullNextAction,
    drifted,
    unlockedChildren,
    completedSinceCount: completedIds.length,
  };
}

async function runCoachForProposals(signals) {
  if (
    signals.needsBreakdown.length === 0 &&
    signals.nullNextAction.length === 0 &&
    signals.drifted.length === 0 &&
    signals.unlockedChildren.length === 0
  ) {
    return [];
  }

  const system = `You are the Morning Approvals coach for the Rise & Shine planner. You run once per morning, after a brief analysis of what happened overnight. Your job: propose a SHORT list of structured decisions the user should approve before starting their day.

Return ONLY a JSON array. No prose. Each element is one of:

{ "type": "break_down", "project_name": "…", "category_id": "…", "parent_task_id": "…", "parent_title": "…", "proposed_subtasks": [{"title": "…", "minutes": 15}], "rationale": "…" }
{ "type": "new_next_action", "project_name": "…", "category_id": "…", "proposed": {"title": "…", "minutes": 15, "why": "…", "task_id": "… or null if you want to create it"}, "rationale": "…" }
{ "type": "reorder", "project_name": "…", "category_id": "…", "proposed_order": ["task-uuid", …], "rationale": "…" }

Rules:
- Max 5 proposals total. Prefer fewer, higher-leverage ones.
- Capacity="heavy" or "overwhelmed" → propose fewer and smaller items. Capacity="light" → it's fine to be more ambitious.
- Every proposed task MUST be ≤30 minutes.
- If no useful proposals exist, return [].`;

  const user = `Signals:\n${JSON.stringify(
    {
      today: signals.today,
      capacity: signals.capacity,
      life_situations: signals.lifeSituations.map((s) => s.label),
      needs_breakdown: signals.needsBreakdown,
      no_next_action: signals.nullNextAction,
      drifted_next_action: signals.drifted,
      unlocked_children: signals.unlockedChildren,
      completed_since_last_morning: signals.completedSinceCount,
    },
    null,
    2
  )}\n\nReturn the JSON array now.`;

  try {
    const res = await chatCompletion({
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = (res?.content || "").trim();
    const jsonStart = text.indexOf("[");
    const jsonEnd = text.lastIndexOf("]");
    if (jsonStart < 0 || jsonEnd < jsonStart) return [];
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 6).map((p, i) => ({ id: `prop_${Date.now()}_${i}`, ...p }));
  } catch {
    return [];
  }
}

async function writeMarker(userId, { dismissed } = {}) {
  const { data: current } = await supabase
    .from("user_profile")
    .select("profile")
    .eq("user_id", userId)
    .maybeSingle();
  const profile = current?.profile || {};
  const prefs = profile.preferences || {};
  const morning = prefs.morning_approvals || {};
  const nextProfile = {
    ...profile,
    preferences: {
      ...prefs,
      morning_approvals: {
        last_run_at: new Date().toISOString(),
        last_dismissed_date: dismissed ? todayStr() : morning.last_dismissed_date || null,
      },
    },
  };
  await supabase
    .from("user_profile")
    .upsert({ user_id: userId, profile: nextProfile }, { onConflict: "user_id" });
}

async function applyProposal(userId, proposal) {
  if (!proposal || !proposal.type) return { ok: false, reason: "invalid" };

  if (proposal.type === "break_down") {
    await executeTool(
      "create_subtasks",
      {
        parent_task_id: proposal.parent_task_id,
        subtasks: (proposal.proposed_subtasks || []).map((s) => ({
          title: s.title,
          effort_hours: s.minutes ? s.minutes / 60 : 0.25,
        })),
      },
      userId
    );
    // Refresh next_action to the first new subtask (best-effort; it's
    // the smallest liftable step from the refreshed ladder).
    const first = (proposal.proposed_subtasks || [])[0];
    if (first) {
      // We don't know the new task id without re-querying; rely on
      // auto-refill's picker by explicitly passing a null task_id and
      // letting the stored next_action be auto-refreshed later OR
      // setting the title so the user sees something immediately.
      await executeTool(
        "update_project_workspace",
        {
          category_id: proposal.category_id,
          next_action: {
            title: first.title,
            minutes: first.minutes || 15,
            why: proposal.rationale || "",
            source: "morning_approvals",
            needs_breakdown: false,
          },
        },
        userId
      );
    }
    return { ok: true };
  }

  if (proposal.type === "new_next_action") {
    const p = proposal.proposed || {};
    let taskId = p.task_id || null;
    if (!taskId) {
      const created = await executeTool(
        "create_task",
        {
          title: p.title,
          category_id: proposal.category_id,
          effort_hours: p.minutes ? p.minutes / 60 : 0.25,
          priority: "Medium",
        },
        userId
      );
      taskId = created?.task?.id || null;
    }
    await executeTool(
      "update_project_workspace",
      {
        category_id: proposal.category_id,
        next_action: {
          title: p.title,
          minutes: p.minutes || 15,
          why: p.why || "",
          task_id: taskId,
          source: "morning_approvals",
          needs_breakdown: false,
        },
      },
      userId
    );
    return { ok: true };
  }

  if (proposal.type === "reorder") {
    await executeTool(
      "reorder_project_tasks",
      {
        category_id: proposal.category_id,
        task_ids: proposal.proposed_order || [],
      },
      userId
    );
    return { ok: true };
  }

  return { ok: false, reason: "unknown_type" };
}

export default async function handler(req, res) {
  let userId;
  try {
    userId = await getAuthenticatedUserId(req);
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message });
  }

  if (req.method === "GET") {
    const signals = await gatherSignals(userId);
    if (signals.lastDismissed === signals.today) {
      return res.status(200).json({ proposals: [], already_dismissed: true });
    }
    const proposals = await runCoachForProposals(signals);
    return res.status(200).json({ proposals, capacity: signals.capacity });
  }

  if (req.method === "POST") {
    const body = req.body || {};
    const approved = Array.isArray(body.approved) ? body.approved : [];
    const results = [];
    for (const p of approved) {
      try {
        const r = await applyProposal(userId, p);
        results.push({ id: p.id || null, ...r });
      } catch (e) {
        results.push({ id: p.id || null, ok: false, reason: e.message });
      }
    }
    await writeMarker(userId, { dismissed: true });
    return res.status(200).json({ results });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
