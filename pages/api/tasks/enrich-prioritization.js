import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from "../../../lib/api-auth";
import {
  buildHeuristicEnrichment,
  sanitizeAiEnrichment,
  isMissingPrioritizationMetadata,
  mergeTagNames,
  computeTaskPatch,
  ENRICHMENT_TAGS,
  normalizeTagList,
} from "../../../lib/task-enrichment";
import {
  HUMAN_NEED_STRATEGY_KEYS as LIFE_DOMAIN_KEYS,
  HUMAN_NEED_STRATEGY_LABELS,
} from "../../../lib/humanNeedStrategies";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.ENRICHMENT_MODEL || process.env.PLANNER_MODEL || "gpt-4.1-mini";
const AI_BATCH_SIZE = 10;
const AI_TIMEOUT_MS = 25000;
const ENRICHMENT_PROMPT_VERSION = "task_enrichment_v1";

function withTimeout(promise, timeoutMs) {
  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("enrichment_ai_timeout")), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function fetchAllCandidateTasks(userId) {
  const allTasks = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("tasks")
      .select("id,title,priority,effort_hours,due_date,status,category_id,outcome_ids,primary_life_domain")
      .eq("user_id", userId)
      .in("status", ["todo", "doing"])
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const rows = data || [];
    allTasks.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return allTasks;
}

async function fetchAiEnrichmentsInBatches(tasks, visionContext = {}) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { rows: [], error: null, batches: 0, batchSize: AI_BATCH_SIZE };
  }

  const rows = [];
  const errors = [];

  for (let i = 0; i < tasks.length; i += AI_BATCH_SIZE) {
    const batch = tasks.slice(i, i + AI_BATCH_SIZE);
    const result = await fetchAiEnrichments(batch, visionContext);
    rows.push(...(result.rows || []));
    if (result.error) {
      errors.push(`batch_${Math.floor(i / AI_BATCH_SIZE) + 1}:${result.error}`);
    }
  }

  const uniqueErrors = Array.from(new Set(errors));
  const summarizedError = uniqueErrors.length > 0
    ? `${uniqueErrors.length} batch error${uniqueErrors.length === 1 ? "" : "s"}: ${uniqueErrors.slice(0, 3).join(" | ")}`
    : null;

  return {
    rows,
    error: summarizedError,
    batches: Math.ceil(tasks.length / AI_BATCH_SIZE),
    batchSize: AI_BATCH_SIZE,
  };
}

async function ensureTagIds(userId, names) {
  const normalizedNames = normalizeTagList(names);
  const ids = [];

  for (const name of normalizedNames) {
    const { data: existing, error: existingErr } = await supabase
      .from("tags")
      .select("id")
      .eq("user_id", userId)
      .ilike("name", name)
      .limit(1)
      .maybeSingle();
    if (existingErr) throw existingErr;

    if (existing?.id) {
      ids.push(existing.id);
      continue;
    }

    const { data: created, error: createErr } = await supabase
      .from("tags")
      .insert({ user_id: userId, name })
      .select("id")
      .single();
    if (createErr) throw createErr;

    ids.push(created.id);
  }

  return ids;
}

async function fetchAiEnrichments(tasks, visionContext = {}) {
  if (!Array.isArray(tasks) || tasks.length === 0) return { rows: [], error: null };

  const desiredOutcomes = visionContext.desired_outcomes || [];
  const lifeDomains = visionContext.life_domains || {};

  const input = {
    task_count: tasks.length,
    allowed_tags: ENRICHMENT_TAGS,
    desired_outcomes: desiredOutcomes.map((o) => ({ id: o.id || o.title, title: o.title || o.id })),
    life_domain_keys: LIFE_DOMAIN_KEYS,
    human_need_strategy_labels: HUMAN_NEED_STRATEGY_LABELS,
    tasks: tasks.map((t) => ({
      task_id: t.id,
      title: t.title,
      priority: t.priority,
      effort_hours: t.effort_hours,
      due_date: t.due_date,
      status: t.status,
      tags: normalizeTagList(t.tags || []),
      category: t.category || "Unknown",
    })),
    output_schema: {
      enrichments: [
        {
          task_id: "uuid",
          priority: "Critical|High|Medium|Low",
          effort_bucket: "XS|S|M|L",
          tags_add: ["quick-win|high-leverage|urgent|blocked|waiting"],
          outcome_ids: "optional array of outcome ids from desired_outcomes",
          primary_life_domain: "optional one of: " + LIFE_DOMAIN_KEYS.join(", "),
          rationale: "string",
        },
      ],
    },
  };

  const instructions = `You enrich task prioritization metadata and optionally link tasks to the user's desired outcomes and human need strategies. The stored keys remain the values in life_domain_keys, and human_need_strategy_labels maps those legacy keys to the visible labels shown in the app. Return ONLY valid JSON matching the schema. Keep rationale under 180 chars. For outcome_ids use only ids from desired_outcomes. For primary_life_domain use one of the life_domain_keys. Be conservative and practical; leave outcome_ids/primary_life_domain empty if unclear.`;

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
    if (!parsed || !Array.isArray(parsed.enrichments)) {
      return { rows: [], error: "invalid_ai_json" };
    }

    return { rows: parsed.enrichments, error: null };
  } catch (error) {
    return { rows: [], error: error?.message || "ai_error" };
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    const userId = await getAuthenticatedUserId(req);

    const requestedLimit = Number(req.body?.limit);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.floor(requestedLimit)
      : null;

    const apply = req.body?.apply === true;
    const dryRun = apply ? false : req.body?.dry_run !== false;

    const tasks = await fetchAllCandidateTasks(userId);
    const taskIds = (tasks || []).map((t) => t.id);

    const [
      { data: categories, error: catErr },
      { data: links, error: linksErr },
      { data: tags, error: tagsErr },
      { data: profileData },
    ] = await Promise.all([
      supabase.from("categories").select("id,name").eq("user_id", userId),
      taskIds.length > 0
        ? supabase.from("task_tags").select("task_id,tag_id").eq("user_id", userId).in("task_id", taskIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("tags").select("id,name").eq("user_id", userId),
      supabase.from("user_profile").select("profile").eq("user_id", userId).maybeSingle(),
    ]);

    const profile = profileData?.profile || {};
    const visionContext = {
      desired_outcomes: profile.desired_outcomes || [],
      life_domains: profile.life_domains || {},
    };
    const allowedOutcomeIds = (profile.desired_outcomes || []).map((o) => o.id || o.title).filter(Boolean);

    if (catErr) throw catErr;
    if (linksErr) throw linksErr;
    if (tagsErr) throw tagsErr;

    const categoryMap = Object.fromEntries((categories || []).map((c) => [c.id, c.name]));
    const tagMap = Object.fromEntries((tags || []).map((t) => [t.id, t.name]));
    const tagsByTask = {};

    for (const link of links || []) {
      const tagName = tagMap[link.tag_id];
      if (!tagName) continue;
      tagsByTask[link.task_id] = tagsByTask[link.task_id] || [];
      tagsByTask[link.task_id].push(tagName);
    }

    const enrichedTasks = (tasks || []).map((task) => ({
      ...task,
      category: categoryMap[task.category_id] || "Unknown",
      tags: tagsByTask[task.id] || [],
    }));

    const missingTasks = enrichedTasks.filter(isMissingPrioritizationMetadata);
    const candidates = limit ? missingTasks.slice(0, limit) : missingTasks;

    if (candidates.length === 0) {
      return res.json({
        ok: true,
        dry_run: dryRun,
        apply,
        processed: 0,
        cap: limit || null,
        total_eligible: missingTasks.length,
        batch_size: AI_BATCH_SIZE,
        report: { updated: [], skipped: [], errors: [] },
        notes: ["No tasks missing prioritization metadata."],
        meta: {
          prompt_version: ENRICHMENT_PROMPT_VERSION,
          model: MODEL,
        },
      });
    }

    const aiResult = await fetchAiEnrichmentsInBatches(candidates, visionContext);
    const aiByTaskId = Object.fromEntries(
      (aiResult.rows || [])
        .map((row) => {
          const task = candidates.find((t) => t.id === row.task_id);
          if (!task) return null;
          return [task.id, sanitizeAiEnrichment(row, task, { allowedOutcomeIds })];
        })
        .filter(Boolean)
    );

    const report = {
      updated: [],
      skipped: [],
      errors: [],
    };

    for (const task of candidates) {
      try {
        const aiSuggestion = aiByTaskId[task.id] || null;
        const fallbackSuggestion = buildHeuristicEnrichment(task);

        const enrichment = {
          task_id: task.id,
          priority: aiSuggestion?.priority || fallbackSuggestion.priority,
          effort_bucket: aiSuggestion?.effort_bucket || fallbackSuggestion.effort_bucket,
          tags_add: mergeTagNames([], [
            ...(aiSuggestion?.tags_add || []),
            ...(fallbackSuggestion.tags_add || []),
          ]).filter((t) => ENRICHMENT_TAGS.includes(t)),
          rationale: aiSuggestion?.rationale || fallbackSuggestion.rationale,
          source: aiSuggestion ? "ai+heuristic" : "heuristic",
        };

        const patch = computeTaskPatch(task, enrichment, { allowedOutcomeIds });
        const finalTags = mergeTagNames(task.tags || [], enrichment.tags_add || []);
        const hasTagChanges = finalTags.length > normalizeTagList(task.tags || []).length;

        if (Object.keys(patch).length === 0 && !hasTagChanges) {
          report.skipped.push({
            task_id: task.id,
            title: task.title,
            reason: "No missing fields to enrich",
          });
          continue;
        }

        if (!dryRun && apply) {
          if (Object.keys(patch).length > 0) {
            const { error: updErr } = await supabase
              .from("tasks")
              .update(patch)
              .eq("user_id", userId)
              .eq("id", task.id);
            if (updErr) throw updErr;
          }

          if (hasTagChanges) {
            const tagIds = await ensureTagIds(userId, finalTags);
            const existingTagIds = new Set(
              (links || [])
                .filter((l) => l.task_id === task.id)
                .map((l) => l.tag_id)
            );
            const newLinks = tagIds
              .filter((tagId) => !existingTagIds.has(tagId))
              .map((tag_id) => ({ user_id: userId, task_id: task.id, tag_id }));
            if (newLinks.length > 0) {
              const { error: linkErr } = await supabase.from("task_tags").insert(newLinks);
              if (linkErr) throw linkErr;
            }
          }

          await supabase.from("task_events").insert({
            user_id: userId,
            task_id: task.id,
            event_type: "updated",
            value: {
              source: "task_enrichment_mvp",
              prompt_version: ENRICHMENT_PROMPT_VERSION,
              mode: "apply",
              applied_patch: patch,
              tags_added: (enrichment.tags_add || []).filter((tag) => !normalizeTagList(task.tags || []).includes(tag)),
              rationale: enrichment.rationale,
            },
          });
        }

        report.updated.push({
          task_id: task.id,
          title: task.title,
          patch,
          tags_before: normalizeTagList(task.tags || []),
          tags_after: finalTags,
          enrichment,
        });
      } catch (error) {
        report.errors.push({
          task_id: task.id,
          title: task.title,
          error: error?.message || String(error),
        });
      }
    }

    return res.json({
      ok: true,
      dry_run: dryRun,
      apply,
      processed: candidates.length,
      cap: limit || null,
      total_eligible: missingTasks.length,
      batch_size: aiResult.batchSize || AI_BATCH_SIZE,
      batches: aiResult.batches || 0,
      ai_status: aiResult.error ? `fallback:${aiResult.error}` : "ok",
      report,
      meta: {
        prompt_version: ENRICHMENT_PROMPT_VERSION,
        model: MODEL,
      },
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || String(e) });
  }
}
