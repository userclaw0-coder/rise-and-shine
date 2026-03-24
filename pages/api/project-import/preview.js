import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from "../../../lib/api-auth";
import {
  EXTERNAL_PROJECT_IMPORT_SCHEMA_VERSION,
  EXTERNAL_PROJECT_IMPORT_SOURCE,
  EXTERNAL_PROJECT_PROMPT_VERSION,
  flattenExternalProjectImportActions,
  groupExternalProjectImportActions,
  normalizeExternalProjectImport,
  safeJsonParse,
  summarizeExternalProjectImport,
} from "../../../lib/externalProjectImport";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function hashPayload(payload) {
  return crypto.createHash("sha256").update(String(payload || "")).digest("hex").slice(0, 24);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    const userId = await getAuthenticatedUserId(req);
    const categoryId = String(req.body?.category_id || "").trim();
    const importText = String(req.body?.import_text || "").trim();
    if (!categoryId) return res.status(400).json({ error: "category_id is required" });
    if (!importText) return res.status(400).json({ error: "Paste the JSON returned by your external AI." });

    const [{ data: category, error: categoryErr }, { data: profileRow, error: profileErr }, { data: tasks, error: taskErr }] =
      await Promise.all([
        supabase
          .from("categories")
          .select("id, name")
          .eq("user_id", userId)
          .eq("id", categoryId)
          .maybeSingle(),
        supabase.from("user_profile").select("profile").eq("user_id", userId).maybeSingle(),
        supabase
          .from("tasks")
          .select("id, parent_task_id, title, status, priority, due_date, effort_hours, outcome_ids, primary_life_domain, life_domains, alignment_source")
          .eq("user_id", userId)
          .eq("category_id", categoryId)
          .neq("status", "archived"),
      ]);

    if (categoryErr) throw categoryErr;
    if (profileErr) throw profileErr;
    if (taskErr) throw taskErr;
    if (!category) return res.status(404).json({ error: "Project not found." });

    const rawJson = safeJsonParse(importText);
    if (!rawJson || typeof rawJson !== "object") {
      return res.status(400).json({
        error: "Could not parse valid JSON from the pasted response. Ask the model to return only the JSON object.",
      });
    }

    const profile = profileRow?.profile || {};
    const normalized = normalizeExternalProjectImport(rawJson, {
      categoryId,
      category,
      profile,
      tasks: tasks || [],
    });
    const groups = groupExternalProjectImportActions(normalized, categoryId);
    const actions = flattenExternalProjectImportActions(normalized, categoryId);
    if (actions.length === 0) {
      return res.status(400).json({
        error: "The import parsed, but it did not contain any valid reviewable actions for this project.",
      });
    }

    const previewMetrics = {
      ...summarizeExternalProjectImport(normalized, categoryId),
      parsed_ok: true,
      category_name: category.name,
    };
    const sourceModel = normalized.meta?.source_model || "";

    const { data: run, error: runErr } = await supabase
      .from("external_ai_import_runs")
      .insert({
        user_id: userId,
        category_id: categoryId,
        status: "draft",
        source: EXTERNAL_PROJECT_IMPORT_SOURCE,
        source_model: sourceModel || null,
        prompt_version: normalized.meta?.prompt_version || EXTERNAL_PROJECT_PROMPT_VERSION,
        schema_version: normalized.meta?.schema_version || EXTERNAL_PROJECT_IMPORT_SCHEMA_VERSION,
        input_hash: hashPayload(importText),
        raw_text: importText,
        raw_json: rawJson,
        normalized_json: normalized,
        preview_metrics: previewMetrics,
      })
      .select("*")
      .single();
    if (runErr) throw runErr;

    return res.json({
      ok: true,
      run,
      preview: {
        metrics: previewMetrics,
        groups,
      },
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: error?.message || "Failed to preview external AI import.",
    });
  }
}
