// POST /api/weekly-review/section-draft
// Body: { week_start: "YYYY-MM-DD", section: "wins"|"friction"|..., current_text?: string }
// Returns: { ok, draft } — a single block of text the UI can append to a field.
// Used by the Weekly Review UI's per-field 'AI draft / AI append' button.

import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from "../../../lib/api-auth";
import { chatCompletion } from "../../../lib/ai-provider";
import {
  buildWeeklyImprovementContext,
  getWeekRangeFromStart,
} from "../../../lib/weeklyImprovementContext";
import {
  listAccessibleCategoriesWithMeta,
  listBacklogTasksForActor,
} from "../../../lib/projectCollaboration";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SECTION_PROMPTS = {
  wins:
    "Draft the user's WINS for the week — 3 to 6 short bullet lines. Pull from completed tasks, projects that moved, and reviews. Plain text, one line per win, no markdown bullets.",
  friction:
    "Draft the user's FRICTION for the week — what felt heavy, what was avoided, where things stalled. 2 to 4 short observations, plain text, one per line.",
  reality:
    "Draft a REALITY CHECK on what changed in the user's life context this week — time, energy, capacity, key constraints. 2 to 4 short observations, plain text, one per line.",
  leverage:
    "Propose the single highest-LEVERAGE move for next week — a smallest-action that compounds. One short paragraph (2-3 sentences max), plain text.",
  theme:
    "Suggest a one-line THEME for next week — a short frame the rest of the week orbits around. One sentence, no quotes, no preamble.",
  notes:
    "Draft NOTES / SUMMARY for the week — patterns the user might miss, things worth remembering. 2 to 4 short paragraphs, plain prose.",
};

const MAX_TOKENS = 600;

function snapshot(context) {
  return {
    weekly_summary: context.weekly_summary,
    project_movement: (context.projects || []).slice(0, 12).map((p) => ({
      name: p.category_name,
      open: p.open_root_count,
      done: p.completed_this_week,
      overdue: p.overdue_count,
      stale: p.stale_doing_count,
    })),
    needs: context.weekly_summary?.last_review?.needs || null,
    last_review_text: {
      wins: context.weekly_summary?.last_review?.wins || "",
      friction: context.weekly_summary?.last_review?.friction || "",
      reality_check: context.weekly_summary?.last_review?.reality_check || "",
      weekly_theme: context.weekly_summary?.last_review?.weekly_theme || "",
    },
    overdue_titles: (context.task_queues?.overdue || [])
      .slice(0, 6)
      .map((t) => `${t.title} (${t.category_name})`),
    stale_doing_titles: (context.task_queues?.stale_doing || [])
      .slice(0, 6)
      .map((t) => `${t.title} (${t.category_name})`),
    completed_titles: (context.task_queues?.completed_this_week || [])
      .slice(0, 12)
      .map((t) => `${t.title} (${t.category_name})`),
    signals: context.signals,
  };
}

async function loadTasksWithCategories(userId) {
  const [tasks, categories] = await Promise.all([
    listBacklogTasksForActor(userId, { includeArchived: false }),
    listAccessibleCategoriesWithMeta(userId),
  ]);
  const catMap = new Map((categories || []).map((c) => [c.id, c]));
  return {
    tasks: (tasks || []).map((t) => ({
      ...t,
      category: catMap.get(t.category_id) || t.category || null,
    })),
    categories: categories || [],
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  let userId;
  try {
    userId = await getAuthenticatedUserId(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const weekStart = String(req.body?.week_start || "").slice(0, 10);
  const section = String(req.body?.section || "");
  const currentText = String(req.body?.current_text || "");

  if (!weekStart) return res.status(400).json({ error: "week_start required" });
  if (!SECTION_PROMPTS[section])
    return res.status(400).json({ error: "unknown section" });

  try {
    const week = getWeekRangeFromStart(weekStart);
    const previousWeekStart = (() => {
      const d = new Date(`${weekStart}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 7);
      return d.toISOString().slice(0, 10);
    })();
    const previousWeek = getWeekRangeFromStart(previousWeekStart);
    const exclusiveEnd = (dateStr) => {
      const d = new Date(`${dateStr}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    };

    const [profileRes, taskBundle, currentReviewRes, completionsThisRes, completionsLastRes] =
      await Promise.all([
        supabase.from("user_profile").select("profile").eq("user_id", userId).maybeSingle(),
        loadTasksWithCategories(userId),
        supabase
          .from("human_needs_weekly")
          .select("user_id, week_start, scores, notes, created_at")
          .eq("user_id", userId)
          .eq("week_start", weekStart)
          .maybeSingle(),
        supabase
          .from("task_events")
          .select("id, task_id, created_at, value")
          .or(`user_id.eq.${userId},actor_user_id.eq.${userId}`)
          .eq("event_type", "completed")
          .gte("created_at", `${week.start}T00:00:00.000Z`)
          .lt("created_at", `${exclusiveEnd(week.end)}T00:00:00.000Z`),
        supabase
          .from("task_events")
          .select("id, task_id, created_at, value")
          .or(`user_id.eq.${userId},actor_user_id.eq.${userId}`)
          .eq("event_type", "completed")
          .gte("created_at", `${previousWeek.start}T00:00:00.000Z`)
          .lt("created_at", `${exclusiveEnd(previousWeek.end)}T00:00:00.000Z`),
      ]);

    const profile = profileRes.data?.profile || {};
    const context = buildWeeklyImprovementContext({
      weekStart,
      profile,
      categories: taskBundle.categories,
      tasks: taskBundle.tasks,
      completionsThisWeek: completionsThisRes.data || [],
      completionsLastWeek: completionsLastRes.data || [],
      latestReview: currentReviewRes.data || null,
    });

    const compact = snapshot(context);

    const system = `You are the user's Rise & Shine weekly-review writing partner. The user writes their own review; your job is to draft one specific section in their voice based on the week's data. Be honest about what didn't move and concrete about what did. No markdown headings, no bullet glyphs. Plain prose unless the section asks for short lines.`;

    const sectionInstruction = SECTION_PROMPTS[section];
    const continueClause = currentText
      ? `The user has already written this for the section:\n"""\n${currentText.slice(0, 800)}\n"""\nDo NOT repeat what they wrote. Append fresh observations they might have missed.`
      : `The section is currently empty.`;

    const userPrompt = `Week of ${weekStart}.

${sectionInstruction}

${continueClause}

Week data (JSON):
${JSON.stringify(compact, null, 2)}`;

    const result = await chatCompletion({
      system,
      messages: [{ role: "user", content: userPrompt }],
    });

    const draft = (result?.content || "").trim();
    if (!draft) {
      return res.status(502).json({ error: "AI returned no content." });
    }

    return res.json({ ok: true, draft, max_tokens_hint: MAX_TOKENS });
  } catch (err) {
    return res
      .status(err?.status || 500)
      .json({ error: err?.message || "Failed to draft section." });
  }
}
