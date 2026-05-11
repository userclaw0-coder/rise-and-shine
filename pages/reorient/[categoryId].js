// /reorient/[categoryId] — Reorient Phase B per-project wizard.
//
// Two entry modes:
//   - Standalone: from project page "Reorient this project" button.
//   - In cycle: after /reorient Phase A completes, redirected here for
//     each stale project in priority order. Queue state lives in
//     sessionStorage under "rs-reorient-queue".
//
// On Apply with advanceTarget="next" + remaining queue, navigates to
// /reorient/<next>. Otherwise → /today.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import PSShell from "../../components/PSShell";
import ReorientProjectWizard from "../../components/ReorientProjectWizard";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabaseClient";

const QUEUE_KEY = "rs-reorient-queue";

function readQueue() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeQueue(arr) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(QUEUE_KEY, JSON.stringify(arr));
  } catch {
    // noop
  }
}

function clearQueue() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(QUEUE_KEY);
  } catch {
    // noop
  }
}

export default function ReorientProjectPage() {
  const router = useRouter();
  const { categoryId } = router.query;
  const { user, isCheckingAuth } = useAuth();
  const [coachState, setCoachState] = useState(null);

  // Compute on every render. SessionStorage read is cheap and we don't
  // want setState-in-effect. SSR returns 0; client gets the real value on
  // mount (Phase B is always entered post-navigation so no flash matters).
  const queueRemaining =
    typeof window === "undefined"
      ? 0
      : readQueue().filter((id) => id !== categoryId).length;

  // Pre-load real project state for the coach's opening note. Without this
  // the coach has only category_id + queue_remaining and hallucinates.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.id || !categoryId) return;
      try {
        const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
        const [catRes, wsRes, openRes, doneRes] = await Promise.all([
          supabase
            .from("categories")
            .select("name")
            .eq("id", categoryId)
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase
            .from("shared_project_workspaces")
            .select("workspace")
            .eq("category_id", categoryId)
            .eq("owner_user_id", user.id)
            .maybeSingle(),
          supabase
            .from("tasks")
            .select("id, title, priority, effort_hours, phase")
            .eq("user_id", user.id)
            .eq("category_id", categoryId)
            .is("archived_at", null)
            .in("status", ["todo", "doing"]),
          supabase
            .from("task_events")
            .select("created_at, tasks(title)")
            .eq("user_id", user.id)
            .eq("event_type", "completed")
            .gte("created_at", cutoff)
            .order("created_at", { ascending: false })
            .limit(8),
        ]);
        if (cancelled) return;
        const ws = wsRes.data?.workspace || {};
        const tasks = openRes.data || [];
        setCoachState({
          category_id: categoryId,
          queue_remaining: queueRemaining,
          project_name: catRes.data?.name || null,
          mantra: ws.mantra || null,
          last_reorient_at: ws.last_reorient_at || ws.last_aligned_at || null,
          open_task_count: tasks.length,
          tasks_with_phase: tasks.filter((t) => t.phase).length,
          tasks_without_phase: tasks.filter((t) => !t.phase).length,
          critical_or_high_count: tasks.filter(
            (t) => t.priority === "Critical" || t.priority === "High"
          ).length,
          recent_completions_30d: (doneRes.data || []).map((e) => ({
            title: e.tasks?.title,
            at: e.created_at,
          })),
          mode: ws.mode || null,
        });
      } catch {
        // Best-effort enrichment — fall through to a thin payload.
        if (!cancelled) {
          setCoachState({ category_id: categoryId, queue_remaining: queueRemaining });
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, categoryId, queueRemaining]);

  const handleComplete = useCallback(
    ({ advanceTarget }) => {
      const remaining = readQueue().filter((id) => id !== categoryId);
      writeQueue(remaining);
      if (advanceTarget === "next" && remaining.length > 0) {
        router.push(`/reorient/${remaining[0]}`);
      } else {
        clearQueue();
        router.push("/today");
      }
    },
    [router, categoryId]
  );

  const handleSkipToNext = useCallback(() => {
    const remaining = readQueue().filter((id) => id !== categoryId);
    writeQueue(remaining);
    if (remaining.length > 0) {
      router.push(`/reorient/${remaining[0]}`);
    } else {
      clearQueue();
      router.push("/today");
    }
  }, [router, categoryId]);

  const coachScope = categoryId ? `reorient:${categoryId}` : "reorient";

  if (isCheckingAuth || !user || !categoryId) {
    return (
      <PSShell scope="reorient" title="Reorient" coachDisabled>
        <div style={{ padding: 80, textAlign: "center", color: "var(--ps-ink-60)" }}>
          Loading…
        </div>
      </PSShell>
    );
  }

  return (
    <PSShell
      scope={coachScope}
      title="Reorient project"
      scopeHint="Project Reorient pass"
      coachPayload={coachState || { category_id: categoryId, queue_remaining: queueRemaining }}
      coachPayloadReady={!!coachState}
    >
      <ReorientProjectWizard
        userId={user.id}
        categoryId={categoryId}
        onComplete={handleComplete}
        onSkipToNext={queueRemaining > 1 ? handleSkipToNext : undefined}
      />
    </PSShell>
  );
}
