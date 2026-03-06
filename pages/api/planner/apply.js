import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalizeTagName(name) {
  return String(name || "").trim();
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    const {
      user_id,
      task_id,
      suggested_title,
      suggested_effort_minutes,
      suggested_tags_add,
    } = req.body || {};

    if (!user_id) return res.status(400).json({ error: "user_id required" });
    if (!task_id) return res.status(400).json({ error: "task_id required" });

    const { data: existingTask, error: taskErr } = await supabase
      .from("tasks")
      .select("id,title,effort_hours")
      .eq("user_id", user_id)
      .eq("id", task_id)
      .maybeSingle();

    if (taskErr) throw taskErr;
    if (!existingTask) return res.status(404).json({ error: "Task not found" });

    const updates = {};
    if (typeof suggested_title === "string" && suggested_title.trim()) {
      updates.title = suggested_title.trim();
    }
    if (
      suggested_effort_minutes !== undefined &&
      suggested_effort_minutes !== null &&
      Number.isFinite(Number(suggested_effort_minutes))
    ) {
      const hours = Number(suggested_effort_minutes) / 60;
      updates.effort_hours = Math.max(0, Number(hours.toFixed(2)));
    }

    let updatedTask = existingTask;
    if (Object.keys(updates).length > 0) {
      const { data, error } = await supabase
        .from("tasks")
        .update(updates)
        .eq("user_id", user_id)
        .eq("id", task_id)
        .select("id,title,effort_hours")
        .single();
      if (error) throw error;
      updatedTask = data;
    }

    const incomingTags = Array.isArray(suggested_tags_add)
      ? Array.from(
          new Set(
            suggested_tags_add
              .map(normalizeTagName)
              .filter(Boolean)
          )
        )
      : [];

    let finalTagNames = [];

    if (incomingTags.length > 0) {
      const { data: existingLinks, error: linkErr } = await supabase
        .from("task_tags")
        .select("tag_id")
        .eq("user_id", user_id)
        .eq("task_id", task_id);
      if (linkErr) throw linkErr;

      const existingTagIds = (existingLinks || []).map((r) => r.tag_id).filter(Boolean);
      let existingTagRows = [];
      if (existingTagIds.length > 0) {
        const { data: rows, error: tagsErr } = await supabase
          .from("tags")
          .select("id,name")
          .eq("user_id", user_id)
          .in("id", existingTagIds);
        if (tagsErr) throw tagsErr;
        existingTagRows = rows || [];
      }

      const existingNames = new Set(existingTagRows.map((r) => normalizeTagName(r.name).toLowerCase()));
      const desiredNames = new Set(existingTagRows.map((r) => normalizeTagName(r.name)));

      for (const tagName of incomingTags) {
        if (!existingNames.has(tagName.toLowerCase())) {
          desiredNames.add(tagName);
        }
      }

      finalTagNames = Array.from(desiredNames);

      // Ensure all desired tags exist
      const ensuredIds = [];
      for (const name of finalTagNames) {
        const { data: found, error: foundErr } = await supabase
          .from("tags")
          .select("id")
          .eq("user_id", user_id)
          .ilike("name", name)
          .limit(1)
          .maybeSingle();
        if (foundErr) throw foundErr;
        if (found?.id) {
          ensuredIds.push(found.id);
          continue;
        }
        const { data: created, error: createErr } = await supabase
          .from("tags")
          .insert({ user_id, name })
          .select("id")
          .single();
        if (createErr) throw createErr;
        ensuredIds.push(created.id);
      }

      const { error: clearErr } = await supabase
        .from("task_tags")
        .delete()
        .eq("user_id", user_id)
        .eq("task_id", task_id);
      if (clearErr) throw clearErr;

      if (ensuredIds.length > 0) {
        const links = ensuredIds.map((tag_id) => ({ user_id, task_id, tag_id }));
        const { error: insErr } = await supabase.from("task_tags").insert(links);
        if (insErr) throw insErr;
      }
    }

    await supabase.from("task_events").insert([
      {
        user_id,
        task_id,
        event_type: "updated",
        value: {
          source: "planner_refinement",
          action: "update",
          applied: {
            title: updates.title ?? null,
            effort_hours: updates.effort_hours ?? null,
            tags_added: incomingTags,
          },
        },
      },
      {
        user_id,
        task_id,
        event_type: "updated",
        value: {
          source: "planner_refinement",
          action: "applied",
          applied_fields: Object.keys(updates),
          tags_added: incomingTags,
        },
      },
    ]);

    return res.json({
      ok: true,
      task: updatedTask,
      tags: finalTagNames,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
