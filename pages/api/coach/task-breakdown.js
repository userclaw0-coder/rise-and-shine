// POST /api/coach/task-breakdown
// Body: { task_id }
// Returns: { ok, subtasks: [{ title, minutes }] }
// Coach proposes ≤30-min sub-steps for a task that's too big.

import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from "../../../lib/api-auth";
import { chatCompletion } from "../../../lib/ai-provider";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function safeJsonParse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text).match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
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

  const taskId = String(req.body?.task_id || "");
  if (!taskId) return res.status(400).json({ error: "task_id required" });

  try {
    const { data: task } = await supabase
      .from("tasks")
      .select(
        "id, title, priority, effort_hours, category:categories(name)"
      )
      .eq("id", taskId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!task) return res.status(404).json({ error: "Task not found" });

    const minutes = Math.round((task.effort_hours || 0) * 60);
    const projectName = task.category?.name || "this project";

    const system = `You are the Rise & Shine project coach. The user is staring at a task that's too big to do in one sitting. Break it into 3-6 concrete sub-steps, each 30 minutes or less. Each sub-step should be a verb-first action they can start without thinking.

Return strict JSON: {"subtasks":[{"title":"...","minutes":15}]}. No prose, no markdown.`;

    const userPrompt = `Project: ${projectName}
Task: "${task.title}"
Estimated effort: ${minutes || "unknown"} min
Priority: ${task.priority || "Medium"}

Propose 3-6 sub-steps, each ≤30 minutes, that together complete this task. Use verb-first titles ("Draft outline", "Send email to X", not "Outline drafting"). Return JSON only.`;

    const result = await chatCompletion({
      system,
      messages: [{ role: "user", content: userPrompt }],
    });

    const parsed = safeJsonParse(result?.content);
    const subtasks = Array.isArray(parsed?.subtasks)
      ? parsed.subtasks
          .filter((s) => s?.title)
          .slice(0, 8)
          .map((s) => ({
            title: String(s.title).slice(0, 200),
            minutes: Math.min(60, Math.max(5, Number(s.minutes) || 20)),
          }))
      : [];

    if (subtasks.length === 0) {
      return res.status(502).json({ error: "AI returned no subtasks." });
    }

    return res.json({ ok: true, subtasks });
  } catch (err) {
    return res
      .status(err?.status || 500)
      .json({ error: err?.message || "Failed to break down task." });
  }
}
