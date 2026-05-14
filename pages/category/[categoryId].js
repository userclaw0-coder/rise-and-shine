import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import PSShell from "../../components/PSShell";
import ProjectKnowledgeBase from "../../components/ProjectKnowledgeBase";
import ProjectDnaEditor from "../../components/ProjectDnaEditor";
import { useAuth } from "../../hooks/useAuth";
import { HUMAN_NEED_STRATEGY_LABELS } from "../../lib/humanNeedStrategies";

const TYPE_TAG_LABELS = {
  "quick-win": "Quick Win",
  "high-leverage": "High Leverage",
  progress: "Progress",
  maintenance: "Maintenance",
};

function extractTagNames(row) {
  return (row?.tags || [])
    .map((t) => (typeof t === "string" ? t : t?.tag?.name || t?.name || ""))
    .filter(Boolean);
}

function typeTagOf(row) {
  const names = extractTagNames(row);
  for (const t of ["quick-win", "high-leverage", "progress", "maintenance"]) {
    if (names.includes(t)) return t;
  }
  return null;
}

// Workstream code from "ws:XX" tags (added by the Reorient triage flow).
function workstreamOf(row) {
  const names = extractTagNames(row);
  const ws = names.find((n) => n.startsWith("ws:"));
  return ws ? ws.slice(3) : null;
}

// Location label from "@home" / "@longterm" / "@workyard" / "@onthewater".
function locationOf(row) {
  const names = extractTagNames(row);
  const loc = names.find((n) => n.startsWith("@"));
  return loc || null;
}

// All "gate:*" tags on the task (gate:launch / gate:workyard / etc.).
function gatesOf(row) {
  return extractTagNames(row).filter((n) => n.startsWith("gate:"));
}

function hasGate(row, gate) {
  return gatesOf(row).includes(gate);
}
import {
  loadCollaborativeProject,
  saveCollaborativeProjectWorkspace,
} from "../../lib/collaborationClient";
import { supabase } from "../../lib/supabaseClient";
import {
  getUserProfile,
  updateTaskStatusWithEvent,
  createTask,
} from "../../lib/db";
import { computeProjectAlignment } from "../../lib/projectWorkspace";
import OutcomeISCEditor from "../../components/OutcomeISCEditor";
import ProjectPartsPanel from "../../components/ProjectPartsPanel";
import { outcomesProgress } from "../../lib/iscProgress";

const PROJECT_COLORS = [
  "var(--ps-clay)",
  "var(--ps-indigo)",
  "var(--ps-plum)",
  "var(--ps-accent)",
  "var(--ps-gold)",
  "var(--ps-sage)",
  "var(--ps-ink)",
];

// Phase-based grouping. Drives the task ladder once `tasks.phase` is populated
// by the Reorient triage flow. Tasks without a phase fall into "Unphased" so
// they're visible until they get triaged.
const PHASE_ORDER = [
  "immediate",
  "this_week",
  "next_2w",
  "next_30d",
  "ongoing",
  "blocked",
  "someday",
];
const PHASE_LABELS = {
  immediate: "Immediate — today",
  this_week: "This week",
  next_2w: "Next 2 weeks",
  next_30d: "Next 30 days",
  ongoing: "Ongoing / recurring",
  blocked: "Blocked",
  someday: "Someday",
  _unphased: "Unphased",
};
const PHASE_COLLAPSED_BY_DEFAULT = new Set(["blocked", "someday", "_unphased"]);
const PRIORITY_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };

function groupTasks(tasks) {
  // Anchor: if any open task has a phase, we're in phase-mode. Otherwise
  // fall back to the legacy priority/effort split so projects that haven't
  // been Reoriented yet still render reasonably.
  const open = tasks.filter((t) => t.status !== "done");
  const anyPhase = open.some((t) => t.phase);

  if (!anyPhase) {
    const active = [];
    const backlog = [];
    const needsBreak = [];
    for (const t of open) {
      const tooBig = (t.effort_hours || 0) > 0.5;
      const priority = t.priority;
      if (priority === "Critical" || priority === "High") {
        if (tooBig) needsBreak.push(t);
        else active.push(t);
      } else if (tooBig) {
        needsBreak.push(t);
      } else {
        backlog.push(t);
      }
    }
    return [
      { label: "This week — active", items: active },
      { label: "Ordered backlog", items: backlog },
      { label: "Needs breakdown — too big", items: needsBreak, flag: true },
    ].filter((g) => g.items.length > 0);
  }

  // Phase-mode: bucket by phase, then sort within each bucket.
  const buckets = {};
  for (const t of open) {
    const key = t.phase || "_unphased";
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(t);
  }
  for (const key of Object.keys(buckets)) {
    buckets[key].sort((a, b) => {
      // gate:launch first within phase (high stakes)
      const ag = hasGate(a, "gate:launch") ? 0 : 1;
      const bg = hasGate(b, "gate:launch") ? 0 : 1;
      if (ag !== bg) return ag - bg;
      // then by priority (Critical → Low) — highest priority on top
      const ap = PRIORITY_RANK[a.priority] ?? 2;
      const bp = PRIORITY_RANK[b.priority] ?? 2;
      if (ap !== bp) return ap - bp;
      // then by effort ascending (small wins surface first within a priority tier)
      const ae = a.effort_hours || 0;
      const be = b.effort_hours || 0;
      return ae - be;
    });
  }

  const result = [];
  for (const phase of PHASE_ORDER) {
    if (buckets[phase]?.length) {
      result.push({
        phase,
        label: PHASE_LABELS[phase],
        items: buckets[phase],
        collapsedByDefault: PHASE_COLLAPSED_BY_DEFAULT.has(phase),
      });
    }
  }
  if (buckets._unphased?.length) {
    result.push({
      phase: "_unphased",
      label: PHASE_LABELS._unphased,
      items: buckets._unphased,
      collapsedByDefault: PHASE_COLLAPSED_BY_DEFAULT.has("_unphased"),
    });
  }
  return result;
}

export default function ProjectPage() {
  const router = useRouter();
  const { categoryId } = router.query;
  const { user } = useAuth();
  const [category, setCategory] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [filterLocations, setFilterLocations] = useState([]);
  const [filterWorkstreams, setFilterWorkstreams] = useState([]);
  const [filterGates, setFilterGates] = useState([]);
  const [subtasks, setSubtasks] = useState({});
  const [breakdowns, setBreakdowns] = useState({});
  const [breakingDown, setBreakingDown] = useState(null);
  const [insertingTask, setInsertingTask] = useState(null);
  const [knowledgeBase, setKnowledgeBase] = useState("");
  const [resources, setResources] = useState([]);
  const [driveFolderUrl, setDriveFolderUrl] = useState("");
  const [mantra, setMantra] = useState("");
  const [narrative, setNarrative] = useState("");
  const [lastAlignedAt, setLastAlignedAt] = useState(null);
  const [nextAction, setNextAction] = useState(null);
  const [projectOutcomeIds, setProjectOutcomeIds] = useState([]);
  const [projectPrimaryDomain, setProjectPrimaryDomain] = useState(null);
  const [projectLifeDomains, setProjectLifeDomains] = useState([]);
  const [kbSaving, setKbSaving] = useState(false);
  const [kbError, setKbError] = useState("");
  const [editingMantra, setEditingMantra] = useState(false);
  const [mantraDraft, setMantraDraft] = useState("");
  const [mantraSaving, setMantraSaving] = useState(false);
  const [mantraSuggestLoading, setMantraSuggestLoading] = useState(false);
  const [mantraSuggestion, setMantraSuggestion] = useState(null);
  const [mantraError, setMantraError] = useState("");

  const color = PROJECT_COLORS[categoryIndex % PROJECT_COLORS.length];

  const load = useCallback(async () => {
    if (!user || !categoryId) return;
    setLoading(true);
    setError("");
    try {
      const [catRes, listRes, profileRes, allCatsRes] = await Promise.all([
        supabase
          .from("categories")
          .select("id, name")
          .eq("id", categoryId)
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("tasks")
          .select(
            "id, title, status, priority, effort_hours, due_date, parent_task_id, outcome_ids, primary_life_domain, phase, created_at, updated_at, tags:task_tags(tag:tags(id, name))"
          )
          .eq("user_id", user.id)
          .eq("category_id", categoryId)
          .is("archived_at", null)
          .order("updated_at", { ascending: false }),
        getUserProfile(user.id),
        supabase
          .from("categories")
          .select("id")
          .eq("user_id", user.id)
          .order("name", { ascending: true }),
      ]);
      if (catRes.error) throw new Error(catRes.error.message);
      if (!catRes.data) throw new Error("Project not found.");
      if (listRes.error) throw new Error(listRes.error.message);
      setCategory(catRes.data);
      setTasks(listRes.data || []);
      const cats = allCatsRes.data || [];
      const idx = cats.findIndex((c) => c.id === categoryId);
      setCategoryIndex(idx === -1 ? 0 : idx);

      const profile = profileRes?.data?.profile || {};
      const visionOutcomes = profile.desired_outcomes || [];
      const linked = new Set();
      for (const t of listRes.data || []) {
        for (const id of t.outcome_ids || []) linked.add(id);
      }
      const relevant = visionOutcomes.filter((o) => linked.has(o.id));
      const withProgress = relevant.map((o) => {
        const subset = (listRes.data || []).filter((t) =>
          (t.outcome_ids || []).includes(o.id)
        );
        const done = subset.filter((t) => t.status === "done").length;
        const progress = subset.length > 0 ? done / subset.length : 0;
        return {
          ...o,
          progress,
          taskCount: subset.length,
          criteria: Array.isArray(o.criteria) ? o.criteria : [],
        };
      });
      setOutcomes(withProgress);

      // Load workspace (knowledge base + resources + mantra + DNA)
      try {
        const ws = await loadCollaborativeProject(categoryId);
        setKnowledgeBase(ws?.knowledge_base || "");
        const wsObj = ws?.workspace || {};
        setResources(wsObj.resources || []);
        setDriveFolderUrl(wsObj.drive_folder_url || "");
        setMantra(wsObj.mantra || "");
        setNarrative(wsObj.narrative || "");
        setLastAlignedAt(wsObj.last_aligned_at || null);
        setNextAction(wsObj.next_action || null);
        setProjectOutcomeIds(wsObj.outcome_ids || []);
        setProjectPrimaryDomain(wsObj.primary_life_domain || null);
        setProjectLifeDomains(
          Array.isArray(wsObj.life_domains) ? wsObj.life_domains : []
        );
      } catch {
        // silent — shared_project_workspaces row may not exist yet
      }
    } catch (err) {
      setError(err.message || "Failed to load project.");
    } finally {
      setLoading(false);
    }
  }, [user, categoryId]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveMantra(nextMantra) {
    if (!user || mantraSaving) return;
    setMantraSaving(true);
    setMantraError("");
    try {
      await saveCollaborativeProjectWorkspace(categoryId, {
        mantra: nextMantra,
      });
      setMantra(nextMantra);
      setEditingMantra(false);
      setMantraSuggestion(null);
    } catch (err) {
      setMantraError(err.message || "Save failed.");
    } finally {
      setMantraSaving(false);
    }
  }

  async function suggestMantra() {
    if (!user || mantraSuggestLoading) return;
    setMantraSuggestLoading(true);
    setMantraError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch("/api/coach/project-mantra", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          category_id: categoryId,
          current_mantra: mantra || "",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed");
      }
      const data = await res.json();
      setMantraSuggestion({
        text: data.suggestion || "",
        reason: data.reason || "",
      });
    } catch (err) {
      setMantraError(err.message || "Suggest failed.");
    } finally {
      setMantraSuggestLoading(false);
    }
  }

  async function saveKb() {
    if (!user || kbSaving) return;
    setKbSaving(true);
    setKbError("");
    try {
      await saveCollaborativeProjectWorkspace(categoryId, {
        knowledge_base: knowledgeBase,
        resources,
        drive_folder_url: driveFolderUrl || null,
      });
    } catch (err) {
      setKbError(err.message || "Save failed.");
    } finally {
      setKbSaving(false);
    }
  }

  async function fetchBreakdown(task) {
    if (!user || breakingDown) return;
    setBreakingDown(task.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch("/api/coach/task-breakdown", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ task_id: task.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed");
      }
      const data = await res.json();
      setBreakdowns((b) => ({ ...b, [task.id]: data.subtasks || [] }));
    } catch (err) {
      setBreakdowns((b) => ({ ...b, [task.id]: { error: err.message || "Failed" } }));
    } finally {
      setBreakingDown(null);
    }
  }

  async function acceptBreakdownStep(parentTask, step) {
    if (!user || insertingTask) return;
    setInsertingTask(`${parentTask.id}:${step.title}`);
    try {
      await createTask(user.id, {
        title: step.title,
        priority: parentTask.priority || "Medium",
        effort_hours: (step.minutes || 20) / 60,
        category_id: parentTask.category_id || categoryId,
        parent_task_id: parentTask.id,
      });
      load();
      // Remove the inserted step from the breakdown panel
      setBreakdowns((b) => {
        const list = (b[parentTask.id] || []).filter((s) => s.title !== step.title);
        return { ...b, [parentTask.id]: list };
      });
    } finally {
      setInsertingTask(null);
    }
  }

  async function loadSubtasks(taskId) {
    if (subtasks[taskId]) return;
    const { data } = await supabase
      .from("tasks")
      .select("id, title, status, effort_hours")
      .eq("user_id", user.id)
      .eq("parent_task_id", taskId)
      .is("archived_at", null)
      .order("created_at", { ascending: true });
    setSubtasks((s) => ({ ...s, [taskId]: data || [] }));
  }

  async function toggleTask(t) {
    const prevStatus = t.status;
    const nextStatus = prevStatus === "done" ? "todo" : "done";
    setTasks((ts) =>
      ts.map((x) => (x.id === t.id ? { ...x, status: nextStatus } : x))
    );
    const res = await updateTaskStatusWithEvent(user.id, t.id, nextStatus);
    if (res?.error) {
      console.error("[category] toggleTask failed:", res.error);
      setTasks((ts) =>
        ts.map((x) => (x.id === t.id ? { ...x, status: prevStatus } : x))
      );
    }
  }

  const hasAnyFilter =
    filterLocations.length > 0 ||
    filterWorkstreams.length > 0 ||
    filterGates.length > 0;

  const filteredTasks = useMemo(() => {
    if (!hasAnyFilter) return tasks;
    return tasks.filter((t) => {
      if (filterLocations.length) {
        const loc = locationOf(t); // e.g. "@home"
        if (!loc || !filterLocations.includes(loc)) return false;
      }
      if (filterWorkstreams.length) {
        const ws = workstreamOf(t);
        if (!ws || !filterWorkstreams.includes(ws)) return false;
      }
      if (filterGates.length) {
        const gates = gatesOf(t);
        if (!filterGates.every((g) => gates.includes(g))) return false;
      }
      return true;
    });
  }, [tasks, filterLocations, filterWorkstreams, filterGates, hasAnyFilter]);

  const groups = useMemo(() => {
    const base = groupTasks(filteredTasks);
    if (!nextAction?.task_id) return base;
    // Find the group containing the next-action task and move it to the top
    for (const g of base) {
      const idx = g.items.findIndex((t) => t.id === nextAction.task_id);
      if (idx !== -1) {
        const [item] = g.items.splice(idx, 1);
        g.items.unshift({ ...item, _isNextAction: true });
        break;
      }
    }
    return base;
  }, [filteredTasks, nextAction]);

  // Pre-compute which workstreams / locations / gates actually exist in this
  // project's open tasks — only render chips that match real data.
  const availableFilters = useMemo(() => {
    const ws = new Set();
    const loc = new Set();
    const gates = new Set();
    for (const t of tasks) {
      if (t.status === "done") continue;
      const w = workstreamOf(t);
      if (w) ws.add(w);
      const l = locationOf(t);
      if (l) loc.add(l);
      for (const g of gatesOf(t)) gates.add(g);
    }
    return {
      workstreams: Array.from(ws).sort(),
      locations: Array.from(loc).sort(),
      gates: Array.from(gates).sort(),
    };
  }, [tasks]);

  function toggleInList(setter, value) {
    setter((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  function clearAllFilters() {
    setFilterLocations([]);
    setFilterWorkstreams([]);
    setFilterGates([]);
  }
  const overall = useMemo(() => {
    const active = tasks.filter((t) => t.status !== "done");
    if (active.length === 0 && tasks.length === 0) return 0;
    return Math.round(
      (tasks.filter((t) => t.status === "done").length / Math.max(1, tasks.length)) *
        100
    );
  }, [tasks]);

  const doneThisWeek = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    return tasks.filter(
      (t) =>
        t.status === "done" &&
        t.updated_at &&
        new Date(t.updated_at) > cutoff
    ).length;
  }, [tasks]);

  const lastTouched = useMemo(() => {
    if (tasks.length === 0) return null;
    const max = tasks.reduce((a, t) => {
      const ts = t.updated_at ? new Date(t.updated_at).getTime() : 0;
      return ts > a ? ts : a;
    }, 0);
    if (!max) return null;
    const days = Math.round((Date.now() - max) / 86400000);
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    return `${days}d ago`;
  }, [tasks]);

  const alignmentScore = useMemo(() => {
    const roots = tasks.filter((t) => !t.parent_task_id);
    return computeProjectAlignment(roots, mantra, narrative);
  }, [tasks, mantra, narrative]);

  const daysSinceAligned = useMemo(() => {
    if (!lastAlignedAt) return null;
    const ts = new Date(lastAlignedAt).getTime();
    if (!ts) return null;
    return Math.max(0, Math.round((Date.now() - ts) / 86400000));
  }, [lastAlignedAt]);

  if (!user) return null;

  const stalenessTone =
    daysSinceAligned == null
      ? "clay"
      : daysSinceAligned <= 14
      ? "sage"
      : daysSinceAligned <= 30
      ? "gold"
      : "clay";

  // Phase-aware task summaries — the page-note coach should base its
  // "next action" suggestions on these, not on the open_task_titles list
  // alone (which is updated_at-sorted and doesn't reflect phase).
  const openTasks = tasks.filter((t) => t.status !== "done");
  const phaseBucket = (phase) =>
    openTasks
      .filter((t) => t.phase === phase)
      .map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        minutes: Math.round((t.effort_hours || 0) * 60),
        ws: workstreamOf(t),
        loc: locationOf(t),
        gates: gatesOf(t),
      }));
  const phaseCounts = {
    immediate: phaseBucket("immediate").length,
    this_week: phaseBucket("this_week").length,
    next_2w: phaseBucket("next_2w").length,
    next_30d: phaseBucket("next_30d").length,
    ongoing: phaseBucket("ongoing").length,
    blocked: phaseBucket("blocked").length,
    someday: phaseBucket("someday").length,
    unphased: openTasks.filter((t) => !t.phase).length,
  };
  const gateLaunchOpen = openTasks.filter((t) => hasGate(t, "gate:launch")).length;
  const gateWorkyardOpen = openTasks.filter((t) => hasGate(t, "gate:workyard")).length;

  const coachPayload = {
    project: category?.name || null,
    category_id: categoryId,
    mantra: mantra || null,
    narrative_excerpt: (narrative || "").slice(0, 800),
    kb_excerpt: (knowledgeBase || "").slice(0, 2000),
    linked_outcomes: outcomes.map((o) => ({
      id: o.id,
      title: o.title,
      progress: o.progress,
      isc_total: Array.isArray(o.criteria) ? o.criteria.length : 0,
      isc_met: Array.isArray(o.criteria)
        ? o.criteria.filter((c) => c.met).length
        : 0,
    })),
    immediate_tasks: phaseBucket("immediate").slice(0, 8),
    this_week_tasks: phaseBucket("this_week").slice(0, 8),
    blocked_tasks: phaseBucket("blocked").slice(0, 5),
    phase_counts: phaseCounts,
    gate_launch_open: gateLaunchOpen,
    gate_workyard_open: gateWorkyardOpen,
    open_task_titles: openTasks.slice(0, 12).map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      minutes: Math.round((t.effort_hours || 0) * 60),
      phase: t.phase || null,
    })),
    done_this_week: doneThisWeek,
    last_aligned_at: lastAlignedAt,
    days_since_aligned: daysSinceAligned,
    alignment_score: alignmentScore,
    current_next_action: nextAction,
    drive_folder_url: driveFolderUrl || null,
    mode: null,
    refresh_mode: null,
  };

  const coachScope = categoryId ? `project:${categoryId}` : "project";

  return (
    <PSShell
      scope={coachScope}
      title={category?.name || "Project"}
      scopeHint={category?.name || "Project view"}
      coachPayload={coachPayload}
      coachPayloadReady={!loading && !!category}
    >
      <div className="ps-view">
          <div className="ps-eyebrow pj-breadcrumb">
            <Link href="/projects">Projects</Link>
            <span className="pj-sep">/</span>
            <span className="pj-current">{category?.name || "…"}</span>
          </div>

          {error && <div className="today-error">{error}</div>}

          <div className="pj-hero">
            <div className="pj-hero-body">
              <div className="pj-hero-eyebrow">
                <span className="pj-dot" style={{ background: color }} />
                <span>Active project</span>
              </div>
              <h1 className="ps-title">{category?.name || "Project"}</h1>

              <div className="pj-mantra">
                {editingMantra ? (
                  <>
                    <div className="pj-mantra-cap">
                      Source of truth — what this project is for
                    </div>
                    <textarea
                      className="pj-mantra-input"
                      value={mantraDraft}
                      onChange={(e) => setMantraDraft(e.target.value)}
                      placeholder="One sentence. Concrete and specific. Read this at the top of the page to remember why this project exists."
                      rows={2}
                      autoFocus
                    />
                    <div className="pj-mantra-actions">
                      <button
                        type="button"
                        className="ps-btn ps-btn--primary"
                        onClick={() => saveMantra(mantraDraft.trim())}
                        disabled={mantraSaving}
                      >
                        {mantraSaving ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        className="ps-btn"
                        onClick={() => {
                          setEditingMantra(false);
                          setMantraDraft(mantra);
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="ps-btn"
                        onClick={suggestMantra}
                        disabled={mantraSuggestLoading}
                      >
                        {mantraSuggestLoading
                          ? "Coach thinking…"
                          : mantra
                          ? "Coach: refine"
                          : "Coach: draft one"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="pj-mantra-cap">Source of truth</div>
                    <div className="pj-mantra-text">
                      {mantra ? (
                        <em>{mantra}</em>
                      ) : (
                        <span className="pj-mantra-empty">
                          No source of truth yet. Write one sentence that
                          captures what this project is FOR.
                        </span>
                      )}
                    </div>
                    <div className="pj-mantra-actions">
                      <button
                        type="button"
                        className="ps-btn"
                        onClick={() => {
                          setMantraDraft(mantra);
                          setEditingMantra(true);
                        }}
                      >
                        {mantra ? "Edit" : "Write one"}
                      </button>
                      <button
                        type="button"
                        className="ps-btn"
                        onClick={suggestMantra}
                        disabled={mantraSuggestLoading}
                      >
                        {mantraSuggestLoading
                          ? "Coach thinking…"
                          : mantra
                          ? "Coach: suggest an edit"
                          : "Coach: draft one"}
                      </button>
                    </div>
                  </>
                )}

                {mantraError && (
                  <div className="today-error" style={{ marginTop: 8 }}>
                    {mantraError}
                  </div>
                )}

                {mantraSuggestion && (
                  <div className="pj-mantra-suggestion">
                    <div className="pj-mantra-suggestion-cap">
                      Coach proposes
                    </div>
                    <div className="pj-mantra-suggestion-text">
                      {mantraSuggestion.text}
                    </div>
                    {mantraSuggestion.reason && (
                      <div className="pj-mantra-suggestion-reason">
                        {mantraSuggestion.reason}
                      </div>
                    )}
                    <div className="pj-mantra-actions">
                      <button
                        type="button"
                        className="ps-btn ps-btn--primary"
                        onClick={() => {
                          setMantraDraft(mantraSuggestion.text);
                          setEditingMantra(true);
                          setMantraSuggestion(null);
                        }}
                      >
                        Use this
                      </button>
                      <button
                        type="button"
                        className="ps-btn"
                        onClick={() => setMantraSuggestion(null)}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className={"pj-align pj-align--" + stalenessTone}>
                <div className="pj-align-main">
                  <span className="pj-align-cap">Alignment</span>
                  <span className="pj-align-val">{alignmentScore}<span>/100</span></span>
                  <span className="pj-align-sep">·</span>
                  <span className="pj-align-last">
                    Last aligned{" "}
                    <strong>
                      {daysSinceAligned == null
                        ? "never"
                        : daysSinceAligned === 0
                        ? "today"
                        : daysSinceAligned === 1
                        ? "1 day ago"
                        : `${daysSinceAligned} days ago`}
                    </strong>
                  </span>
                </div>
                <div className="pj-align-actions">
                  <Link
                    href={`/reorient/${categoryId}`}
                    className="ps-btn ps-btn--primary"
                  >
                    Reorient this project
                  </Link>
                </div>
              </div>

              <div className="pj-meta">
                <div>
                  <strong>{outcomes.length}</strong> linked outcome
                  {outcomes.length === 1 ? "" : "s"}
                </div>
                <div>
                  <strong>{tasks.filter((t) => t.status !== "done").length}</strong>{" "}
                  open tasks
                </div>
                <div>
                  <strong>{doneThisWeek}</strong> done this week
                </div>
                {lastTouched && (
                  <div>
                    Last touched <strong>{lastTouched}</strong>
                  </div>
                )}
                {(() => {
                  const isc = outcomesProgress(outcomes);
                  return isc.total > 0 ? (
                    <div>
                      <strong>{isc.met}</strong>/{isc.total} ISCs ({isc.percent}%)
                    </div>
                  ) : null;
                })()}
              </div>

              {outcomes.length > 0 && outcomes.some((o) => (o.criteria || []).length > 0) && (
                <div className="pj-outcomes-isc">
                  <div className="pj-outcomes-isc-cap">Outcome progress</div>
                  {outcomes
                    .filter((o) => (o.criteria || []).length > 0)
                    .map((o) => (
                      <div key={o.id} className="pj-outcomes-isc-row">
                        <div className="pj-outcomes-isc-title">{o.title}</div>
                        <OutcomeISCEditor outcome={o} readOnly defaultCollapsed />
                      </div>
                    ))}
                </div>
              )}
            </div>
            <div className="pj-progress">
              <div className="pj-progress-num">
                {overall}
                <span>%</span>
              </div>
              <div className="pj-progress-cap">All tasks complete</div>
              <div className="pj-progress-bar">
                <div
                  className="pj-progress-fill"
                  style={{ width: overall + "%", background: color }}
                />
              </div>
            </div>
          </div>

          <ProjectDnaEditor
            categoryId={categoryId}
            initialOutcomeIds={projectOutcomeIds}
            initialLifeDomains={projectLifeDomains}
            initialPrimaryLifeDomain={projectPrimaryDomain}
            onSaved={() => load()}
          />

          <div className="pj-ladder">
            <div className="pj-ladder-head">
              <div>
                <div className="pj-ladder-title">Task ladder</div>
                <div className="pj-ladder-sub">
                  Grouped by phase. Within each phase: gate:launch tasks first,
                  then smallest effort, then priority.
                </div>
              </div>
              <Link href="/backlog" className="ps-btn ps-btn--primary">
                + Add in backlog
              </Link>
            </div>

            {(availableFilters.locations.length > 0 ||
              availableFilters.workstreams.length > 0 ||
              availableFilters.gates.length > 0) && (
              <div className="pj-filters">
                {availableFilters.locations.length > 0 && (
                  <div className="pj-filter-row">
                    <span className="pj-filter-cap">Location</span>
                    {availableFilters.locations.map((loc) => (
                      <button
                        key={loc}
                        type="button"
                        className={
                          "pj-filter-chip pj-filter-chip--loc" +
                          (filterLocations.includes(loc) ? " active" : "")
                        }
                        onClick={() => toggleInList(setFilterLocations, loc)}
                      >
                        {loc}
                      </button>
                    ))}
                  </div>
                )}
                {availableFilters.workstreams.length > 0 && (
                  <div className="pj-filter-row">
                    <span className="pj-filter-cap">Workstream</span>
                    {availableFilters.workstreams.map((ws) => (
                      <button
                        key={ws}
                        type="button"
                        className={
                          "pj-filter-chip pj-filter-chip--ws" +
                          (filterWorkstreams.includes(ws) ? " active" : "")
                        }
                        onClick={() => toggleInList(setFilterWorkstreams, ws)}
                      >
                        {ws}
                      </button>
                    ))}
                  </div>
                )}
                {availableFilters.gates.length > 0 && (
                  <div className="pj-filter-row">
                    <span className="pj-filter-cap">Gate</span>
                    {availableFilters.gates.map((g) => (
                      <button
                        key={g}
                        type="button"
                        className={
                          "pj-filter-chip pj-filter-chip--gate" +
                          (filterGates.includes(g) ? " active" : "")
                        }
                        onClick={() => toggleInList(setFilterGates, g)}
                      >
                        ⚑ {g}
                      </button>
                    ))}
                  </div>
                )}
                {hasAnyFilter && (
                  <div className="pj-filter-row pj-filter-row--meta">
                    <span className="pj-filter-summary">
                      Showing{" "}
                      <strong>{filteredTasks.filter((t) => t.status !== "done").length}</strong>{" "}
                      of {tasks.filter((t) => t.status !== "done").length} open tasks
                    </span>
                    <button
                      type="button"
                      className="pj-filter-clear"
                      onClick={clearAllFilters}
                    >
                      ✕ Clear all
                    </button>
                  </div>
                )}
              </div>
            )}

            {loading && <div className="pj-empty">Loading…</div>}
            {!loading && groups.length === 0 && (
              <div className="pj-empty">
                {hasAnyFilter
                  ? "No tasks match the current filters."
                  : (
                    <>
                      No active tasks yet. Capture some in{" "}
                      <Link href="/backlog">Action items</Link>.
                    </>
                  )}
              </div>
            )}

            {groups.map((g) => {
              const groupKey = g.phase || g.label;
              const isCollapsed =
                collapsedGroups[groupKey] === undefined
                  ? !!g.collapsedByDefault
                  : !!collapsedGroups[groupKey];
              const toggle = () =>
                setCollapsedGroups((prev) => ({
                  ...prev,
                  [groupKey]: !isCollapsed,
                }));
              const gateLaunchCount = g.items.filter((t) =>
                hasGate(t, "gate:launch")
              ).length;
              return (
              <div key={groupKey} className="pj-group">
                <button
                  type="button"
                  className="pj-group-head pj-group-head--btn"
                  onClick={toggle}
                  aria-expanded={!isCollapsed}
                >
                  <span className="pj-group-chev">{isCollapsed ? "▸" : "▾"}</span>
                  <span className="pj-group-label">{g.label}</span>
                  <span className="pj-group-count">{g.items.length}</span>
                  {gateLaunchCount > 0 && (
                    <span className="pj-group-gate" title="Tasks gated to launch">
                      ⚑ {gateLaunchCount} launch-gate
                    </span>
                  )}
                </button>
                {!isCollapsed && g.items.map((t) => {
                  const mins = Math.round((t.effort_hours || 0) * 60);
                  const isOpen = expanded === t.id;
                  const subs = subtasks[t.id] || [];
                  return (
                    <div key={t.id} className="pj-item">
                      <div className="pj-item-row">
                        <button
                          type="button"
                          className={"pj-check" + (t.status === "done" ? " done" : "")}
                          onClick={() => toggleTask(t)}
                          aria-label="Toggle complete"
                        >
                          {t.status === "done" ? "✓" : ""}
                        </button>
                        <div className="pj-item-body">
                          <div
                            className={
                              "pj-item-text" + (t.status === "done" ? " done" : "")
                            }
                          >
                            {t.title}
                          </div>
                          <div className="pj-item-tags">
                            {t._isNextAction && (
                              <span className="ps-tag" style={{ background: "var(--ps-accent-soft)", color: "var(--ps-accent)", fontWeight: 600 }}>
                                ▶ Next
                              </span>
                            )}
                            {t.priority && (
                              <span className="ps-tag">{t.priority}</span>
                            )}
                            {typeTagOf(t) && (
                              <span className="ps-tag pj-tag-type">
                                {TYPE_TAG_LABELS[typeTagOf(t)]}
                              </span>
                            )}
                            {t.primary_life_domain && (
                              <span className="ps-tag pj-tag-need">
                                {HUMAN_NEED_STRATEGY_LABELS[t.primary_life_domain] ||
                                  t.primary_life_domain}
                              </span>
                            )}
                            {workstreamOf(t) && (
                              <span className="ps-tag pj-tag-ws">
                                {workstreamOf(t)}
                              </span>
                            )}
                            {locationOf(t) && (
                              <span className="ps-tag pj-tag-loc">
                                {locationOf(t)}
                              </span>
                            )}
                            {gatesOf(t).map((gate) => (
                              <span key={gate} className="ps-tag pj-tag-gate">
                                {gate}
                              </span>
                            ))}
                            {t.phase && (
                              <span className="ps-tag pj-tag-phase">
                                {t.phase.replace(/_/g, " ")}
                              </span>
                            )}
                            {(t.outcome_ids || []).length > 0 && (
                              <span className="ps-tag pj-tag-outcome">
                                → outcome
                              </span>
                            )}
                            {g.flag && (
                              <span className="ps-tag pj-tag-flag">⚑ Too big</span>
                            )}
                          </div>
                          {g.flag && (
                            <div className="pj-coach-note">
                              <div className="pj-coach-cap">Coach</div>
                              <p>
                                This one is ~{mins} minutes. Want me to propose
                                ≤30 min sub-steps?
                              </p>
                              {!breakdowns[t.id] && (
                                <button
                                  type="button"
                                  className="ps-btn ps-btn--primary"
                                  style={{ marginTop: 8 }}
                                  onClick={() => fetchBreakdown(t)}
                                  disabled={breakingDown === t.id}
                                >
                                  {breakingDown === t.id ? "Thinking…" : "Break it down"}
                                </button>
                              )}
                              {breakdowns[t.id]?.error && (
                                <div className="today-error" style={{ marginTop: 8 }}>
                                  {breakdowns[t.id].error}
                                </div>
                              )}
                              {Array.isArray(breakdowns[t.id]) && breakdowns[t.id].length > 0 && (
                                <div className="pj-breakdown-list">
                                  {breakdowns[t.id].map((s, i) => (
                                    <div key={i} className="pj-breakdown-row">
                                      <span className="pj-breakdown-mins">
                                        {s.minutes}m
                                      </span>
                                      <span className="pj-breakdown-text">
                                        {s.title}
                                      </span>
                                      <button
                                        type="button"
                                        className="ps-btn"
                                        onClick={() => acceptBreakdownStep(t, s)}
                                        disabled={
                                          insertingTask === `${t.id}:${s.title}`
                                        }
                                      >
                                        {insertingTask === `${t.id}:${s.title}`
                                          ? "…"
                                          : "Accept"}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {Array.isArray(breakdowns[t.id]) && breakdowns[t.id].length === 0 && (
                                <div className="pj-breakdown-empty">
                                  All proposed steps accepted.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="pj-item-size">{mins ? `${mins} min` : ""}</div>
                        <button
                          className="pj-item-expand"
                          onClick={() => {
                            const next = isOpen ? null : t.id;
                            setExpanded(next);
                            if (next) loadSubtasks(t.id);
                          }}
                        >
                          {isOpen ? "−" : "+"}
                        </button>
                      </div>
                      {isOpen && (
                        <div className="pj-subtasks">
                          {subs.length === 0 ? (
                            <div className="pj-empty-sub">No subtasks yet.</div>
                          ) : (
                            subs.map((s) => (
                              <div key={s.id} className="pj-sub">
                                <span
                                  className={
                                    "pj-check pj-check-sm" +
                                    (s.status === "done" ? " done" : "")
                                  }
                                >
                                  {s.status === "done" ? "✓" : ""}
                                </span>
                                <span className="pj-sub-text">{s.title}</span>
                                {s.effort_hours > 0 && (
                                  <span className="pj-sub-mins">
                                    {Math.round(s.effort_hours * 60)}m
                                  </span>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              );
            })}
          </div>

          {nextAction ? (
            <div className="pj-next">
              <div className="pj-next-cap">Next best ≤30-minute action</div>
              <div className="pj-next-title">{nextAction.title}</div>
              <div className="pj-next-meta">
                {nextAction.minutes ? <span>~{nextAction.minutes}m</span> : null}
                {nextAction.source ? (
                  <span className="pj-next-src">{nextAction.source.replace("_", " ")}</span>
                ) : null}
                {nextAction.needs_breakdown ? (
                  <span className="pj-next-warn">
                    Too big for 30m — break it down in tomorrow&apos;s morning check-in.
                  </span>
                ) : null}
              </div>
              {nextAction.why ? (
                <div className="pj-next-why">{nextAction.why}</div>
              ) : null}
            </div>
          ) : daysSinceAligned != null ? (
            <div className="pj-next pj-next--empty">
              <div className="pj-next-cap">Next best ≤30-minute action</div>
              <div className="pj-next-empty">
                Nothing queued. Run a Refresh to commit a next action,
                or add a task and the coach will auto-refill it.
              </div>
            </div>
          ) : null}

          <ProjectPartsPanel categoryId={categoryId} supabase={supabase} />

          <div className="pj-kb-wrap">
            <div className="pj-kb-head">
              <div>
                <div className="ps-section-title" style={{ margin: 0 }}>
                  Knowledge base &amp; resources
                </div>
                <div className="ps-section-sub">
                  Specs, contacts, reference links. Jarvis reads this as project
                  context.
                </div>
              </div>
              <button
                type="button"
                className="ps-btn ps-btn--primary"
                onClick={saveKb}
                disabled={kbSaving}
              >
                {kbSaving ? "Saving…" : "Save KB"}
              </button>
            </div>
            {kbError && <div className="today-error">{kbError}</div>}
            <ProjectKnowledgeBase
              knowledgeBase={knowledgeBase}
              onKnowledgeBaseChange={setKnowledgeBase}
              resources={resources}
              onResourcesChange={setResources}
              driveFolderUrl={driveFolderUrl}
              onDriveFolderUrlChange={setDriveFolderUrl}
              projectName={category?.name || "Project"}
              mantra={mantra}
              onSave={saveKb}
              saving={kbSaving}
            />
          </div>
        </div>

      <style jsx global>{`
        .pj-kb-wrap {
          margin-top: 32px;
          padding-top: 20px;
          border-top: 1px solid var(--ps-ink-10);
        }
        .pj-kb-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 14px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }
        .pj-kb-wrap .pkb {
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 12px;
          padding: 14px 16px;
        }
        .pj-breadcrumb {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .pj-breadcrumb a {
          color: inherit;
          text-decoration: none;
        }
        .pj-breadcrumb a:hover { color: var(--ps-ink); }
        .pj-sep { color: var(--ps-ink-30); }
        .pj-current { color: var(--ps-ink); }
        .pj-hero {
          background: var(--ps-paper-soft);
          border: 1px solid var(--ps-ink-10);
          border-radius: 16px;
          padding: 22px 24px;
          margin-top: 12px;
          display: grid;
          grid-template-columns: 1fr 260px;
          gap: 24px;
          align-items: center;
        }
        .pj-hero-eyebrow {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ps-ink-60);
          margin-bottom: 4px;
        }
        .pj-dot { width: 10px; height: 10px; border-radius: 3px; }
        .pj-align {
          margin-top: 12px;
          padding: 10px 14px;
          background: var(--ps-paper-soft);
          border: 1px solid var(--ps-ink-08);
          border-left: 3px solid var(--ps-ink-30);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
        }
        .pj-align--sage { border-left-color: var(--ps-sage); }
        .pj-align--gold { border-left-color: var(--ps-gold); }
        .pj-align--clay { border-left-color: var(--ps-clay); }
        .pj-align-main {
          display: inline-flex;
          align-items: baseline;
          gap: 10px;
          flex-wrap: wrap;
          font-size: 13px;
        }
        .pj-align-cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
        }
        .pj-align-val {
          font-family: var(--ps-serif);
          font-size: 18px;
          letter-spacing: -0.01em;
          color: var(--ps-ink);
        }
        .pj-align-val span { color: var(--ps-ink-50); font-size: 12px; }
        .pj-align-sep { color: var(--ps-ink-30); }
        .pj-align-last { color: var(--ps-ink-70); }
        .pj-align-last strong { color: var(--ps-ink); }
        .pj-align-actions {
          display: inline-flex;
          gap: 8px;
          align-items: center;
        }
        .pj-align-badge {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ps-accent);
          background: var(--ps-accent-soft);
          padding: 4px 10px;
          border-radius: 999px;
        }
        .pj-next {
          margin-top: 16px;
          padding: 16px 18px;
          background: var(--ps-paper-soft);
          border: 1px solid var(--ps-ink-08);
          border-left: 3px solid var(--ps-accent);
          border-radius: 12px;
        }
        .pj-next--empty {
          border-left-color: var(--ps-ink-15);
        }
        .pj-next-cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
          margin-bottom: 6px;
        }
        .pj-next-title {
          font-family: var(--ps-serif);
          font-size: 20px;
          letter-spacing: -0.01em;
          color: var(--ps-ink);
          line-height: 1.3;
        }
        .pj-next-meta {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
          font-family: var(--ps-mono);
          font-size: 11px;
          color: var(--ps-ink-60);
          margin-top: 6px;
        }
        .pj-next-src {
          text-transform: lowercase;
          color: var(--ps-ink-50);
        }
        .pj-next-warn {
          color: var(--ps-clay);
          font-family: var(--ps-sans);
          font-size: 12px;
        }
        .pj-next-why {
          margin-top: 8px;
          font-size: 13px;
          color: var(--ps-ink-70);
          line-height: 1.5;
        }
        .pj-next-empty {
          font-size: 13px;
          color: var(--ps-ink-60);
          line-height: 1.5;
        }
        .pj-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 20px;
          font-size: 12px;
          color: var(--ps-ink-60);
          margin-top: 10px;
        }
        .pj-meta strong { color: var(--ps-ink); font-weight: 600; }
        .pj-outcomes-isc {
          margin-top: 16px;
          padding: 12px 14px;
          background: var(--ps-paper-soft);
          border: 1px solid var(--ps-ink-08);
          border-radius: 10px;
        }
        .pj-outcomes-isc-cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
          margin-bottom: 10px;
        }
        .pj-outcomes-isc-row { margin-bottom: 10px; }
        .pj-outcomes-isc-row:last-child { margin-bottom: 0; }
        .pj-outcomes-isc-title {
          font-size: 13px;
          color: var(--ps-ink-80);
          margin-bottom: 4px;
        }
        .pj-mantra {
          margin-top: 14px;
          padding: 12px 14px;
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 10px;
        }
        .pj-mantra-cap {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
          margin-bottom: 6px;
        }
        .pj-mantra-text {
          font-family: var(--ps-serif);
          font-size: 16px;
          letter-spacing: -0.005em;
          line-height: 1.45;
          color: var(--ps-ink);
          margin-bottom: 10px;
        }
        .pj-mantra-empty {
          font-family: var(--ps-sans);
          font-style: normal;
          font-size: 13px;
          color: var(--ps-ink-50);
        }
        .pj-mantra-input {
          width: 100%;
          appearance: none;
          border: 1px solid var(--ps-ink-10);
          background: var(--ps-paper);
          padding: 10px 12px;
          border-radius: 8px;
          font-family: var(--ps-serif);
          font-size: 15px;
          line-height: 1.45;
          color: var(--ps-ink);
          resize: vertical;
          min-height: 60px;
          outline: none;
        }
        .pj-mantra-input:focus {
          border-color: var(--ps-accent);
        }
        .pj-mantra-actions {
          display: flex;
          gap: 6px;
          margin-top: 8px;
          flex-wrap: wrap;
        }
        .pj-mantra-suggestion {
          margin-top: 12px;
          padding: 10px 12px;
          background: var(--ps-accent-soft);
          border: 1px solid rgba(185, 115, 22, 0.25);
          border-radius: 8px;
        }
        .pj-mantra-suggestion-cap {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-accent);
          margin-bottom: 4px;
        }
        .pj-mantra-suggestion-text {
          font-family: var(--ps-serif);
          font-size: 15px;
          letter-spacing: -0.005em;
          line-height: 1.4;
          color: var(--ps-ink);
        }
        .pj-mantra-suggestion-reason {
          font-size: 12px;
          color: var(--ps-ink-60);
          margin-top: 4px;
          line-height: 1.5;
        }
        .pj-progress {
          background: #fff;
          border: 1px solid var(--ps-ink-08);
          border-radius: 12px;
          padding: 14px 16px;
        }
        .pj-progress-num {
          font-family: var(--ps-serif);
          font-size: 36px;
          letter-spacing: -0.02em;
          line-height: 1;
          color: var(--ps-ink);
        }
        .pj-progress-num span {
          font-size: 18px;
          color: var(--ps-ink-50);
          margin-left: 2px;
        }
        .pj-progress-cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
          margin: 4px 0 10px;
        }
        .pj-progress-bar {
          height: 6px;
          background: var(--ps-ink-08);
          border-radius: 3px;
          overflow: hidden;
          position: relative;
        }
        .pj-progress-fill {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          border-radius: 3px;
          transition: width 300ms;
        }
        .pj-outcomes {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-top: 12px;
        }
        .pj-outcome-card {
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 12px;
          padding: 14px 16px;
        }
        .pj-outcome-cap {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .pj-outcome-label {
          font-family: var(--ps-serif);
          font-size: 16px;
          letter-spacing: -0.01em;
          line-height: 1.3;
        }
        .pj-outcome-foot {
          display: flex;
          justify-content: space-between;
          margin-top: 6px;
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-50);
        }

        .pj-coach-card {
          margin-top: 24px;
          background: var(--ps-accent-soft);
          border: 1px solid rgba(185, 115, 22, 0.25);
          border-radius: 14px;
          padding: 18px 20px;
        }
        .pj-coach-head {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .pj-coach-card .pj-coach-cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-accent);
        }
        .pj-coach-title {
          font-family: var(--ps-serif);
          font-size: 18px;
          letter-spacing: -0.01em;
          margin-top: 4px;
        }
        .pj-coach-sub {
          font-size: 12px;
          color: var(--ps-ink-70);
          margin-top: 4px;
        }
        .pj-coach-outcomes {
          margin-top: 14px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 10px;
        }
        .pj-coach-outcome {
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 10px;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .pj-coach-outcome-text {
          font-family: var(--ps-serif);
          font-size: 14px;
          letter-spacing: -0.01em;
          line-height: 1.35;
          color: var(--ps-ink);
        }
        .pj-coach-outcome-reason {
          font-size: 12px;
          color: var(--ps-ink-70);
          line-height: 1.5;
        }
        .pj-coach-outcome-foot {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-top: 4px;
        }
        .pj-coach-hint {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.04em;
          color: var(--ps-ink-50);
        }
        .pj-breakdown-list {
          margin-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .pj-breakdown-row {
          display: grid;
          grid-template-columns: 36px 1fr auto;
          gap: 8px;
          align-items: center;
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 6px;
          padding: 6px 10px;
        }
        .pj-breakdown-mins {
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-accent);
          font-weight: 600;
        }
        .pj-breakdown-text {
          font-size: 12.5px;
          color: var(--ps-ink-80);
          line-height: 1.4;
        }
        .pj-breakdown-empty {
          margin-top: 8px;
          font-size: 12px;
          color: var(--ps-ink-50);
          font-style: italic;
        }
        .pj-ladder {
          margin-top: 32px;
        }
        .pj-ladder-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--ps-ink-10);
          margin-bottom: 14px;
        }
        .pj-ladder-title {
          font-family: var(--ps-serif);
          font-size: 20px;
          letter-spacing: -0.01em;
        }
        .pj-ladder-sub {
          font-size: 12px;
          color: var(--ps-ink-60);
          margin-top: 2px;
        }
        .pj-filters {
          background: var(--ps-paper-soft);
          border: 1px solid var(--ps-ink-08);
          border-radius: 10px;
          padding: 10px 14px;
          margin-bottom: 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .pj-filter-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
        }
        .pj-filter-row--meta {
          border-top: 1px solid var(--ps-ink-08);
          padding-top: 8px;
          margin-top: 2px;
          justify-content: space-between;
        }
        .pj-filter-cap {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
          width: 80px;
          flex-shrink: 0;
        }
        .pj-filter-chip {
          appearance: none;
          background: #fff;
          border: 1px solid var(--ps-ink-15);
          color: var(--ps-ink-70);
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          padding: 3px 8px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 120ms;
        }
        .pj-filter-chip:hover {
          border-color: var(--ps-ink-40);
          color: var(--ps-ink);
        }
        .pj-filter-chip.active {
          background: var(--ps-ink);
          color: var(--ps-bg);
          border-color: var(--ps-ink);
        }
        .pj-filter-chip--gate.active {
          background: var(--ps-clay);
          border-color: var(--ps-clay);
        }
        .pj-filter-summary {
          font-size: 12px;
          color: var(--ps-ink-60);
        }
        .pj-filter-summary strong { color: var(--ps-ink); }
        .pj-filter-clear {
          appearance: none;
          background: transparent;
          border: 1px solid var(--ps-ink-15);
          color: var(--ps-ink-60);
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          padding: 3px 8px;
          border-radius: 6px;
          cursor: pointer;
        }
        .pj-filter-clear:hover {
          color: var(--ps-clay);
          border-color: var(--ps-clay);
        }
        .pj-empty {
          background: var(--ps-paper);
          border: 1px dashed var(--ps-ink-15);
          border-radius: 12px;
          padding: 30px;
          text-align: center;
          color: var(--ps-ink-60);
          font-size: 13px;
        }
        .pj-group {
          margin-bottom: 20px;
        }
        .pj-group-head {
          display: flex;
          align-items: baseline;
          gap: 10px;
          padding: 6px 0;
          margin-bottom: 6px;
        }
        .pj-group-head--btn {
          appearance: none;
          background: transparent;
          border: none;
          width: 100%;
          text-align: left;
          cursor: pointer;
          color: inherit;
        }
        .pj-group-head--btn:hover .pj-group-label { color: var(--ps-accent); }
        .pj-group-chev {
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-50);
          width: 10px;
        }
        .pj-group-label {
          font-family: var(--ps-serif);
          font-size: 14px;
          letter-spacing: -0.01em;
        }
        .pj-group-count {
          margin-left: auto;
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-50);
        }
        .pj-group-gate {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--ps-clay);
          background: var(--ps-clay-soft);
          border-radius: 999px;
          padding: 2px 8px;
        }
        .pj-item {
          background: #fff;
          border: 1px solid var(--ps-ink-08);
          border-radius: 10px;
          margin-bottom: 6px;
        }
        .pj-item-row {
          display: grid;
          grid-template-columns: 22px 1fr auto 24px;
          gap: 12px;
          padding: 10px 14px;
          align-items: start;
        }
        .pj-check {
          appearance: none;
          width: 20px;
          height: 20px;
          margin-top: 2px;
          border-radius: 5px;
          border: 1.5px solid var(--ps-ink-30);
          background: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--ps-bg);
          font-size: 12px;
          line-height: 1;
        }
        .pj-check.done {
          background: var(--ps-sage);
          border-color: var(--ps-sage);
        }
        .pj-check-sm {
          width: 16px;
          height: 16px;
          font-size: 10px;
          border-width: 1px;
        }
        .pj-item-body { min-width: 0; }
        .pj-item-text {
          font-size: 13.5px;
          color: var(--ps-ink);
          line-height: 1.4;
        }
        .pj-item-text.done {
          text-decoration: line-through;
          color: var(--ps-ink-50);
        }
        .pj-item-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-top: 4px;
        }
        .pj-tag-flag { background: var(--ps-accent-soft); color: var(--ps-accent); }
        .pj-tag-type { background: var(--ps-sage-soft); color: var(--ps-sage); }
        .pj-tag-need { background: var(--ps-indigo-soft); color: var(--ps-indigo); }
        .pj-tag-outcome { background: var(--ps-gold-soft); color: var(--ps-gold); }
        .pj-tag-phase { background: var(--ps-plum-soft); color: var(--ps-plum); font-family: var(--ps-mono); font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase; }
        .pj-tag-ws { background: var(--ps-ink-08); color: var(--ps-ink-80); font-family: var(--ps-mono); font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600; }
        .pj-tag-loc { background: var(--ps-sage-soft, #eaf0e3); color: var(--ps-sage, #5a7a4a); font-family: var(--ps-mono); font-size: 9px; letter-spacing: 0.06em; }
        .pj-tag-gate { background: var(--ps-clay-soft); color: var(--ps-clay); font-family: var(--ps-mono); font-size: 9px; letter-spacing: 0.06em; font-weight: 600; }
        .pj-item-size {
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-50);
          letter-spacing: 0.04em;
          white-space: nowrap;
          margin-top: 2px;
        }
        .pj-item-expand {
          appearance: none;
          border: 1px solid var(--ps-ink-10);
          background: transparent;
          width: 24px;
          height: 24px;
          border-radius: 6px;
          cursor: pointer;
          color: var(--ps-ink-60);
          font-size: 14px;
          line-height: 1;
        }
        .pj-item-expand:hover { border-color: var(--ps-ink); color: var(--ps-ink); }
        .pj-coach-note {
          background: var(--ps-accent-soft);
          border: 1px solid rgba(185, 115, 22, 0.25);
          border-radius: 8px;
          padding: 10px 12px;
          margin-top: 8px;
        }
        .pj-coach-note p { margin: 4px 0 0; font-size: 12px; color: var(--ps-ink-80); line-height: 1.5; }
        .pj-coach-cap {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-accent);
        }
        .pj-subtasks {
          padding: 4px 14px 12px 46px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .pj-sub {
          display: grid;
          grid-template-columns: 16px 1fr auto;
          gap: 8px;
          align-items: center;
          padding: 4px 0;
          font-size: 12.5px;
          color: var(--ps-ink-80);
        }
        .pj-sub-mins {
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-50);
        }
        .pj-empty-sub {
          font-size: 12px;
          color: var(--ps-ink-50);
          font-style: italic;
          padding: 4px 0;
        }

        @media (max-width: 900px) {
          .pj-hero { grid-template-columns: 1fr; }
          .pj-outcomes { grid-template-columns: 1fr; }
        }
      `}</style>
    </PSShell>
  );
}
