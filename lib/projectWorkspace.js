import {
  buildExternalPlanningPrompt,
  buildProjectJsonSeed,
} from "./externalProjectImport";

/**
 * Per-category "Strategic Project Workspace" stored in user_profile.preferences.project_workspaces[categoryId]
 */

export const RESOURCE_KINDS = [
  { value: "folder", label: "Folder / drive" },
  { value: "doc", label: "Document" },
  { value: "ai", label: "AI project / chat" },
  { value: "archive", label: "Archive / media" },
  { value: "other", label: "Other" },
];

export function defaultProjectWorkspace() {
  return {
    mantra: "",
    narrative: "",
    efficiency_tip: "",
    suggested_moves: [],
    resources: [],
    health_needs: {
      relationships: 70,
      financial: 60,
      wellbeing: 75,
      growth: 55,
    },
  };
}

export function mergeProjectWorkspace(prefs, categoryId, legacyLinksText = "") {
  const id = String(categoryId);
  const raw = prefs?.project_workspaces?.[id] || {};
  const base = defaultProjectWorkspace();
  const merged = {
    ...base,
    ...raw,
    health_needs: { ...base.health_needs, ...(raw.health_needs || {}) },
    resources: Array.isArray(raw.resources) ? raw.resources : [],
    suggested_moves: Array.isArray(raw.suggested_moves) ? raw.suggested_moves : [],
  };
  if (!merged.narrative?.trim() && legacyLinksText?.trim()) {
    merged._legacyLinksHint = true;
  }
  return merged;
}

/**
 * Heuristic alignment % for hero card: narrative completeness + task progress + outcome linkage.
 */
export function computeProjectAlignment(rootTasks, mantra, narrative) {
  let score = 42;
  if (mantra && mantra.trim().length > 3) score += 12;
  if (narrative && narrative.trim().length > 40) score += 12;
  if (narrative && narrative.trim().length > 200) score += 6;

  const active = (rootTasks || []).filter((t) => t && t.status !== "archived");
  if (active.length === 0) return Math.min(100, Math.max(0, Math.round(score)));

  const done = active.filter((t) => t.status === "done").length;
  const withOutcome = active.filter(
    (t) => Array.isArray(t.outcome_ids) && t.outcome_ids.length > 0
  ).length;

  score += Math.round((done / active.length) * 22);
  score += Math.round((withOutcome / active.length) * 6);
  return Math.min(100, Math.max(0, Math.round(score)));
}

function taskLinesForPack(tasks, limit = 18, childLimit = 4) {
  const all = Array.isArray(tasks) ? tasks : [];
  const roots = all.filter((t) => !t.parent_task_id).slice(0, limit);
  const byParent = new Map();
  all.forEach((task) => {
    if (!task?.parent_task_id) return;
    if (!byParent.has(task.parent_task_id)) byParent.set(task.parent_task_id, []);
    byParent.get(task.parent_task_id).push(task);
  });
  return roots
    .map((t) => {
      const st = t.status || "todo";
      const pr = t.priority || "—";
      const due = t.due_date ? String(t.due_date).slice(0, 10) : "no due";
      const children = (byParent.get(t.id) || [])
        .slice(0, childLimit)
        .map((child) => {
          const childStatus = child.status || "todo";
          const childPriority = child.priority || "—";
          return `  - [${childStatus}] (${childPriority}) ${child.title || "Untitled subtask"}`;
        })
        .join("\n");
      return `- [${st}] (${pr}) ${t.title || "Untitled"} · due ${due}${children ? `\n${children}` : ""}`;
    })
    .join("\n");
}

/**
 * Plain-text bundle for ChatGPT / Claude / project-scoped AI threads.
 */
export function buildProjectContextPack(
  {
    categoryId,
    categoryName,
    mantra,
    narrative,
    profile,
    rootTasks,
    healthNeeds,
    resources,
    efficiencyTip,
    suggestedMoves,
    legacyLinksText = "",
    knowledgeBase = "",
  },
  options = {}
) {
  const format = options.format || "conversation_pack";
  const seed = buildProjectJsonSeed({
    category: { id: categoryId, name: categoryName },
    profile,
    workspace: {
      mantra,
      narrative,
      efficiency_tip: efficiencyTip,
      suggested_moves: suggestedMoves,
      resources,
      health_needs: healthNeeds,
    },
    tasks: rootTasks,
    legacyLinksText,
  });
  if (format === "json_seed") {
    return JSON.stringify(seed, null, 2);
  }

  const outcomes = profile?.desired_outcomes || [];
  const outcomeLines = outcomes
    .slice(0, 12)
    .map((o) => `- ${o.title || o.id || "Outcome"}`)
    .join("\n");

  const resourceLines = (resources || [])
    .filter((r) => r.url || r.label)
    .map((r) => {
      let line = `- [${r.kind || "link"}] ${r.label || "Resource"}`;
      if (r.status && r.status !== "reference") line += ` (${r.status})`;
      if (r.url) line += `: ${r.url}`;
      if (r.notes) line += ` — ${r.notes}`;
      return line;
    })
    .join("\n");

  const moves = (suggestedMoves || []).map((m) => `- ${m}`).join("\n");

  return `## Rise & Shine — Project context pack
**Project (category):** ${categoryName || "Unknown"}

### Active mantra
${mantra?.trim() || "(not set)"}

### Source of truth / strategic narrative
${narrative?.trim() || "(not set)"}

### User outcomes (vision layer)
${outcomeLines || "(none listed)"}

### Efficiency hypothesis (user-maintained)
${efficiencyTip?.trim() || "(none)"}

### Suggested next moves (from AI or user)
${moves || "(none)"}

### Key resources
${resourceLines || "(none structured — check app Resource vault)"}

### Project health sliders (self-reported 0–100)
- Loving relationships / care: ${healthNeeds?.relationships ?? "—"}
- Financial stability: ${healthNeeds?.financial ?? "—"}
- Security & wellbeing: ${healthNeeds?.wellbeing ?? "—"}
- Growth & meaning: ${healthNeeds?.growth ?? "—"}

### Knowledge base (extracted facts, contacts, reference numbers)
${knowledgeBase?.trim() || "(no knowledge base yet)"}

### Open initiatives in this project (roots + next subtasks)
${taskLinesForPack(rootTasks)}
${legacyLinksText?.trim() ? `\n### Additional links / notes (legacy block)\n${legacyLinksText.trim()}\n` : ""}`;
}

export function buildProjectExportBundle(args, options = {}) {
  const provider = options.provider || "generic";
  const jsonSeedObject = buildProjectJsonSeed({
    category: { id: args.categoryId, name: args.categoryName },
    profile: args.profile,
    workspace: {
      mantra: args.mantra,
      narrative: args.narrative,
      efficiency_tip: args.efficiencyTip,
      suggested_moves: args.suggestedMoves,
      resources: args.resources,
      health_needs: args.healthNeeds,
      knowledge_base: args.knowledgeBase || "",
    },
    tasks: args.rootTasks,
    legacyLinksText: args.legacyLinksText || "",
  });
  const conversation_pack = buildProjectContextPack(args, { format: "conversation_pack" });
  const json_seed = JSON.stringify(jsonSeedObject, null, 2);
  const planning_prompt = buildExternalPlanningPrompt({
    categoryName: args.categoryName,
    jsonSeed: jsonSeedObject,
    provider,
  });
  return {
    conversation_pack,
    json_seed,
    planning_prompt,
    prompt_bundle: `${planning_prompt}\n\nProject snapshot:\n${json_seed}`,
  };
}

export function newResourceRow() {
  return {
    id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    label: "",
    url: "",
    kind: "folder",
  };
}
