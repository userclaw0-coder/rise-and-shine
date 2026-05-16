import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PSShell from "../components/PSShell";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabaseClient";
import {
  getOrCreateDailyPlan,
  updateDailyPlan,
  getUserProfile,
  upsertUserProfile,
  setTaskCompletionForDate,
  updateTaskStatusWithEvent,
  getDailyNoteForDate,
  upsertDailyNote,
} from "../lib/db";

const CAPACITY_LEVELS = [
  { id: "light", label: "Light", color: "var(--ps-sage)" },
  { id: "normal", label: "Normal", color: "var(--ps-indigo)" },
  { id: "heavy", label: "Heavy", color: "var(--ps-gold)" },
  { id: "overwhelmed", label: "Overwhelmed", color: "var(--ps-clay)" },
];

function randomId() {
  return "sit_" + Math.random().toString(36).slice(2, 10);
}

const NEEDS = [
  { id: "certainty", label: "Certainty", color: "var(--ps-gold)" },
  { id: "variety", label: "Variety", color: "var(--ps-plum)" },
  { id: "significance", label: "Significance", color: "var(--ps-accent)" },
  { id: "connection", label: "Connection", color: "var(--ps-clay)" },
  { id: "growth", label: "Growth", color: "var(--ps-indigo)" },
  { id: "contribution", label: "Contribution", color: "var(--ps-sage)" },
];

const CATEGORY_COLORS = [
  "var(--ps-clay)",
  "var(--ps-indigo)",
  "var(--ps-plum)",
  "var(--ps-accent)",
  "var(--ps-gold)",
  "var(--ps-sage)",
  "var(--ps-ink)",
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function classifyType(task) {
  const effort = Number(task.effort_hours || 0);
  if (task.priority === "High" || task.priority === "Critical") return "leverage";
  if (effort > 0 && effort <= 0.25) return "win";
  return "progress";
}

function inferNeeds(task) {
  const domains = task.life_domains || [];
  const map = {
    growth: "growth",
    business: "significance",
    health: "growth",
    family: "connection",
    home: "certainty",
    adventure: "variety",
    contribution: "contribution",
  };
  const needs = new Set();
  for (const d of domains) if (map[d]) needs.add(map[d]);
  if (needs.size === 0) needs.add("growth");
  return [...needs];
}

export default function TodayPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState(null);
  const [queueTasks, setQueueTasks] = useState([]);
  const [perProject, setPerProject] = useState([]);
  const [completed, setCompleted] = useState({});
  const [busyTask, setBusyTask] = useState(null);
  const [refilling, setRefilling] = useState(false);
  const [autoRefillTried, setAutoRefillTried] = useState(false);
  // PR-D morning check-in + reflection state
  const [morningState, setMorningState] = useState(null);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkInEnergy, setCheckInEnergy] = useState("");
  const [checkInFocus, setCheckInFocus] = useState("");
  const [checkInSaving, setCheckInSaving] = useState(false);
  const [reflection, setReflection] = useState(null);
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [reflectionDraft, setReflectionDraft] = useState({});
  const [reflectionSaving, setReflectionSaving] = useState(false);
  const [promoting, setPromoting] = useState(null);
  // Cycles Pick's replace-slot when queue is full so consecutive picks
  // don't all land on slot 3.
  const [replaceIdx, setReplaceIdx] = useState(0);

  // Daily context state
  const [profile, setProfile] = useState(null);
  const [contextText, setContextText] = useState("");
  const [contextSaving, setContextSaving] = useState(false);
  const [contextSavedAt, setContextSavedAt] = useState(null);
  const [lifeSituations, setLifeSituations] = useState([]);
  const [addingSituation, setAddingSituation] = useState(false);
  const [newSituationLabel, setNewSituationLabel] = useState("");
  const [capacity, setCapacity] = useState("normal");
  const contextSaveTimer = useRef(null);

  // Morning approvals
  const [morningProposals, setMorningProposals] = useState([]);
  const [morningOpen, setMorningOpen] = useState(false);
  const [morningLoading, setMorningLoading] = useState(false);
  const [morningApproved, setMorningApproved] = useState({});
  const [morningApplying, setMorningApplying] = useState(false);
  const morningCheckedRef = useRef(false);

  const dateStr = todayStr();

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const [planRes, profileRes, categoriesRes, noteRes] = await Promise.all([
        getOrCreateDailyPlan(user.id, dateStr),
        getUserProfile(user.id),
        supabase
          .from("categories")
          .select("id, name")
          .eq("user_id", user.id)
          .order("name", { ascending: true }),
        getDailyNoteForDate(user.id, dateStr),
      ]);

      if (planRes.error) throw new Error(planRes.error.message);
      setPlan(planRes.data);
      const ms = planRes.data?.morning_state || null;
      setMorningState(ms);
      setCheckInEnergy(ms?.energy || "");
      setCheckInFocus(ms?.focus_text || "");
      const refl = planRes.data?.reflection || null;
      setReflection(refl);
      // Pre-fill the reflection draft from saved entries (or blanks).
      const draft = {};
      for (const slotIdx of [0, 1, 2]) {
        const saved = refl?.entries?.find((e) => e.slot === slotIdx + 1);
        draft[slotIdx] = {
          landed: saved ? !!saved.landed : null,
          felt: saved?.felt || null,
          note: saved?.note || "",
        };
      }
      setReflectionDraft(draft);

      const profileData = profileRes?.data?.profile || {};
      setProfile(profileRes?.data || null);
      const prefs = profileData.preferences || {};
      const situations = Array.isArray(prefs.life_situations)
        ? prefs.life_situations.filter((s) => !s.archived_at)
        : [];
      setLifeSituations(situations);
      const dailyCap = prefs.daily_capacity || {};
      setCapacity(dailyCap[dateStr] || "normal");
      setContextText(noteRes?.data?.note || "");
      setContextSavedAt(noteRes?.data?.updated_at || null);

      const categories = categoriesRes.data || [];
      const colorMap = {};
      categories.forEach((c, i) => {
        colorMap[c.id] = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
      });

      // Trust queue entries that either have a real task_id OR an
      // `invented` payload (PR-D system-designed ephemeral actions).
      // Other shapes (legacy nulls, stale 3-entry queues with empties)
      // are filtered out.
      const rawSlots = (planRes.data?.queue || []).filter(
        (s) => s && (s.task_id || s.invented)
      );
      const realTaskIds = rawSlots
        .filter((s) => s.task_id)
        .map((s) => s.task_id);
      let taskMap = new Map();
      if (realTaskIds.length > 0) {
        const { data: queueRows } = await supabase
          .from("tasks")
          .select(
            "id, title, status, category_id, priority, effort_hours, outcome_ids, primary_life_domain, life_domains"
          )
          .in("id", realTaskIds);
        taskMap = new Map((queueRows || []).map((t) => [t.id, t]));
      }
      const queueDetails = rawSlots
        .map((slot) => {
          if (slot.task_id) {
            const task = taskMap.get(slot.task_id);
            if (!task) return null;
            return {
              slot: slot.slot,
              type: slot.type,
              why: slot.why || "",
              task,
              invented: null,
            };
          }
          return {
            slot: slot.slot,
            type: slot.type,
            why: slot.why || slot.invented?.why || "",
            task: null,
            invented: slot.invented,
          };
        })
        .filter(Boolean);
      setQueueTasks(queueDetails);

      const { data: activeTasks } = await supabase
        .from("tasks")
        .select(
          "id, title, status, category_id, priority, effort_hours, outcome_ids, primary_life_domain, life_domains, created_at"
        )
        .eq("user_id", user.id)
        .in("status", ["todo", "doing"])
        .is("archived_at", null)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: true });

      const priorityOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      const nextByCategory = new Map();
      for (const t of activeTasks || []) {
        if (!t.category_id) continue;
        const existing = nextByCategory.get(t.category_id);
        if (!existing) {
          nextByCategory.set(t.category_id, t);
          continue;
        }
        const a = priorityOrder[existing.priority] ?? 2;
        const b = priorityOrder[t.priority] ?? 2;
        if (b < a) nextByCategory.set(t.category_id, t);
      }

      const projectList = categories
        .map((c) => {
          const task = nextByCategory.get(c.id);
          if (!task) return null;
          return {
            catId: c.id,
            catName: c.name,
            color: colorMap[c.id],
            task,
          };
        })
        .filter(Boolean);
      setPerProject(projectList);

      const { data: events } = await supabase
        .from("task_events")
        .select("task_id, event_type, created_at")
        .eq("user_id", user.id)
        .in("event_type", ["completed", "uncompleted"])
        .gte("created_at", `${dateStr}T00:00:00Z`)
        .lte("created_at", `${dateStr}T23:59:59Z`);
      const byTask = {};
      for (const e of events || []) {
        byTask[e.task_id] = e.event_type === "completed";
      }
      setCompleted(byTask);

    } catch (err) {
      setError(err.message || "Failed to load today.");
    } finally {
      setLoading(false);
    }
  }, [user, dateStr]);

  useEffect(() => {
    load();
  }, [load]);

  // Morning approvals — once per local morning, after 4am, if not dismissed.
  useEffect(() => {
    if (!user || loading) return;
    if (morningCheckedRef.current) return;
    const prefs = profile?.profile?.preferences || {};
    const lastDismissed = prefs.morning_approvals?.last_dismissed_date || null;
    const hour = new Date().getHours();
    if (lastDismissed === dateStr) return;
    if (hour < 4) return;
    morningCheckedRef.current = true;

    (async () => {
      setMorningLoading(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/morning/approvals", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const body = await res.json();
        const list = Array.isArray(body?.proposals) ? body.proposals : [];
        setMorningProposals(list);
        if (list.length > 0) {
          // Default: all approved. User can uncheck individual ones.
          const def = {};
          for (const p of list) def[p.id] = true;
          setMorningApproved(def);
        }
      } catch {
        // silent
      } finally {
        setMorningLoading(false);
      }
    })();
  }, [user, loading, profile, dateStr]);

  async function applyMorning(skip = false) {
    if (morningApplying) return;
    setMorningApplying(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return;
      const approved = skip
        ? []
        : morningProposals.filter((p) => morningApproved[p.id]);
      await fetch("/api/morning/approvals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ approved }),
      });
      setMorningProposals([]);
      setMorningOpen(false);
      // Refresh Today data so promotions land.
      await load();
    } finally {
      setMorningApplying(false);
    }
  }

  // Debounced save for daily context text
  useEffect(() => {
    if (!user || loading) return;
    clearTimeout(contextSaveTimer.current);
    setContextSaving(true);
    contextSaveTimer.current = setTimeout(async () => {
      try {
        const { data } = await upsertDailyNote(user.id, dateStr, contextText);
        if (data?.updated_at) setContextSavedAt(data.updated_at);
      } finally {
        setContextSaving(false);
      }
    }, 800);
    return () => clearTimeout(contextSaveTimer.current);
  }, [contextText, user, dateStr, loading]);

  // Persist a patch to profile.preferences without stomping other keys.
  const savePrefPatch = useCallback(
    async (patch) => {
      if (!user) return;
      const base = profile?.profile || {};
      const prefs = { ...(base.preferences || {}), ...patch };
      const nextProfile = { ...base, preferences: prefs };
      const res = await upsertUserProfile(user.id, nextProfile);
      if (res?.data) setProfile(res.data);
    },
    [user, profile]
  );

  async function handleCapacityChange(nextId) {
    if (!user) return;
    setCapacity(nextId);
    const base = profile?.profile || {};
    const prefs = base.preferences || {};
    const dailyCap = { ...(prefs.daily_capacity || {}), [dateStr]: nextId };
    await savePrefPatch({ daily_capacity: dailyCap });
  }

  async function handleAddSituation() {
    const label = String(newSituationLabel || "").trim();
    if (!label) {
      setAddingSituation(false);
      return;
    }
    const entry = {
      id: randomId(),
      label,
      opened_on: dateStr,
    };
    const next = [...lifeSituations, entry];
    setLifeSituations(next);
    setNewSituationLabel("");
    setAddingSituation(false);
    const base = profile?.profile || {};
    const prefs = base.preferences || {};
    const allExisting = Array.isArray(prefs.life_situations) ? prefs.life_situations : [];
    await savePrefPatch({
      life_situations: [...allExisting, entry],
    });
  }

  async function handleArchiveSituation(id) {
    const now = new Date().toISOString();
    setLifeSituations((list) => list.filter((s) => s.id !== id));
    const base = profile?.profile || {};
    const prefs = base.preferences || {};
    const allExisting = Array.isArray(prefs.life_situations) ? prefs.life_situations : [];
    const next = allExisting.map((s) =>
      s.id === id ? { ...s, archived_at: now } : s
    );
    await savePrefPatch({ life_situations: next });
  }

  async function toggleComplete(task) {
    if (!user || !task?.id || busyTask) return;
    setBusyTask(task.id);
    const next = !completed[task.id];
    setCompleted((c) => ({ ...c, [task.id]: next }));
    try {
      await setTaskCompletionForDate(user.id, task.id, dateStr, next);
      if (next) {
        await updateTaskStatusWithEvent(user.id, task.id, "done");
        // Fire-and-forget: promote the next ≤30m candidate in this
        // project's next_action slot if this task was the active one.
        fireAutoRefill(task.id);
      } else {
        await updateTaskStatusWithEvent(user.id, task.id, "todo");
      }
    } catch {
      setCompleted((c) => ({ ...c, [task.id]: !next }));
    } finally {
      setBusyTask(null);
    }
  }

  async function fireAutoRefill(taskId) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return;
      fetch("/api/tasks/auto-refill", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ task_id: taskId }),
      }).catch(() => {});
    } catch {
      // silent — auto-refill is best-effort
    }
  }

  function labelForType(task) {
    const kind = classifyType(task);
    if (kind === "leverage") return "High Leverage";
    if (kind === "win") return "Quick Win";
    return "Progress";
  }

  // Keep only entries that have a real task_id and renumber slots
  // contiguously. Nulls in the stored queue (from legacy data or old
  // code paths) get cleaned out here on every write.
  function compactQueue(slots) {
    return (slots || [])
      .filter((s) => s && s.task_id)
      .slice(0, 3)
      .map((s, i) => ({
        slot: i + 1,
        type: s.type || labelForTypeFallback(i),
        task_id: s.task_id,
      }));
  }

  function labelForTypeFallback(idx) {
    if (idx === 0) return "Quick Win";
    if (idx === 1) return "High Leverage";
    return "Progress";
  }

  async function savePlanQueue(nextQueue) {
    if (!user || !plan) return;
    const compact = compactQueue(nextQueue);
    setPlan({ ...plan, queue: compact });
    const res = await updateDailyPlan(plan.id, { queue: compact });
    if (res.error) {
      setError(res.error.message || "Failed to save top 3.");
      return;
    }
    load();
  }

  async function pinToTop3(task) {
    if (!user || !plan || !task) return;
    const filled = compactQueue(plan.queue);
    if (filled.find((s) => s.task_id === task.id)) return;
    let next;
    if (filled.length < 3) {
      next = [
        ...filled,
        {
          slot: filled.length + 1,
          type: labelForType(task),
          task_id: task.id,
        },
      ];
    } else {
      // Queue is full — cycle through slots 1→2→3→1… so consecutive
      // picks don't all clobber the same slot.
      const target = replaceIdx % 3;
      next = filled.map((s, i) =>
        i === target
          ? { slot: i + 1, type: labelForType(task), task_id: task.id }
          : s
      );
      setReplaceIdx(target + 1);
    }
    await savePlanQueue(next);
  }

  async function removeFromTop3(taskId) {
    if (!user || !plan) return;
    const filled = compactQueue(plan.queue).filter(
      (s) => s.task_id !== taskId
    );
    await savePlanQueue(filled);
  }

  async function clearQueue() {
    if (!user || !plan) return;
    setReplaceIdx(0);
    await savePlanQueue([]);
  }

  const refillQueue = useCallback(
    async ({ force = false } = {}) => {
      if (!user || refilling) return;
      setRefilling(true);
      setError("");
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        const res = await fetch("/api/plan/refill", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ date: dateStr, force }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || "Refill failed");
        }
        await load();
      } catch (err) {
        setError(err.message || "Failed to refill queue.");
      } finally {
        setRefilling(false);
      }
    },
    [user, dateStr, refilling, load]
  );

  const submitCheckIn = useCallback(async () => {
    if (!user || !checkInEnergy || checkInSaving) return;
    setCheckInSaving(true);
    setError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch("/api/today/check-in", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          date: dateStr,
          energy: checkInEnergy,
          focus_text: checkInFocus || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Check-in failed");
      }
      const body = await res.json();
      setMorningState(body.morning_state);
      setCheckInOpen(false);
    } catch (err) {
      setError(err.message || "Failed to save check-in.");
    } finally {
      setCheckInSaving(false);
    }
  }, [user, dateStr, checkInEnergy, checkInFocus, checkInSaving]);

  const submitReflection = useCallback(async () => {
    if (!user || reflectionSaving) return;
    const entries = [0, 1, 2]
      .map((i) => {
        const d = reflectionDraft[i] || {};
        if (d.landed == null && !d.felt && !d.note) return null;
        return {
          slot: i + 1,
          landed: !!d.landed,
          felt: d.felt || null,
          note: d.note || null,
        };
      })
      .filter(Boolean);
    if (entries.length === 0) return;
    setReflectionSaving(true);
    setError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch("/api/today/reflection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ date: dateStr, entries }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Reflection save failed");
      }
      const body = await res.json();
      setReflection(body.reflection);
      setReflectionOpen(false);
    } catch (err) {
      setError(err.message || "Failed to save reflection.");
    } finally {
      setReflectionSaving(false);
    }
  }, [user, dateStr, reflectionDraft, reflectionSaving]);

  const promoteInventedSlot = useCallback(
    async (slotIdx) => {
      if (!user || promoting !== null) return null;
      setPromoting(slotIdx);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        const res = await fetch("/api/today/promote-slot", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ date: dateStr, slot_index: slotIdx }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || "Promote failed");
        }
        const body = await res.json();
        await load();
        return body.task?.id || null;
      } catch (err) {
        setError(err.message || "Failed to promote slot.");
        return null;
      } finally {
        setPromoting(null);
      }
    },
    [user, dateStr, promoting, load]
  );

  const [regenSlotIdx, setRegenSlotIdx] = useState(null);
  const regenerateSlot = useCallback(
    async (slotIdx) => {
      if (!user || regenSlotIdx !== null) return;
      setRegenSlotIdx(slotIdx);
      setError("");
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        const res = await fetch("/api/today/regenerate-slot", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ date: dateStr, slot_index: slotIdx }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || "Regenerate failed");
        }
        await load();
      } catch (err) {
        setError(err.message || "Failed to regenerate slot.");
      } finally {
        setRegenSlotIdx(null);
      }
    },
    [user, dateStr, regenSlotIdx, load]
  );

  // Auto-refill the queue on first load if it has no real entries.
  // "Real" means an actual task_id — legacy plans sometimes store 3
  // empty slot objects, which a naive length check would treat as full.
  useEffect(() => {
    if (loading) return;
    if (autoRefillTried) return;
    if (!plan) return;
    const filled = (plan.queue || []).filter((s) => s && s.task_id);
    if (filled.length === 0) {
      setAutoRefillTried(true);
      // force=true so the refill API rewrites even if a stale queue
      // with null entries happens to have length 3.
      refillQueue({ force: true });
    }
  }, [loading, plan, autoRefillTried, refillQueue]);

  const totalChosen = queueTasks.filter((q) => q.task).length;
  const focusMin = queueTasks.reduce((acc, q) => acc + Math.round((q.task?.effort_hours || 0) * 60), 0);

  const needTotals = useMemo(() => {
    const totals = NEEDS.map((n) => ({ ...n, count: 0 }));
    const pool = perProject.map((p) => p.task);
    for (const t of pool) {
      const n = inferNeeds(t);
      for (const id of n) {
        const found = totals.find((x) => x.id === id);
        if (found) found.count += 1;
      }
    }
    const max = Math.max(1, ...totals.map((t) => t.count));
    return totals.map((t) => ({ ...t, pct: Math.round((t.count / max) * 100) }));
  }, [perProject]);

  const niceDate = new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  if (!user) return null;

  const coachPayload = {
    date: dateStr,
    chosen_titles: queueTasks
      .filter((q) => q.task)
      .map((q) => q.task.title),
    focus_minutes: focusMin,
    candidates: perProject.slice(0, 12).map((p) => ({
      project: p.catName,
      title: p.task.title,
      priority: p.task.priority,
      minutes: Math.round((p.task.effort_hours || 0) * 60),
      done: !!completed[p.task.id],
    })),
    need_balance: needTotals.map((n) => ({
      need: n.id,
      count: n.count,
    })),
    context_notes: (contextText || "").slice(0, 1200),
    capacity,
    life_situations: lifeSituations.map((s) => ({
      label: s.label,
      opened_on: s.opened_on,
    })),
  };

  return (
    <PSShell scope="today" title="Today" coachPayload={coachPayload} coachPayloadReady={!loading}>
      <div className="ps-view">
          <div className="ps-eyebrow">{niceDate}</div>
          <h1 className="ps-title">Today</h1>
          <p className="ps-sub">
            Your coach surfaces one next action per active project. Pick your top 3
            for the morning block — the rest stay parked until you&apos;re ready.
          </p>

          {error && <div className="today-error">{error}</div>}

          {morningProposals.length > 0 && !morningOpen && (
            <button
              type="button"
              className="today-morning-banner"
              onClick={() => setMorningOpen(true)}
            >
              <span className="today-morning-dot" />
              <span className="today-morning-text">
                <strong>Good morning</strong> · {morningProposals.length} decision
                {morningProposals.length === 1 ? "" : "s"} · 90 seconds
              </span>
              <span className="today-morning-arrow">→</span>
            </button>
          )}

          {morningProposals.length > 0 && morningOpen && (
            <section className="today-morning-drawer">
              <div className="today-morning-head">
                <div>
                  <div className="today-morning-eyebrow">Morning check-in</div>
                  <div className="today-morning-title">
                    {morningProposals.length} decision{morningProposals.length === 1 ? "" : "s"} from overnight
                  </div>
                </div>
                <button
                  type="button"
                  className="ps-btn"
                  onClick={() => setMorningOpen(false)}
                >
                  Close
                </button>
              </div>
              <div className="today-morning-list">
                {morningProposals.map((p) => (
                  <label key={p.id} className="today-morning-card">
                    <input
                      type="checkbox"
                      checked={!!morningApproved[p.id]}
                      onChange={(e) =>
                        setMorningApproved((m) => ({ ...m, [p.id]: e.target.checked }))
                      }
                    />
                    <div className="today-morning-card-body">
                      <div className="today-morning-card-cap">
                        {p.project_name} · {p.type.replace("_", " ")}
                      </div>
                      {p.type === "break_down" && (
                        <>
                          <div className="today-morning-card-title">
                            Break down: {p.parent_title}
                          </div>
                          <ul className="today-morning-card-sub">
                            {(p.proposed_subtasks || []).map((s, idx) => (
                              <li key={idx}>
                                {s.title} <span>({s.minutes || "?"}m)</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                      {p.type === "new_next_action" && (
                        <>
                          <div className="today-morning-card-title">
                            {p.proposed?.title}
                            {p.proposed?.minutes ? (
                              <span className="today-morning-card-m">~{p.proposed.minutes}m</span>
                            ) : null}
                          </div>
                          {p.proposed?.why && (
                            <div className="today-morning-card-why">{p.proposed.why}</div>
                          )}
                        </>
                      )}
                      {p.type === "reorder" && (
                        <div className="today-morning-card-title">
                          Reorder {(p.proposed_order || []).length} tasks
                        </div>
                      )}
                      {p.rationale && (
                        <div className="today-morning-card-rat">{p.rationale}</div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
              <div className="today-morning-foot">
                <button
                  type="button"
                  className="ps-btn"
                  onClick={() => applyMorning(true)}
                  disabled={morningApplying}
                >
                  Skip morning
                </button>
                <button
                  type="button"
                  className="ps-btn ps-btn--primary"
                  onClick={() => applyMorning(false)}
                  disabled={morningApplying}
                >
                  {morningApplying
                    ? "Applying…"
                    : `Approve ${Object.values(morningApproved).filter(Boolean).length}`}
                </button>
              </div>
            </section>
          )}

          <div className="today-hero">
            {!morningState && !checkInOpen ? (
              <button
                type="button"
                className="today-checkin today-checkin--prompt"
                onClick={() => setCheckInOpen(true)}
              >
                <span className="today-checkin__cap">Good morning</span>
                <span className="today-checkin__sub">
                  60-second check-in shapes the day&apos;s 3 actions →
                </span>
              </button>
            ) : null}
            {morningState && !checkInOpen ? (
              <div className="today-checkin today-checkin--summary">
                <span className="today-checkin__cap">Checked in</span>
                <span className="today-checkin__sub">
                  Energy: <strong>{morningState.energy}</strong>
                  {morningState.focus_text
                    ? ` · ${morningState.focus_text}`
                    : ""}
                </span>
                <button
                  type="button"
                  className="today-checkin__edit"
                  onClick={() => setCheckInOpen(true)}
                >
                  Edit
                </button>
              </div>
            ) : null}
            {checkInOpen ? (
              <div className="today-checkin today-checkin--form">
                <div className="today-checkin__cap">Morning check-in</div>
                <div className="today-checkin__energy">
                  {["low", "medium", "high"].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      className={
                        "today-checkin__energy-btn" +
                        (checkInEnergy === lvl ? " today-checkin__energy-btn--on" : "")
                      }
                      onClick={() => setCheckInEnergy(lvl)}
                    >
                      {lvl} energy
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  className="today-checkin__focus"
                  placeholder="What&apos;s on your mind? (optional, ≤480 chars)"
                  value={checkInFocus}
                  onChange={(e) => setCheckInFocus(e.target.value.slice(0, 480))}
                  maxLength={480}
                />
                <div className="today-checkin__actions">
                  <button
                    type="button"
                    className="today-checkin__save"
                    onClick={submitCheckIn}
                    disabled={!checkInEnergy || checkInSaving}
                  >
                    {checkInSaving ? "Saving…" : "Save check-in"}
                  </button>
                  <button
                    type="button"
                    className="today-checkin__cancel"
                    onClick={() => setCheckInOpen(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
            <div className="today-hero__head">
              <div>
                <div className="today-hero__eyebrow">Today&apos;s commitment</div>
                <h2 className="today-hero__title">
                  {totalChosen === 0
                    ? "Your next 3 actions."
                    : totalChosen < 3
                    ? `${totalChosen} of 3 locked in — pick ${3 - totalChosen} more.`
                    : "Three actions, in order. Start with the top."}
                </h2>
                <p className="today-hero__sub">
                  {totalChosen > 0 && focusMin > 0
                    ? `${focusMin} focused minutes queued.`
                    : "Refill pulls the highest-leverage tasks across your projects automatically."}
                </p>
              </div>
              <div className="today-hero__stats">
                <div className="today-hero__stat">
                  <div className="today-hero__num">{totalChosen}</div>
                  <div className="today-hero__cap">Chosen</div>
                </div>
                <div className="today-hero__stat">
                  <div className="today-hero__num">{focusMin}m</div>
                  <div className="today-hero__cap">Focus</div>
                </div>
              </div>
            </div>

            <div className="today-hero__slots">
              {[0, 1, 2].map((i) => {
                const entry = queueTasks[i];
                const task = entry?.task;
                const invented = entry?.invented;
                const filled = !!(task || invented);
                const type = entry?.type || "Progress";
                const done = task ? !!completed[task.id] : false;
                const promotingThis = promoting === i;
                const minutes = task
                  ? task.effort_hours
                    ? Math.round(task.effort_hours * 60)
                    : 0
                  : invented?.minutes || 0;
                return (
                  <div
                    key={i}
                    className={
                      "today-slot" +
                      (filled ? " today-slot--filled" : "") +
                      (invented ? " today-slot--invented" : "") +
                      (done ? " today-slot--done" : "")
                    }
                  >
                    <div className="today-slot__meta">
                      {filled && (
                        <button
                          type="button"
                          className={
                            "today-slot__check" +
                            (done ? " today-slot__check--on" : "")
                          }
                          onClick={() =>
                            invented
                              ? promoteInventedSlot(i)
                              : toggleComplete(task)
                          }
                          disabled={
                            invented
                              ? promotingThis || promoting !== null
                              : busyTask === task?.id
                          }
                          aria-label={
                            invented
                              ? "Mark this proposal complete (promotes to real task)"
                              : done
                              ? "Mark incomplete"
                              : "Mark complete"
                          }
                          title={
                            invented
                              ? "Marking complete creates a real task in the suggested category and logs the completion."
                              : undefined
                          }
                        >
                          {promotingThis ? "…" : done ? "✓" : ""}
                        </button>
                      )}
                      <span className="today-slot__idx">0{i + 1}</span>
                      <span className="today-slot__type">
                        {filled ? type : "Empty"}
                      </span>
                      {invented ? (
                        <span className="today-slot__proposal">proposal</span>
                      ) : null}
                    </div>
                    {filled ? (
                      <>
                        <div className="today-slot__title">
                          {task ? task.title : invented.title}
                        </div>
                        {entry?.why ? (
                          <div className="today-slot__why">{entry.why}</div>
                        ) : null}
                        <div className="today-slot__foot">
                          {minutes > 0 && (
                            <span className="today-slot__mins">
                              ~{minutes} min
                            </span>
                          )}
                          <button
                            type="button"
                            className="today-slot__regen"
                            onClick={() => regenerateSlot(i)}
                            disabled={regenSlotIdx !== null}
                            title="Swap this slot for the next-best candidate from a different project"
                          >
                            {regenSlotIdx === i ? "Regen…" : "Regenerate"}
                          </button>
                          {task ? (
                            <button
                              type="button"
                              className="today-slot__remove"
                              onClick={() => removeFromTop3(task.id)}
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <div className="today-slot__empty">
                        Pick a task below or use Refill
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="today-hero__actions">
              <button
                type="button"
                className="today-refill"
                onClick={() => refillQueue({ force: true })}
                disabled={refilling}
              >
                {refilling
                  ? "Refilling…"
                  : totalChosen === 0
                  ? "Fill top 3 automatically"
                  : "Refill"}
              </button>
              {totalChosen > 0 && (
                <button
                  type="button"
                  className="today-clear"
                  onClick={clearQueue}
                  disabled={refilling}
                >
                  Clear queue
                </button>
              )}
              <div className="today-hero__hint">
                Refill uses your vision, category weights, and recent
                progress to pick 3 tasks across projects. Clear lets you
                hand-pick from scratch.
              </div>
            </div>

            {totalChosen > 0 ? (
              <div className="today-reflect">
                {!reflectionOpen && !reflection ? (
                  <button
                    type="button"
                    className="today-reflect__open"
                    onClick={() => setReflectionOpen(true)}
                  >
                    End-of-day reflection →
                  </button>
                ) : null}
                {!reflectionOpen && reflection ? (
                  <div className="today-reflect__saved">
                    <span className="today-reflect__cap">Reflection saved</span>
                    <button
                      type="button"
                      className="today-reflect__edit"
                      onClick={() => setReflectionOpen(true)}
                    >
                      Edit
                    </button>
                  </div>
                ) : null}
                {reflectionOpen ? (
                  <div className="today-reflect__form">
                    <div className="today-reflect__head">
                      How did today land? Quick honest pass —
                      activation-energy estimates learn from this.
                    </div>
                    {[0, 1, 2].map((i) => {
                      const entry = queueTasks[i];
                      const labelTask = entry?.task?.title || entry?.invented?.title;
                      if (!labelTask) return null;
                      const d = reflectionDraft[i] || {};
                      const set = (patch) =>
                        setReflectionDraft((prev) => ({
                          ...prev,
                          [i]: { ...prev[i], ...patch },
                        }));
                      return (
                        <div key={i} className="today-reflect__row">
                          <div className="today-reflect__row-title">
                            <span className="today-reflect__row-idx">0{i + 1}</span>
                            <span className="today-reflect__row-label">{labelTask}</span>
                          </div>
                          <div className="today-reflect__row-controls">
                            <label className="today-reflect__chk">
                              <input
                                type="checkbox"
                                checked={!!d.landed}
                                onChange={(e) => set({ landed: e.target.checked })}
                              />
                              <span>Landed</span>
                            </label>
                            {["easy", "neutral", "hard"].map((felt) => (
                              <button
                                key={felt}
                                type="button"
                                className={
                                  "today-reflect__felt" +
                                  (d.felt === felt ? " today-reflect__felt--on" : "")
                                }
                                onClick={() =>
                                  set({ felt: d.felt === felt ? null : felt })
                                }
                              >
                                {felt}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    <div className="today-reflect__actions">
                      <button
                        type="button"
                        className="today-reflect__save"
                        onClick={submitReflection}
                        disabled={reflectionSaving}
                      >
                        {reflectionSaving ? "Saving…" : "Save reflection"}
                      </button>
                      <button
                        type="button"
                        className="today-reflect__cancel"
                        onClick={() => setReflectionOpen(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <section className="today-context">
            <div className="today-context__head">
              <div>
                <div className="today-context__eyebrow">Today · context</div>
                <div className="today-context__title">
                  What&apos;s going on?
                </div>
              </div>
              <div className="today-capacity" role="radiogroup" aria-label="Capacity">
                {CAPACITY_LEVELS.map((lvl) => (
                  <button
                    key={lvl.id}
                    type="button"
                    className={
                      "today-cap-chip" +
                      (capacity === lvl.id ? " today-cap-chip--on" : "")
                    }
                    style={{ "--chip-color": lvl.color }}
                    onClick={() => handleCapacityChange(lvl.id)}
                    aria-pressed={capacity === lvl.id}
                    title={`Mark today as ${lvl.label.toLowerCase()}`}
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="today-situations">
              <span className="today-situations__cap">Ongoing</span>
              {lifeSituations.length === 0 && !addingSituation && (
                <span className="today-situations__empty">
                  Nothing pinned. Add a situation the coach should factor in
                  every day.
                </span>
              )}
              {lifeSituations.map((s) => (
                <span key={s.id} className="today-situation">
                  {s.label}
                  <button
                    type="button"
                    className="today-situation__x"
                    onClick={() => handleArchiveSituation(s.id)}
                    aria-label={`Archive ${s.label}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {addingSituation ? (
                <span className="today-situation-add">
                  <input
                    autoFocus
                    type="text"
                    value={newSituationLabel}
                    onChange={(e) => setNewSituationLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddSituation();
                      if (e.key === "Escape") {
                        setAddingSituation(false);
                        setNewSituationLabel("");
                      }
                    }}
                    placeholder="e.g. dad's recovery"
                    className="today-situation-add__input"
                  />
                  <button
                    type="button"
                    className="today-situation-add__save"
                    onClick={handleAddSituation}
                  >
                    Add
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="today-situations__plus"
                  onClick={() => setAddingSituation(true)}
                >
                  + add
                </button>
              )}
            </div>

            <textarea
              className="today-context__textarea"
              value={contextText}
              onChange={(e) => setContextText(e.target.value)}
              placeholder="Dump what's happening today — family stuff, energy, distractions, anything the coach should know. No structure needed."
              rows={4}
            />

            <div className="today-context__foot">
              <span className="today-context__readers">
                Coach reads this on Today, Jarvis, and the weekly review.
              </span>
              <span className="today-context__saved">
                {contextSaving
                  ? "Saving…"
                  : contextSavedAt
                  ? `Saved ${new Date(contextSavedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
                  : ""}
              </span>
            </div>
          </section>

          <div className="ps-section-title">Next best action per project</div>
          <div className="ps-section-sub">
            {loading
              ? "Loading…"
              : `${perProject.length} projects have a ready next step`}
          </div>

          <div className="today-list">
            {perProject.length === 0 && !loading && (
              <div className="today-empty">
                No active tasks across your projects. Open <Link href="/backlog">Action items</Link> to plan some.
              </div>
            )}
            {perProject.map((p, i) => {
              const chosen = queueTasks.some((q) => q.task?.id === p.task.id);
              const type = classifyType(p.task);
              const needs = inferNeeds(p.task);
              const mins = Math.round((p.task.effort_hours || 0) * 60);
              const done = !!completed[p.task.id];
              return (
                <div
                  key={p.catId}
                  className={"today-action" + (done ? " done" : "")}
                >
                  <button
                    type="button"
                    className={"today-check" + (done ? " checked" : "")}
                    onClick={() => toggleComplete(p.task)}
                    aria-label={done ? "Mark incomplete" : "Mark complete"}
                  >
                    {done ? "✓" : ""}
                  </button>
                  <span className="today-dot" style={{ background: p.color }} />
                  <div className="today-body">
                    <div className="today-proj" style={{ color: p.color }}>
                      <span className="today-idx">0{i + 1}</span>
                      {p.catName}
                    </div>
                    <div className="today-text">{p.task.title}</div>
                    <div className="today-meta">
                      <span className={`ps-tag ps-tag--type-${type}`}>
                        {type === "win"
                          ? "Quick win"
                          : type === "leverage"
                          ? "High leverage"
                          : "Progress"}
                      </span>
                      {needs.map((n) => (
                        <span key={n} className={`ps-tag ps-tag--need-${n}`}>
                          · {n}
                        </span>
                      ))}
                      {p.task.priority && (
                        <span className="ps-tag">p · {p.task.priority}</span>
                      )}
                    </div>
                  </div>
                  <div className="today-actions">
                    {mins > 0 && <div className="today-time">~{mins} min</div>}
                    <button
                      type="button"
                      className={"ps-btn" + (chosen ? " ps-btn--primary" : "")}
                      onClick={() => pinToTop3(p.task)}
                      disabled={chosen}
                    >
                      {chosen ? "★ Top 3" : "Pick"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {needTotals.some((n) => n.count > 0) && (
            <div className="today-ribbon">
              <div className="today-ribbon__head">
                <div>
                  <div className="today-ribbon__title">How today feeds your needs</div>
                  <div className="today-ribbon__sub">
                    If you complete everything above, this is what your day contributes to.
                  </div>
                </div>
                <div className="today-ribbon__cap">Need balance · today</div>
              </div>
              <div className="today-ribbon__grid">
                {needTotals.map((n) => (
                  <div key={n.id} className="today-nb">
                    <div className="today-nb__label" style={{ color: n.color }}>
                      {n.label}
                    </div>
                    <div className="today-nb__val">{n.count}</div>
                    <div className="today-nb__bar">
                      <div
                        className="today-nb__fill"
                        style={{ width: n.pct + "%", background: n.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      <style jsx global>{`
        .today-error {
          margin: 14px 0;
          padding: 10px 14px;
          border-radius: 10px;
          background: var(--ps-clay-soft);
          color: var(--ps-clay);
          font-size: 13px;
          border: 1px solid rgba(184, 92, 62, 0.22);
        }
        .today-morning-banner {
          appearance: none;
          width: 100%;
          margin: 14px 0 0;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          background: var(--ps-accent-soft);
          border: 1px solid var(--ps-accent);
          border-radius: 12px;
          cursor: pointer;
          color: var(--ps-ink);
          font-family: inherit;
          font-size: 14px;
          text-align: left;
        }
        .today-morning-dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: var(--ps-accent);
          flex-shrink: 0;
        }
        .today-morning-text { flex: 1; }
        .today-morning-arrow {
          color: var(--ps-accent);
          font-family: var(--ps-mono);
        }
        .today-morning-drawer {
          margin-top: 14px;
          padding: 18px 20px;
          background: var(--ps-paper-soft);
          border: 1px solid var(--ps-accent);
          border-radius: 14px;
        }
        .today-morning-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        .today-morning-eyebrow {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ps-accent);
        }
        .today-morning-title {
          font-family: var(--ps-serif);
          font-size: 20px;
          letter-spacing: -0.01em;
          color: var(--ps-ink);
        }
        .today-morning-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .today-morning-card {
          display: flex;
          gap: 12px;
          padding: 12px 14px;
          background: #fff;
          border: 1px solid var(--ps-ink-08);
          border-radius: 10px;
          cursor: pointer;
        }
        .today-morning-card input[type="checkbox"] {
          margin-top: 4px;
          flex-shrink: 0;
        }
        .today-morning-card-body { flex: 1; min-width: 0; }
        .today-morning-card-cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
        }
        .today-morning-card-title {
          margin-top: 3px;
          font-family: var(--ps-serif);
          font-size: 16px;
          color: var(--ps-ink);
          line-height: 1.35;
        }
        .today-morning-card-m {
          font-family: var(--ps-mono);
          font-size: 11px;
          color: var(--ps-ink-50);
          margin-left: 8px;
        }
        .today-morning-card-sub {
          margin: 6px 0 0;
          padding-left: 18px;
          font-size: 13px;
          color: var(--ps-ink-80);
          line-height: 1.5;
        }
        .today-morning-card-sub span {
          font-family: var(--ps-mono);
          font-size: 11px;
          color: var(--ps-ink-50);
          margin-left: 4px;
        }
        .today-morning-card-why,
        .today-morning-card-rat {
          margin-top: 4px;
          font-size: 12px;
          color: var(--ps-ink-60);
          line-height: 1.5;
        }
        .today-morning-card-rat { font-style: italic; }
        .today-morning-foot {
          margin-top: 14px;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }
        .today-context {
          margin-top: 18px;
          padding: 18px 20px;
          background: var(--ps-paper-soft);
          border: 1px solid var(--ps-ink-08);
          border-radius: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .today-context__head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .today-context__eyebrow {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
        }
        .today-context__title {
          font-family: var(--ps-serif);
          font-size: 20px;
          letter-spacing: -0.01em;
          color: var(--ps-ink);
          margin-top: 2px;
        }
        .today-capacity {
          display: inline-flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .today-cap-chip {
          appearance: none;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid var(--ps-ink-15);
          background: transparent;
          color: var(--ps-ink-70);
          font-family: var(--ps-mono);
          font-size: 11px;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: border-color 120ms, background 120ms, color 120ms;
        }
        .today-cap-chip:hover {
          border-color: var(--chip-color);
          color: var(--ps-ink);
        }
        .today-cap-chip--on {
          border-color: var(--chip-color);
          background: var(--chip-color);
          color: #fff;
        }
        .today-situations {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
        }
        .today-situations__cap {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
          margin-right: 4px;
        }
        .today-situations__empty {
          font-size: 12px;
          color: var(--ps-ink-50);
        }
        .today-situation {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 6px 4px 10px;
          border-radius: 999px;
          background: var(--ps-ink-05);
          border: 1px solid var(--ps-ink-10);
          font-size: 12px;
          color: var(--ps-ink-80);
        }
        .today-situation__x {
          appearance: none;
          border: none;
          background: transparent;
          color: var(--ps-ink-50);
          cursor: pointer;
          padding: 0 4px;
          font-size: 14px;
          line-height: 1;
        }
        .today-situation__x:hover {
          color: var(--ps-clay);
        }
        .today-situation-add {
          display: inline-flex;
          gap: 6px;
          align-items: center;
        }
        .today-situation-add__input {
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid var(--ps-ink-15);
          background: #fff;
          font-size: 12px;
          font-family: inherit;
          min-width: 160px;
        }
        .today-situation-add__input:focus {
          outline: none;
          border-color: var(--ps-accent);
        }
        .today-situation-add__save {
          appearance: none;
          border: none;
          background: var(--ps-ink);
          color: var(--ps-paper);
          padding: 4px 12px;
          border-radius: 999px;
          font-size: 12px;
          cursor: pointer;
        }
        .today-situations__plus {
          appearance: none;
          border: 1px dashed var(--ps-ink-15);
          background: transparent;
          color: var(--ps-ink-60);
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-family: var(--ps-mono);
          cursor: pointer;
          letter-spacing: 0.04em;
        }
        .today-situations__plus:hover {
          border-color: var(--ps-ink-30);
          color: var(--ps-ink);
        }
        .today-context__textarea {
          width: 100%;
          min-height: 92px;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid var(--ps-ink-10);
          background: #fff;
          font: inherit;
          font-size: 14px;
          line-height: 1.55;
          color: var(--ps-ink);
          resize: vertical;
        }
        .today-context__textarea:focus {
          outline: none;
          border-color: var(--ps-accent);
          box-shadow: 0 0 0 3px rgba(185, 115, 22, 0.10);
        }
        .today-context__foot {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          color: var(--ps-ink-50);
        }
        .today-hero {
          background: var(--ps-ink);
          color: var(--ps-bg);
          border-radius: 16px;
          padding: 24px 26px;
          margin-top: 20px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .today-hero__head {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 20px;
          align-items: center;
        }
        .today-hero__slots {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        .today-slot {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-height: 112px;
        }
        .today-slot--filled {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(185, 115, 22, 0.5);
        }
        .today-slot--done {
          opacity: 0.55;
          border-color: rgba(107, 143, 113, 0.55);
        }
        .today-slot--done .today-slot__title {
          text-decoration: line-through;
        }
        .today-slot__meta {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .today-slot__check {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 5px;
          border: 1.5px solid rgba(255, 255, 255, 0.35);
          background: transparent;
          cursor: pointer;
          color: #fff;
          font-size: 12px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
        }
        .today-slot__check:hover:not(:disabled) {
          border-color: var(--ps-accent);
        }
        .today-slot__check--on {
          background: var(--ps-sage);
          border-color: var(--ps-sage);
        }
        .today-slot__check:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .today-slot__idx {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.1em;
          color: rgba(250, 247, 242, 0.45);
        }
        .today-slot__type {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ps-accent);
        }
        .today-slot__title {
          font-family: var(--ps-serif);
          font-size: 15px;
          line-height: 1.3;
          letter-spacing: -0.005em;
          flex: 1;
          color: var(--ps-bg);
        }
        .today-slot__why {
          font-size: 11.5px;
          color: rgba(250, 247, 242, 0.55);
          line-height: 1.45;
          margin-top: 4px;
          margin-bottom: 8px;
          font-style: italic;
        }
        .today-slot__foot {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          font-family: var(--ps-mono);
          font-size: 10px;
          color: rgba(250, 247, 242, 0.55);
        }
        .today-slot__regen,
        .today-slot__remove {
          appearance: none;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: transparent;
          color: rgba(250, 247, 242, 0.7);
          padding: 3px 8px;
          border-radius: 4px;
          font-family: var(--ps-mono);
          font-size: 9.5px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .today-slot__regen:hover:not(:disabled) {
          border-color: var(--ps-accent);
          color: var(--ps-accent);
        }
        .today-slot__regen:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .today-slot__remove:hover {
          border-color: var(--ps-clay);
          color: var(--ps-clay);
        }
        .today-slot__empty {
          font-size: 12px;
          color: rgba(250, 247, 242, 0.4);
          font-style: italic;
          flex: 1;
        }
        .today-hero__actions {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }
        /* PR-D: morning check-in card (renders above today-hero__head) */
        .today-checkin {
          margin-bottom: 18px;
          padding: 12px 16px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }
        .today-checkin--prompt {
          cursor: pointer;
          appearance: none;
          width: 100%;
          text-align: left;
          color: rgba(250, 247, 242, 0.85);
        }
        .today-checkin--prompt:hover {
          background: rgba(255, 255, 255, 0.07);
        }
        .today-checkin--form {
          flex-direction: column;
          align-items: stretch;
        }
        .today-checkin__cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(250, 247, 242, 0.55);
        }
        .today-checkin__sub {
          font-size: 13px;
          color: rgba(250, 247, 242, 0.75);
          flex: 1;
        }
        .today-checkin__edit {
          appearance: none;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: transparent;
          color: rgba(250, 247, 242, 0.7);
          padding: 4px 10px;
          border-radius: 4px;
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .today-checkin__energy {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .today-checkin__energy-btn {
          appearance: none;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: transparent;
          color: rgba(250, 247, 242, 0.8);
          padding: 6px 14px;
          border-radius: 999px;
          font-family: var(--ps-mono);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          cursor: pointer;
        }
        .today-checkin__energy-btn--on {
          border-color: var(--ps-accent);
          background: var(--ps-accent);
          color: #fff;
        }
        .today-checkin__focus {
          appearance: none;
          width: 100%;
          background: rgba(0, 0, 0, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: var(--ps-paper);
          padding: 8px 10px;
          border-radius: 6px;
          font-size: 13px;
          font-family: var(--ps-sans);
        }
        .today-checkin__actions {
          display: flex;
          gap: 10px;
        }
        .today-checkin__save {
          appearance: none;
          border: 1px solid var(--ps-accent);
          background: var(--ps-accent);
          color: #fff;
          padding: 6px 14px;
          border-radius: 6px;
          font-family: var(--ps-mono);
          font-size: 10.5px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .today-checkin__save:disabled { opacity: 0.5; cursor: not-allowed; }
        .today-checkin__cancel {
          appearance: none;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: transparent;
          color: rgba(250, 247, 242, 0.7);
          padding: 6px 14px;
          border-radius: 6px;
          font-family: var(--ps-mono);
          font-size: 10.5px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
        }
        /* PR-D: invented-slot marker (one-of-three is system-proposed) */
        .today-slot--invented .today-slot__title { font-style: italic; }
        .today-slot__proposal {
          font-family: var(--ps-mono);
          font-size: 9.5px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          background: rgba(255, 255, 255, 0.12);
          color: rgba(250, 247, 242, 0.85);
          padding: 2px 6px;
          border-radius: 999px;
          margin-left: 6px;
        }
        /* PR-D: end-of-day reflection card */
        .today-reflect {
          margin-top: 18px;
          padding-top: 14px;
          border-top: 1px dashed rgba(255, 255, 255, 0.12);
        }
        .today-reflect__open,
        .today-reflect__edit {
          appearance: none;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: transparent;
          color: rgba(250, 247, 242, 0.75);
          padding: 6px 12px;
          border-radius: 6px;
          font-family: var(--ps-mono);
          font-size: 11px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .today-reflect__open:hover,
        .today-reflect__edit:hover {
          border-color: var(--ps-accent);
          color: var(--ps-accent);
        }
        .today-reflect__saved {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .today-reflect__cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(250, 247, 242, 0.5);
        }
        .today-reflect__form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .today-reflect__head {
          font-size: 12px;
          color: rgba(250, 247, 242, 0.65);
          line-height: 1.5;
        }
        .today-reflect__row {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 8px 10px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 6px;
        }
        .today-reflect__row-title {
          display: flex;
          gap: 8px;
          align-items: baseline;
        }
        .today-reflect__row-idx {
          font-family: var(--ps-mono);
          font-size: 10px;
          color: rgba(250, 247, 242, 0.5);
        }
        .today-reflect__row-label {
          font-size: 13px;
          color: rgba(250, 247, 242, 0.85);
        }
        .today-reflect__row-controls {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }
        .today-reflect__chk {
          display: flex;
          align-items: center;
          gap: 5px;
          font-family: var(--ps-mono);
          font-size: 10.5px;
          color: rgba(250, 247, 242, 0.75);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .today-reflect__felt {
          appearance: none;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: transparent;
          color: rgba(250, 247, 242, 0.75);
          padding: 3px 10px;
          border-radius: 999px;
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .today-reflect__felt--on {
          border-color: var(--ps-accent);
          background: var(--ps-accent);
          color: #fff;
        }
        .today-reflect__actions {
          display: flex;
          gap: 10px;
        }
        .today-reflect__save,
        .today-reflect__cancel {
          appearance: none;
          padding: 6px 14px;
          border-radius: 6px;
          font-family: var(--ps-mono);
          font-size: 10.5px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .today-reflect__save {
          border: 1px solid var(--ps-accent);
          background: var(--ps-accent);
          color: #fff;
        }
        .today-reflect__save:disabled { opacity: 0.5; cursor: not-allowed; }
        .today-reflect__cancel {
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: transparent;
          color: rgba(250, 247, 242, 0.7);
        }
        .today-refill {
          appearance: none;
          border: 1px solid var(--ps-accent);
          background: var(--ps-accent);
          color: #fff;
          padding: 9px 16px;
          border-radius: 8px;
          font-family: var(--ps-mono);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .today-refill:hover:not(:disabled) {
          filter: brightness(1.05);
        }
        .today-refill:disabled {
          opacity: 0.6;
          cursor: default;
        }
        .today-clear {
          appearance: none;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: transparent;
          color: rgba(250, 247, 242, 0.75);
          padding: 9px 14px;
          border-radius: 8px;
          font-family: var(--ps-mono);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .today-clear:hover:not(:disabled) {
          border-color: var(--ps-clay);
          color: var(--ps-clay);
        }
        .today-clear:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .today-hero__hint {
          font-size: 12px;
          color: rgba(250, 247, 242, 0.5);
          line-height: 1.4;
          flex: 1;
          min-width: 220px;
        }
        .today-hero__eyebrow {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(250, 247, 242, 0.6);
          margin-bottom: 8px;
        }
        .today-hero__title {
          margin: 0 0 6px;
          font-family: var(--ps-serif);
          font-size: 22px;
          font-weight: 400;
          letter-spacing: -0.01em;
          line-height: 1.25;
        }
        .today-hero__sub { margin: 0; font-size: 13px; color: rgba(250, 247, 242, 0.75); line-height: 1.55; }
        .today-hero__stats { display: flex; gap: 18px; align-items: center; }
        .today-hero__stat { text-align: right; }
        .today-hero__num {
          font-family: var(--ps-serif);
          font-size: 32px;
          letter-spacing: -0.02em;
        }
        .today-hero__cap {
          font-family: var(--ps-mono);
          font-size: 9px;
          color: rgba(250, 247, 242, 0.6);
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .today-list { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
        .today-empty {
          background: var(--ps-paper);
          border: 1px dashed var(--ps-ink-15);
          padding: 22px;
          border-radius: 12px;
          color: var(--ps-ink-70);
          font-size: 13px;
        }
        .today-empty a { color: var(--ps-accent); }
        .today-action {
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 12px;
          padding: 14px 16px;
          display: grid;
          grid-template-columns: 24px auto 1fr auto;
          gap: 14px;
          align-items: start;
          transition: border-color 120ms, box-shadow 120ms, opacity 120ms;
        }
        .today-action:hover { border-color: var(--ps-ink-30); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04); }
        .today-action.done { opacity: 0.55; }
        .today-check {
          appearance: none;
          width: 22px;
          height: 22px;
          margin-top: 2px;
          border-radius: 6px;
          border: 1.5px solid var(--ps-ink-30);
          background: #fff;
          cursor: pointer;
          color: var(--ps-bg);
          font-size: 13px;
          line-height: 1;
        }
        .today-check.checked { background: var(--ps-sage); border-color: var(--ps-sage); }
        .today-check:hover { border-color: var(--ps-ink); }
        .today-dot {
          width: 10px;
          height: 10px;
          border-radius: 3px;
          margin-top: 7px;
          flex-shrink: 0;
        }
        .today-body { min-width: 0; }
        .today-proj {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        .today-idx {
          font-family: var(--ps-mono);
          font-size: 9px;
          opacity: 0.6;
          margin-right: 6px;
        }
        .today-text {
          font-size: 14px;
          color: var(--ps-ink);
          line-height: 1.45;
          margin-bottom: 8px;
          font-weight: 450;
        }
        .today-meta { display: flex; flex-wrap: wrap; gap: 5px; }
        .today-actions {
          display: flex;
          flex-direction: column;
          gap: 6px;
          align-items: flex-end;
        }
        .today-time {
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-50);
          letter-spacing: 0.05em;
        }
        .today-ribbon {
          background: var(--ps-paper-soft);
          border: 1px solid var(--ps-ink-08);
          border-radius: 14px;
          padding: 18px 20px;
          margin-top: 24px;
        }
        .today-ribbon__head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          margin-bottom: 12px;
          gap: 16px;
        }
        .today-ribbon__title {
          font-family: var(--ps-serif);
          font-size: 16px;
          letter-spacing: -0.01em;
        }
        .today-ribbon__sub { font-size: 12px; color: var(--ps-ink-60); margin-top: 2px; }
        .today-ribbon__cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-50);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .today-ribbon__grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 12px;
        }
        .today-nb { display: flex; flex-direction: column; gap: 6px; }
        .today-nb__label {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .today-nb__val {
          font-family: var(--ps-serif);
          font-size: 16px;
          letter-spacing: -0.01em;
          color: var(--ps-ink);
        }
        .today-nb__bar {
          height: 5px;
          background: var(--ps-ink-08);
          border-radius: 2px;
          position: relative;
          overflow: hidden;
        }
        .today-nb__fill {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          border-radius: 2px;
        }
        @media (max-width: 880px) {
          .today-hero__head { grid-template-columns: 1fr; }
          .today-hero__stats { justify-content: flex-start; }
          .today-hero__slots { grid-template-columns: 1fr; }
          .today-action { grid-template-columns: 24px auto 1fr; }
          .today-actions { grid-column: 1 / -1; flex-direction: row; justify-content: space-between; align-items: center; }
          .today-ribbon__grid { grid-template-columns: repeat(3, 1fr); }
        }
      `}</style>
    </PSShell>
  );
}
