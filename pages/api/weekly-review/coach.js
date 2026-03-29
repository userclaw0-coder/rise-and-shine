import crypto from "crypto";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from "../../../lib/api-auth";
import {
  buildFallbackWeeklyCoachOutput,
  buildWeeklyImprovementContext,
  getWeekRangeFromStart,
  WEEKLY_COACH_PROMPT_VERSION,
  WEEKLY_IMPROVEMENT_SCORING_VERSION,
} from "../../../lib/weeklyImprovementContext";
import {
  listAccessibleCategoriesWithMeta,
  listBacklogTasksForActor,
} from "../../../lib/projectCollaboration";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.WEEKLY_COACH_MODEL || process.env.PLANNER_MODEL || "gpt-4.1-mini";
const AI_TIMEOUT_MS = 25000;

function getCurrentWeekStart() {
  const now = new Date();
  const day = now.getUTCDay() || 7;
  now.setUTCDate(now.getUTCDate() - (day - 1));
  return now.toISOString().slice(0, 10);
}

function nextDateStr(dateStr, days = 1) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function withTimeout(promise, timeoutMs) {
  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("weekly_coach_ai_timeout")), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || "").match(/\{[\s\S]*\}$/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function hashPayload(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24);
}

function buildContextExcerpt(context) {
  return {
    versions: context.versions,
    week: context.week,
    overview: context.overview,
    review: {
      notes: context.review?.notes || {},
    },
    task_queues: {
      needs_alignment: (context.task_queues?.needs_alignment || []).slice(0, 8).map((row) => ({
        id: row.id,
        title: row.title,
        category_name: row.category_name,
      })),
      needs_subtasks: (context.task_queues?.needs_subtasks || []).slice(0, 8).map((row) => ({
        id: row.id,
        title: row.title,
        category_name: row.category_name,
      })),
      stale_doing: (context.task_queues?.stale_doing || []).slice(0, 8).map((row) => ({
        id: row.id,
        title: row.title,
        category_name: row.category_name,
      })),
      overdue: (context.task_queues?.overdue || []).slice(0, 8).map((row) => ({
        id: row.id,
        title: row.title,
        category_name: row.category_name,
        due_date: row.due_date,
      })),
      priority_cleanup: (context.task_queues?.priority_cleanup || []).slice(0, 8).map((row) => ({
        id: row.id,
        title: row.title,
        category_name: row.category_name,
      })),
    },
    projects: (context.projects || []).slice(0, 12).map((project) => ({
      category_id: project.category_id,
      category_name: project.category_name,
      open_root_count: project.open_root_count,
      completed_this_week: project.completed_this_week,
      overdue_count: project.overdue_count,
      stale_doing_count: project.stale_doing_count,
      unaligned_count: project.unaligned_count,
      needs_subtasks_count: project.needs_subtasks_count,
      alignment_coverage_pct: project.alignment_coverage_pct,
      workspace_completeness: project.workspace_completeness,
      needs_attention: project.needs_attention,
    })),
    signals: context.signals,
  };
}

async function loadTasksWithTags(userId) {
  const [tasks, categories] = await Promise.all([
    listBacklogTasksForActor(userId, { includeArchived: false }),
    listAccessibleCategoriesWithMeta(userId),
  ]);

  const categoryMap = new Map((categories || []).map((c) => [c.id, c]));

  return {
    tasks: (tasks || []).map((task) => ({
      ...task,
      category: categoryMap.get(task.category_id) || task.category || null,
      tags: Array.isArray(task.tags)
        ? task.tags.map((tag) => (typeof tag === "string" ? tag : tag?.tag?.name || tag?.name || "")).filter(Boolean)
        : [],
    })),
    categories: categories || [],
  };
}

async function loadCompletionEvents(userId, startDate, endExclusiveDate) {
  const { data, error } = await supabase
    .from("task_events")
    .select("id, task_id, created_at, value")
    .or(`user_id.eq.${userId},actor_user_id.eq.${userId}`)
    .eq("event_type", "completed")
    .gte("created_at", `${startDate}T00:00:00.000Z`)
    .lt("created_at", `${endExclusiveDate}T00:00:00.000Z`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    const userId = await getAuthenticatedUserId(req);
    const weekStart = String(req.body?.week_start || getCurrentWeekStart()).slice(0, 10);
    const week = getWeekRangeFromStart(weekStart);
    const previousWeekStart = nextDateStr(weekStart, -7);
    const previousWeek = getWeekRangeFromStart(previousWeekStart);

    const [
      { data: profileRow, error: profileErr },
      { tasks, categories },
      currentReviewRes,
      pastReviewsRes,
      refinementRes,
      improvementRunsRes,
      completionsThisWeek,
      completionsLastWeek,
    ] = await Promise.all([
      supabase.from("user_profile").select("profile").eq("user_id", userId).maybeSingle(),
      loadTasksWithTags(userId),
      supabase.from("human_needs_weekly").select("user_id, week_start, scores, notes, created_at").eq("user_id", userId).eq("week_start", weekStart).maybeSingle(),
      supabase.from("human_needs_weekly").select("user_id, week_start, scores, notes, created_at").eq("user_id", userId).order("week_start", { ascending: false }).limit(8),
      supabase.from("task_events").select("id, task_id, event_type, created_at, value").or(`user_id.eq.${userId},actor_user_id.eq.${userId}`).eq("event_type", "updated").gte("created_at", `${previousWeekStart}T00:00:00.000Z`).order("created_at", { ascending: false }),
      supabase.from("weekly_improvement_runs").select("*").eq("user_id", userId).order("week_start", { ascending: false }).limit(8),
      loadCompletionEvents(userId, week.start, nextDateStr(week.end, 1)),
      loadCompletionEvents(userId, previousWeek.start, nextDateStr(previousWeek.end, 1)),
    ]);

    if (profileErr) throw profileErr;
    if (currentReviewRes.error) throw currentReviewRes.error;
    if (pastReviewsRes.error) throw pastReviewsRes.error;
    if (refinementRes.error) throw refinementRes.error;
    if (improvementRunsRes.error) throw improvementRunsRes.error;

    const profile = profileRow?.profile || {};
    const context = buildWeeklyImprovementContext({
      weekStart,
      profile,
      categories,
      tasks,
      completionsThisWeek,
      completionsLastWeek,
      latestReview: currentReviewRes.data || null,
      allReviews: pastReviewsRes.data || [],
      refinementEvents: refinementRes.data || [],
      improvementRuns: improvementRunsRes.data || [],
    });
    const contextExcerpt = buildContextExcerpt(context);

    const fallback = buildFallbackWeeklyCoachOutput(context);

    let aiOutput = fallback;
    let aiStatus = "fallback:no_api_key";
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey && apiKey.trim()) {
      const input = {
        context: contextExcerpt,
        output_schema: {
          summary: "string",
          next_week_focus: { theme: "string", why: "string" },
          project_fixes: [
            {
              id: "string",
              type: "project_fix",
              category_id: "uuid",
              title: "string",
              summary: "string",
              apply_patch: { workspace: { suggested_move: "string", efficiency_tip: "string" } },
            },
          ],
          task_fixes: [],
          alignment_fixes: [
            {
              id: "string",
              type: "alignment_fix",
              task_id: "uuid",
              title: "string",
              summary: "string",
              apply_patch: { task: { outcome_ids: ["string"], primary_life_domain: "string", alignment_source: "ai" } },
            },
          ],
          subtask_suggestions: [
            {
              id: "string",
              type: "subtask_suggestion",
              parent_task_id: "uuid",
              title: "string",
              summary: "string",
              apply_patch: { create_task: { title: "string", estimated_minutes: 30, tags: ["quick-win"] } },
            },
          ],
          priority_adjustments: [
            {
              id: "string",
              type: "priority_adjustment",
              task_id: "uuid",
              title: "string",
              summary: "string",
              apply_patch: { task: { priority: "High" }, tags_add: ["urgent"] },
            },
          ],
          scoring_tweaks: [{ id: "string", category_name: "string", suggested_weight: 1, summary: "string" }],
          app_improvement_suggestions: [{ id: "string", title: "string", summary: "string", area: "string" }],
        },
      };

      const instructions = `You are Rise & Shine's weekly recursive-improvement coach. Return ONLY valid JSON. Prefer small, approval-based suggestions that improve structure, strategy, alignment, prioritization, and bite-sized execution. Do not invent fields outside the schema. Keep summaries concise and practical.`;
      try {
        const response = await withTimeout(
          openai.responses.create({
            model: MODEL,
            instructions,
            input: JSON.stringify(input),
          }),
          AI_TIMEOUT_MS
        );
        const parsed = safeJsonParse(response.output_text || "");
        if (parsed) {
          aiOutput = parsed;
          aiStatus = "ok";
        } else {
          aiStatus = "fallback:non_json";
        }
      } catch (error) {
        aiStatus = `fallback:${error?.message || "ai_error"}`;
      }
    }

    const payloadHash = hashPayload({
      week_start: week.start,
      context: contextExcerpt,
      ai_output: aiOutput,
      prompt_version: WEEKLY_COACH_PROMPT_VERSION,
      scoring_version: WEEKLY_IMPROVEMENT_SCORING_VERSION,
    });

    const { data: run, error: upsertErr } = await supabase
      .from("weekly_improvement_runs")
      .upsert(
        {
          user_id: userId,
          week_start: week.start,
          week_end: week.end,
          source: "weekly_coach",
          status: "ready",
          input_hash: payloadHash,
          prompt_version: WEEKLY_COACH_PROMPT_VERSION,
          scoring_version: WEEKLY_IMPROVEMENT_SCORING_VERSION,
          model: MODEL,
          context_json: contextExcerpt,
          ai_output: aiOutput,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,week_start,source" }
      )
      .select("*")
      .single();
    if (upsertErr) throw upsertErr;

    return res.json({
      ok: true,
      run,
      coach: aiOutput,
      context: contextExcerpt,
      meta: {
        ai_status: aiStatus,
        prompt_version: WEEKLY_COACH_PROMPT_VERSION,
        scoring_version: WEEKLY_IMPROVEMENT_SCORING_VERSION,
        model: MODEL,
      },
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Failed to generate weekly improvement coach output.",
    });
  }
}
