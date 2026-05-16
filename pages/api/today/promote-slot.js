// POST /api/today/promote-slot
// Body: { date?, slot_index }   (slot_index: 0|1|2)
// Returns: { ok, queue, task }
//
// Promote-on-completion. When the user marks an INVENTED slot done, we
// retroactively create a real task in the appropriate project (tagged
// `auto-invented`), mark it complete in the same breath, log the
// completion event, and swap the queue slot from {invented: …, task_id:
// null} to {task_id: <new>}.
//
// Tom's call: invented actions stay ephemeral while they're in the queue
// (no project clutter from rejected proposals). Only the ones that
// actually land get persisted. This route is the persistence step.

import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from "../../../lib/api-auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function pickFallbackCategoryId(userId, suggestedName) {
  // If the inventor suggested a category name, match against the user's
  // actual project list. Otherwise fall back to a "Personal" category if
  // one exists, or the first accessible category.
  const { data: cats } = await supabase
    .from("categories")
    .select("id, name")
    .eq("user_id", userId);
  if (!Array.isArray(cats) || cats.length === 0) return null;
  if (suggestedName) {
    const wanted = suggestedName.toLowerCase().trim();
    const hit = cats.find((c) => c.name?.toLowerCase().trim() === wanted);
    if (hit) return hit.id;
  }
  const personal = cats.find((c) => c.name?.toLowerCase() === "personal");
  if (personal) return personal.id;
  return cats[0].id;
}

function deriveOutcomeIds(invented) {
  if (!invented?.vector_key) return [];
  const m = /^outcome:(.+)$/.exec(invented.vector_key);
  return m ? [m[1]] : [];
}

function deriveLifeDomain(invented) {
  if (!invented?.vector_key) return null;
  const m = /^domain:(.+)$/.exec(invented.vector_key);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "POST only" });

  let userId;
  try {
    userId = await getAuthenticatedUserId(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const slotIndex = Number(req.body?.slot_index);
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 2) {
    return res.status(400).json({ error: "slot_index must be 0, 1, or 2" });
  }
  const today = req.body?.date || new Date().toISOString().slice(0, 10);

  try {
    const { data: plan } = await supabase
      .from("daily_plans")
      .select("queue")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle();
    const queue = Array.isArray(plan?.queue) ? plan.queue : [];
    const slot = queue[slotIndex];
    if (!slot) return res.status(404).json({ error: "Slot is empty." });
    if (slot.task_id) {
      return res
        .status(400)
        .json({ error: "Slot already references a real task." });
    }
    const invented = slot.invented;
    if (!invented?.title) {
      return res.status(400).json({ error: "Slot has no invented payload." });
    }

    const categoryId = await pickFallbackCategoryId(
      userId,
      invented.suggested_category
    );
    if (!categoryId) {
      return res
        .status(500)
        .json({ error: "No category available to file the task under." });
    }

    const effortHours = invented.minutes ? invented.minutes / 60 : null;
    const insertRow = {
      user_id: userId,
      category_id: categoryId,
      title: invented.title,
      status: "done",
      priority: "Medium",
      effort_hours: effortHours,
      outcome_ids: deriveOutcomeIds(invented),
      primary_life_domain: deriveLifeDomain(invented),
    };
    const { data: created, error: insErr } = await supabase
      .from("tasks")
      .insert(insertRow)
      .select("id, title")
      .single();
    if (insErr || !created) {
      return res
        .status(500)
        .json({ error: insErr?.message || "Failed to create task." });
    }

    // Tag the new task `auto-invented` for downstream analytics and so
    // future passes can spot system-originated entries cleanly.
    const { data: tagRow } = await supabase
      .from("tags")
      .select("id")
      .eq("user_id", userId)
      .eq("name", "auto-invented")
      .maybeSingle();
    let tagId = tagRow?.id;
    if (!tagId) {
      const { data: newTag } = await supabase
        .from("tags")
        .insert({ user_id: userId, name: "auto-invented" })
        .select("id")
        .single();
      tagId = newTag?.id;
    }
    if (tagId) {
      await supabase
        .from("task_tags")
        .insert({ task_id: created.id, tag_id: tagId });
    }

    // Log the completion event so streaks / nudges / dailyReflection all
    // see this landed exactly like any other completed task.
    await supabase.from("task_events").insert({
      user_id: userId,
      task_id: created.id,
      event_type: "completed",
      value: { source: "promote_on_completion", date: today },
    });

    // Swap the queue slot.
    const newQueue = queue.map((s, i) =>
      i === slotIndex
        ? {
            slot: s.slot,
            type: s.type,
            task_id: created.id,
            why: s.why || invented.why || "",
          }
        : s
    );
    const { error: upErr } = await supabase
      .from("daily_plans")
      .upsert(
        { user_id: userId, date: today, queue: newQueue },
        { onConflict: "user_id,date" }
      );
    if (upErr) {
      // Task was created but the queue update failed — non-fatal; the
      // task is real, the slot UI will refresh on next load.
    }

    return res.json({
      ok: true,
      date: today,
      queue: newQueue,
      task: { id: created.id, title: created.title },
    });
  } catch (e) {
    return res
      .status(e.status || 500)
      .json({ error: e.message || String(e) });
  }
}
