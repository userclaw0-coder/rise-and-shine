const LIFE_DOMAIN_KEYS = ["business", "finances", "health", "relationships", "lifestyle", "growth"];
const RESOURCE_KINDS = ["folder", "doc", "ai", "archive", "other"];
const TASK_PRIORITIES = ["Critical", "High", "Medium", "Low"];
const TASK_STATUSES = ["todo", "doing", "done", "archived"];
const VISION_ACTIONS = [
  "add_desired_outcome",
  "update_desired_outcome",
  "add_quarter_focus",
  "add_strategy_note",
];

export const EXTERNAL_PROJECT_IMPORT_SCHEMA_VERSION = "external_project_import_v1";
export const EXTERNAL_PROJECT_PROMPT_VERSION = "external_project_prompt_v1";
export const EXTERNAL_PROJECT_IMPORT_SOURCE = "external_project_import";

function cleanText(value, maxLen = 4000) {
  const text = String(value || "").trim();
  return text ? text.slice(0, maxLen) : "";
}

function normalizeStringList(values, maxItems = 24, maxLen = 240) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => cleanText(value, maxLen))
        .filter(Boolean)
    )
  ).slice(0, maxItems);
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeResource(resource, idx = 0) {
  const kind = RESOURCE_KINDS.includes(resource?.kind) ? resource.kind : "other";
  const label = cleanText(resource?.label, 120);
  const url = cleanText(resource?.url, 1000);
  if (!label && !url) return null;
  return {
    id: cleanText(resource?.id, 80) || `import_resource_${idx + 1}`,
    label,
    url,
    kind,
  };
}

function normalizeOutcomePatch(outcome) {
  if (!outcome || typeof outcome !== "object") return null;
  const title = cleanText(outcome.title, 200);
  if (!title) return null;
  const domain = LIFE_DOMAIN_KEYS.includes(outcome.domain) ? outcome.domain : null;
  const time_horizon = cleanText(outcome.time_horizon, 80);
  const success_metric = cleanText(outcome.success_metric, 240);
  const priority_rank = Number.isFinite(Number(outcome.priority_rank))
    ? Number(outcome.priority_rank)
    : null;
  return {
    id: cleanText(outcome.id, 80) || null,
    title,
    domain,
    time_horizon,
    success_metric,
    priority_rank,
  };
}

function normalizeTaskPatch(taskPatch, allowedOutcomeIds) {
  if (!taskPatch || typeof taskPatch !== "object") return {};
  const patch = {};
  const title = cleanText(taskPatch.title, 240);
  if (title) patch.title = title;
  if (TASK_PRIORITIES.includes(taskPatch.priority)) patch.priority = taskPatch.priority;
  if (TASK_STATUSES.includes(taskPatch.status)) patch.status = taskPatch.status;
  if (taskPatch.due_date) patch.due_date = cleanText(taskPatch.due_date, 20).slice(0, 10);
  if (taskPatch.effort_hours !== undefined && taskPatch.effort_hours !== null && taskPatch.effort_hours !== "") {
    const hours = Number(taskPatch.effort_hours);
    if (Number.isFinite(hours) && hours >= 0) patch.effort_hours = Math.min(hours, 200);
  }

  const outcomeIds = normalizeStringList(taskPatch.outcome_ids, 8, 80).filter((id) =>
    allowedOutcomeIds.has(id)
  );
  if (outcomeIds.length > 0) patch.outcome_ids = outcomeIds;

  if (LIFE_DOMAIN_KEYS.includes(taskPatch.primary_life_domain)) {
    patch.primary_life_domain = taskPatch.primary_life_domain;
  }

  const lifeDomains = normalizeStringList(taskPatch.life_domains, 6, 40).filter((key) =>
    LIFE_DOMAIN_KEYS.includes(key)
  );
  if (lifeDomains.length > 0) patch.life_domains = lifeDomains;

  if (
    patch.primary_life_domain ||
    (Array.isArray(patch.outcome_ids) && patch.outcome_ids.length > 0) ||
    (Array.isArray(patch.life_domains) && patch.life_domains.length > 0)
  ) {
    patch.alignment_source = "ai";
  }

  return patch;
}

function normalizeCreateTask(createTask, allowedOutcomeIds) {
  if (!createTask || typeof createTask !== "object") return null;
  const title = cleanText(createTask.title, 240);
  if (!title) return null;
  const payload = {
    title,
    priority: TASK_PRIORITIES.includes(createTask.priority) ? createTask.priority : "Medium",
    status: TASK_STATUSES.includes(createTask.status) ? createTask.status : "todo",
    due_date: createTask.due_date ? cleanText(createTask.due_date, 20).slice(0, 10) : null,
    tags: normalizeStringList(createTask.tags, 10, 40),
  };
  if (createTask.effort_hours !== undefined && createTask.effort_hours !== null && createTask.effort_hours !== "") {
    const hours = Number(createTask.effort_hours);
    if (Number.isFinite(hours) && hours >= 0) payload.effort_hours = Math.min(hours, 200);
  }
  const outcomeIds = normalizeStringList(createTask.outcome_ids, 8, 80).filter((id) =>
    allowedOutcomeIds.has(id)
  );
  if (outcomeIds.length > 0) payload.outcome_ids = outcomeIds;
  if (LIFE_DOMAIN_KEYS.includes(createTask.primary_life_domain)) {
    payload.primary_life_domain = createTask.primary_life_domain;
  }
  const lifeDomains = normalizeStringList(createTask.life_domains, 6, 40).filter((key) =>
    LIFE_DOMAIN_KEYS.includes(key)
  );
  if (lifeDomains.length > 0) payload.life_domains = lifeDomains;
  if (payload.primary_life_domain || payload.outcome_ids?.length || payload.life_domains?.length) {
    payload.alignment_source = "ai";
  }
  return payload;
}

function extractTagNames(task) {
  return ensureArray(task?.tags)
    .map((tag) => {
      if (!tag) return "";
      if (typeof tag === "string") return tag;
      if (tag.tag?.name) return tag.tag.name;
      if (tag.name) return tag.name;
      return "";
    })
    .filter(Boolean);
}

function hasWorkspacePatch(patch) {
  if (!patch || typeof patch !== "object") return false;
  return Boolean(
    cleanText(patch.mantra, 240) ||
      cleanText(patch.narrative, 6000) ||
      cleanText(patch.efficiency_tip, 500) ||
      ensureArray(patch.suggested_moves).length > 0 ||
      ensureArray(patch.resources).length > 0 ||
      (patch.health_needs && typeof patch.health_needs === "object")
  );
}

function normalizeWorkspacePatch(workspacePatch) {
  if (!hasWorkspacePatch(workspacePatch)) return null;
  const health = workspacePatch?.health_needs || {};
  const normalized = {};
  const mantra = cleanText(workspacePatch?.mantra, 240);
  const narrative = cleanText(workspacePatch?.narrative, 6000);
  const efficiency_tip = cleanText(workspacePatch?.efficiency_tip, 500);
  const suggested_moves = normalizeStringList(workspacePatch?.suggested_moves, 12, 240);
  const resources = ensureArray(workspacePatch?.resources)
    .map((resource, idx) => normalizeResource(resource, idx))
    .filter(Boolean)
    .slice(0, 24);
  const health_needs = {};

  if (mantra) normalized.mantra = mantra;
  if (narrative) normalized.narrative = narrative;
  if (efficiency_tip) normalized.efficiency_tip = efficiency_tip;
  if (suggested_moves.length > 0) normalized.suggested_moves = suggested_moves;
  if (resources.length > 0) normalized.resources = resources;

  ["relationships", "financial", "wellbeing", "growth"].forEach((key) => {
    const value = Number(health[key]);
    if (Number.isFinite(value)) health_needs[key] = Math.max(0, Math.min(100, Math.round(value)));
  });
  if (Object.keys(health_needs).length > 0) normalized.health_needs = health_needs;

  return Object.keys(normalized).length > 0 ? normalized : null;
}

export function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const raw = String(text || "").trim();
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        // ignore
      }
    }
    const match = raw.match(/\{[\s\S]*\}$/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export function buildProjectJsonSeed({
  category,
  profile,
  workspace,
  tasks,
  legacyLinksText = "",
}) {
  const desiredOutcomes = ensureArray(profile?.desired_outcomes).map((outcome) => ({
    id: cleanText(outcome?.id, 80) || cleanText(outcome?.title, 160),
    title: cleanText(outcome?.title, 200),
    domain: LIFE_DOMAIN_KEYS.includes(outcome?.domain) ? outcome.domain : null,
    time_horizon: cleanText(outcome?.time_horizon, 80),
    success_metric: cleanText(outcome?.success_metric, 240),
    priority_rank: Number.isFinite(Number(outcome?.priority_rank))
      ? Number(outcome.priority_rank)
      : null,
  }));

  return {
    meta: {
      schema_version: EXTERNAL_PROJECT_IMPORT_SCHEMA_VERSION,
      prompt_version: EXTERNAL_PROJECT_PROMPT_VERSION,
      export_generated_at: new Date().toISOString(),
      project_category_id: String(category?.id || ""),
      project_category_name: cleanText(category?.name, 160) || "Project",
    },
    project: {
      category: {
        id: String(category?.id || ""),
        name: cleanText(category?.name, 160) || "Project",
      },
      workspace: {
        mantra: cleanText(workspace?.mantra, 240),
        narrative: cleanText(workspace?.narrative, 6000),
        efficiency_tip: cleanText(workspace?.efficiency_tip, 500),
        suggested_moves: normalizeStringList(workspace?.suggested_moves, 16, 240),
        resources: ensureArray(workspace?.resources)
          .map((resource, idx) => normalizeResource(resource, idx))
          .filter(Boolean),
        health_needs: {
          relationships: Number(workspace?.health_needs?.relationships ?? 0),
          financial: Number(workspace?.health_needs?.financial ?? 0),
          wellbeing: Number(workspace?.health_needs?.wellbeing ?? 0),
          growth: Number(workspace?.health_needs?.growth ?? 0),
        },
      },
      legacy_links_text: cleanText(legacyLinksText, 4000),
    },
    vision: {
      identity_attributes: normalizeStringList(profile?.identity_attributes, 16, 120),
      life_domains: profile?.life_domains || {},
      desired_outcomes: desiredOutcomes,
      quarter_focus: normalizeStringList(profile?.quarter_focus, 12, 160),
      leverage_focus: normalizeStringList(profile?.leverage_focus, 12, 200),
      thrive_goals: normalizeStringList(profile?.thrive_goals, 16, 240),
      immediate_step: cleanText(profile?.immediate_step, 240),
    },
    tasks: ensureArray(tasks).map((task) => ({
      id: String(task?.id || ""),
      parent_task_id: task?.parent_task_id ? String(task.parent_task_id) : null,
      title: cleanText(task?.title, 240),
      status: TASK_STATUSES.includes(task?.status) ? task.status : "todo",
      priority: TASK_PRIORITIES.includes(task?.priority) ? task.priority : "Medium",
      due_date: task?.due_date ? cleanText(task.due_date, 20).slice(0, 10) : null,
      effort_hours:
        task?.effort_hours !== undefined && task?.effort_hours !== null && task?.effort_hours !== ""
          ? Number(task.effort_hours)
          : null,
      tags: normalizeStringList(extractTagNames(task), 12, 40),
      outcome_ids: normalizeStringList(task?.outcome_ids, 8, 80),
      primary_life_domain: LIFE_DOMAIN_KEYS.includes(task?.primary_life_domain)
        ? task.primary_life_domain
        : null,
      life_domains: normalizeStringList(task?.life_domains, 6, 40).filter((key) =>
        LIFE_DOMAIN_KEYS.includes(key)
      ),
      alignment_source: cleanText(task?.alignment_source, 40) || null,
    })),
  };
}

function buildProviderNotes(provider) {
  if (provider === "claude") {
    return "Claude note: do not wrap the JSON in commentary. Return a single JSON object only.";
  }
  if (provider === "grok") {
    return "Grok note: avoid extra prose before or after the JSON. Use the exact schema and keep ids stable.";
  }
  if (provider === "chatgpt") {
    return "ChatGPT note: respond with strict JSON only, no markdown code fences unless explicitly required.";
  }
  return "Return one strict JSON object only. No markdown fences unless the user explicitly requests them.";
}

export function buildExternalPlanningPrompt({ categoryName, jsonSeed, provider = "generic" }) {
  return `You are helping extend a project inside Rise & Shine.

Your job:
1. Review the exported project snapshot.
2. Improve the project from its current state into a more actionable operating plan.
3. Return ONLY valid JSON that matches the required schema.

Constraints:
- Treat Rise & Shine as the source of truth. Propose a delta, not a full replacement database.
- Use existing task ids and desired outcome ids exactly as provided when updating existing items.
- Do not invent updates for fields you are unsure about.
- Prefer conservative, high-leverage edits over broad rewrites.
- Keep summaries concise and practical.
- Suggest project-level improvements, better subtasks, alignment fixes, and vision suggestions only when they clearly help this project.
- No destructive deletion proposals. If something should be retired, use an archive or deprioritize action.
- ${buildProviderNotes(provider)}

Required JSON schema:
{
  "meta": {
    "schema_version": "${EXTERNAL_PROJECT_IMPORT_SCHEMA_VERSION}",
    "project_category_id": "${cleanText(jsonSeed?.meta?.project_category_id, 80)}",
    "project_category_name": "${cleanText(categoryName || jsonSeed?.meta?.project_category_name, 160)}",
    "source_model": "string",
    "prompt_version": "${EXTERNAL_PROJECT_PROMPT_VERSION}"
  },
  "summary": {
    "current_state": "string",
    "strategy": "string",
    "operator_notes": "string"
  },
  "workspace_patch": {
    "mantra": "optional string",
    "narrative": "optional string",
    "efficiency_tip": "optional string",
    "suggested_moves": ["optional strings"],
    "resources": [{ "label": "string", "url": "string", "kind": "folder|doc|ai|archive|other" }],
    "health_needs": {
      "relationships": 0,
      "financial": 0,
      "wellbeing": 0,
      "growth": 0
    }
  },
  "task_actions": [
    {
      "id": "string",
      "action": "update_task|create_root_task|create_subtask|archive_task|deprioritize_task",
      "task_id": "required for update/archive/deprioritize",
      "parent_task_id": "required for create_subtask",
      "title": "short label for review UI",
      "summary": "why this helps",
      "task_patch": {
        "title": "optional string",
        "priority": "Critical|High|Medium|Low",
        "status": "todo|doing|done|archived",
        "due_date": "YYYY-MM-DD",
        "effort_hours": 1.5,
        "outcome_ids": ["existing outcome ids only"],
        "primary_life_domain": "business|finances|health|relationships|lifestyle|growth",
        "life_domains": ["optional extra domain keys"]
      },
      "create_task": {
        "title": "required for create actions",
        "priority": "Critical|High|Medium|Low",
        "status": "todo|doing|done|archived",
        "due_date": "YYYY-MM-DD",
        "effort_hours": 0.5,
        "tags": ["optional tags"],
        "outcome_ids": ["existing outcome ids only"],
        "primary_life_domain": "business|finances|health|relationships|lifestyle|growth",
        "life_domains": ["optional extra domain keys"]
      },
      "tags_add": ["optional tags"]
    }
  ],
  "alignment_actions": [
    {
      "id": "string",
      "action": "align_task",
      "task_id": "string",
      "title": "short label",
      "summary": "why this alignment matters",
      "alignment_patch": {
        "outcome_ids": ["existing outcome ids only"],
        "primary_life_domain": "business|finances|health|relationships|lifestyle|growth",
        "life_domains": ["optional extra domain keys"],
        "rationale": "optional string"
      }
    }
  ],
  "vision_suggestions": [
    {
      "id": "string",
      "action": "add_desired_outcome|update_desired_outcome|add_quarter_focus|add_strategy_note",
      "title": "short label",
      "summary": "why this matters",
      "outcome_id": "required for update_desired_outcome",
      "outcome": {
        "id": "optional string",
        "title": "string",
        "domain": "optional life domain key",
        "time_horizon": "optional string",
        "success_metric": "optional string",
        "priority_rank": 1
      },
      "focus": "required for add_quarter_focus",
      "note": "required for add_strategy_note"
    }
  ]
}

Exported project snapshot JSON:
${JSON.stringify(jsonSeed, null, 2)}
`;
}

export function normalizeExternalProjectImport(rawInput, context = {}) {
  const raw = rawInput && typeof rawInput === "object" ? rawInput : {};
  const categoryId = String(
    context.categoryId || raw?.meta?.project_category_id || raw?.meta?.category_id || ""
  );
  const allowedTaskIds = new Set(
    ensureArray(context.tasks).map((task) => String(task?.id || "")).filter(Boolean)
  );
  const allowedOutcomeIds = new Set(
    ensureArray(context.profile?.desired_outcomes)
      .map((outcome) => cleanText(outcome?.id, 80) || cleanText(outcome?.title, 160))
      .filter(Boolean)
  );

  const normalized = {
    meta: {
      schema_version:
        cleanText(raw?.meta?.schema_version, 80) || EXTERNAL_PROJECT_IMPORT_SCHEMA_VERSION,
      prompt_version: cleanText(raw?.meta?.prompt_version, 80) || EXTERNAL_PROJECT_PROMPT_VERSION,
      source_model: cleanText(raw?.meta?.source_model, 120) || "",
      project_category_id: categoryId,
      project_category_name:
        cleanText(raw?.meta?.project_category_name, 160) ||
        cleanText(context.category?.name, 160) ||
        "Project",
    },
    summary: {
      current_state: cleanText(raw?.summary?.current_state, 800),
      strategy: cleanText(raw?.summary?.strategy, 1200),
      operator_notes: cleanText(raw?.summary?.operator_notes, 1200),
    },
    workspace_patch: normalizeWorkspacePatch(raw?.workspace_patch),
    task_actions: [],
    alignment_actions: [],
    vision_suggestions: [],
  };

  ensureArray(raw?.task_actions)
    .slice(0, 60)
    .forEach((item, idx) => {
      const action = cleanText(item?.action, 40);
      if (!action) return;
      const taskId = cleanText(item?.task_id, 80);
      const parentTaskId = cleanText(item?.parent_task_id, 80);
      const title = cleanText(item?.title, 200) || `Task change ${idx + 1}`;
      const summary = cleanText(item?.summary, 600);
      const tags_add = normalizeStringList(item?.tags_add, 10, 40);

      if ((action === "update_task" || action === "archive_task" || action === "deprioritize_task") && !allowedTaskIds.has(taskId)) {
        return;
      }
      if (action === "create_subtask" && !allowedTaskIds.has(parentTaskId)) {
        return;
      }

      if (action === "update_task") {
        const task_patch = normalizeTaskPatch(item?.task_patch, allowedOutcomeIds);
        if (Object.keys(task_patch).length === 0 && tags_add.length === 0) return;
        normalized.task_actions.push({
          id: cleanText(item?.id, 80) || `task_action_${idx + 1}`,
          action,
          task_id: taskId,
          title,
          summary,
          task_patch,
          tags_add,
        });
        return;
      }

      if (action === "archive_task") {
        normalized.task_actions.push({
          id: cleanText(item?.id, 80) || `task_action_${idx + 1}`,
          action,
          task_id: taskId,
          title,
          summary,
          task_patch: { status: "archived" },
          tags_add,
        });
        return;
      }

      if (action === "deprioritize_task") {
        normalized.task_actions.push({
          id: cleanText(item?.id, 80) || `task_action_${idx + 1}`,
          action,
          task_id: taskId,
          title,
          summary,
          task_patch: { priority: "Low" },
          tags_add,
        });
        return;
      }

      if (action === "create_root_task" || action === "create_subtask") {
        const create_task = normalizeCreateTask(item?.create_task, allowedOutcomeIds);
        if (!create_task) return;
        normalized.task_actions.push({
          id: cleanText(item?.id, 80) || `task_action_${idx + 1}`,
          action,
          parent_task_id: action === "create_subtask" ? parentTaskId : null,
          title,
          summary,
          create_task,
        });
      }
    });

  ensureArray(raw?.alignment_actions)
    .slice(0, 40)
    .forEach((item, idx) => {
      const taskId = cleanText(item?.task_id, 80);
      if (!allowedTaskIds.has(taskId)) return;
      const patch = normalizeTaskPatch(item?.alignment_patch, allowedOutcomeIds);
      if (Object.keys(patch).length === 0) return;
      normalized.alignment_actions.push({
        id: cleanText(item?.id, 80) || `alignment_action_${idx + 1}`,
        action: "align_task",
        task_id: taskId,
        title: cleanText(item?.title, 200) || `Align task ${idx + 1}`,
        summary: cleanText(item?.summary, 600),
        alignment_patch: patch,
        rationale: cleanText(item?.alignment_patch?.rationale, 400),
      });
    });

  ensureArray(raw?.vision_suggestions)
    .slice(0, 30)
    .forEach((item, idx) => {
      const action = cleanText(item?.action, 40);
      if (!VISION_ACTIONS.includes(action)) return;
      const suggestion = {
        id: cleanText(item?.id, 80) || `vision_action_${idx + 1}`,
        action,
        title: cleanText(item?.title, 200) || `Vision suggestion ${idx + 1}`,
        summary: cleanText(item?.summary, 600),
      };
      if (action === "add_desired_outcome") {
        const outcome = normalizeOutcomePatch(item?.outcome);
        if (!outcome) return;
        suggestion.outcome = outcome;
      } else if (action === "update_desired_outcome") {
        const outcomeId = cleanText(item?.outcome_id, 80);
        if (!allowedOutcomeIds.has(outcomeId)) return;
        const outcome = normalizeOutcomePatch(item?.outcome);
        if (!outcome) return;
        suggestion.outcome_id = outcomeId;
        suggestion.outcome = outcome;
      } else if (action === "add_quarter_focus") {
        const focus = cleanText(item?.focus, 160);
        if (!focus) return;
        suggestion.focus = focus;
      } else if (action === "add_strategy_note") {
        const note = cleanText(item?.note, 600);
        if (!note) return;
        suggestion.note = note;
      }
      normalized.vision_suggestions.push(suggestion);
    });

  return normalized;
}

export function flattenExternalProjectImportActions(normalized, categoryId = null) {
  const actions = [];
  if (normalized?.workspace_patch && hasWorkspacePatch(normalized.workspace_patch)) {
    actions.push({
      id: "workspace_patch_main",
      bucket: "workspace_patch",
      type: "workspace_update",
      category_id: String(categoryId || normalized?.meta?.project_category_id || ""),
      title: "Update project source of truth",
      summary:
        cleanText(normalized?.summary?.strategy, 600) ||
        "Refresh the project workspace narrative, moves, and resources.",
      apply_patch: {
        workspace: normalized.workspace_patch,
      },
    });
  }

  ensureArray(normalized?.task_actions).forEach((item) => {
    const base = {
      id: cleanText(item?.id, 80),
      bucket: "task_actions",
      type: cleanText(item?.action, 40),
      title: cleanText(item?.title, 200) || "Task change",
      summary: cleanText(item?.summary, 600),
    };
    if (item.action === "update_task" || item.action === "archive_task" || item.action === "deprioritize_task") {
      actions.push({
        ...base,
        task_id: cleanText(item?.task_id, 80),
        apply_patch: {
          task: item.task_patch || {},
          tags_add: normalizeStringList(item?.tags_add, 10, 40),
        },
      });
      return;
    }
    if (item.action === "create_root_task") {
      actions.push({
        ...base,
        category_id: String(categoryId || normalized?.meta?.project_category_id || ""),
        apply_patch: {
          create_task: item.create_task,
        },
      });
      return;
    }
    if (item.action === "create_subtask") {
      actions.push({
        ...base,
        parent_task_id: cleanText(item?.parent_task_id, 80),
        apply_patch: {
          create_task: item.create_task,
        },
      });
    }
  });

  ensureArray(normalized?.alignment_actions).forEach((item) => {
    actions.push({
      id: cleanText(item?.id, 80),
      bucket: "alignment_actions",
      type: "align_task",
      task_id: cleanText(item?.task_id, 80),
      title: cleanText(item?.title, 200) || "Align task",
      summary: cleanText(item?.summary, 600) || cleanText(item?.rationale, 400),
      apply_patch: {
        task: item.alignment_patch || {},
      },
    });
  });

  ensureArray(normalized?.vision_suggestions).forEach((item) => {
    actions.push({
      id: cleanText(item?.id, 80),
      bucket: "vision_suggestions",
      type: cleanText(item?.action, 40),
      title: cleanText(item?.title, 200) || "Vision suggestion",
      summary: cleanText(item?.summary, 600),
      apply_patch: {
        vision: {
          action: item.action,
          outcome_id: item.outcome_id || null,
          outcome: item.outcome || null,
          focus: item.focus || "",
          note: item.note || "",
        },
      },
    });
  });

  return actions.filter((action) => action.id);
}

export function groupExternalProjectImportActions(normalized, categoryId = null) {
  const actions = flattenExternalProjectImportActions(normalized, categoryId);
  return [
    {
      key: "workspace_patch",
      label: "Project source of truth",
      items: actions.filter((action) => action.bucket === "workspace_patch"),
    },
    {
      key: "task_actions",
      label: "Task changes",
      items: actions.filter((action) => action.bucket === "task_actions"),
    },
    {
      key: "alignment_actions",
      label: "Alignment fixes",
      items: actions.filter((action) => action.bucket === "alignment_actions"),
    },
    {
      key: "vision_suggestions",
      label: "Vision suggestions",
      items: actions.filter((action) => action.bucket === "vision_suggestions"),
    },
  ].filter((group) => group.items.length > 0);
}

export function summarizeExternalProjectImport(normalized, categoryId = null) {
  const actions = flattenExternalProjectImportActions(normalized, categoryId);
  const grouped = groupExternalProjectImportActions(normalized, categoryId);
  return {
    total_actions: actions.length,
    workspace_actions: actions.filter((action) => action.bucket === "workspace_patch").length,
    task_actions: actions.filter((action) => action.bucket === "task_actions").length,
    alignment_actions: actions.filter((action) => action.bucket === "alignment_actions").length,
    vision_actions: actions.filter((action) => action.bucket === "vision_suggestions").length,
    group_count: grouped.length,
  };
}
