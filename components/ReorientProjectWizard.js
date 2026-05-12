// ReorientProjectWizard — 4-step per-project Reorient pass.
//
// Steps:
//   1. Status check    — review/edit mantra + narrative
//   2. Task triage     — mark done / archive / keep+phase across all open tasks
//   3. KB capture      — append to knowledge_base + add/edit resources
//   4. Commit          — confirm changes, optional mode, apply
//
// Props:
//   userId
//   categoryId
//   onComplete(result)   — called after a successful apply
//   onSkipToNext()       — called when user clicks "Skip to next" in step nav

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { REORIENT_PHASES, REORIENT_MODES } from "../lib/reorientConstants";

const STEPS = [
  { id: "status", label: "Status", num: "01" },
  { id: "triage", label: "Task triage", num: "02" },
  { id: "kb", label: "Knowledge", num: "03" },
  { id: "commit", label: "Commit", num: "04" },
];

function priorityRank(p) {
  return { Critical: 0, High: 1, Medium: 2, Low: 3 }[p] ?? 2;
}

export default function ReorientProjectWizard({ userId, categoryId, onComplete, onSkipToNext }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [project, setProject] = useState(null);
  const [mantra, setMantra] = useState("");
  const [narrative, setNarrative] = useState("");
  const [kb, setKb] = useState("");
  const [resources, setResources] = useState([]);
  const [mode, setMode] = useState(null);
  const [driveFolderUrl, setDriveFolderUrl] = useState("");
  const [lastReorientAt, setLastReorientAt] = useState(null);
  const [tasks, setTasks] = useState([]);
  // decisions[taskId] = { action: 'done'|'archive'|'keep', phase?: text }
  const [decisions, setDecisions] = useState({});
  const [newResource, setNewResource] = useState(null);
  const [advanceTarget, setAdvanceTarget] = useState("next"); // 'next' | 'today'

  const load = useCallback(async () => {
    if (!userId || !categoryId) return;
    setLoading(true);
    setError("");
    try {
      const [catRes, wsRes, tasksRes] = await Promise.all([
        supabase
          .from("categories")
          .select("id, name")
          .eq("id", categoryId)
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("shared_project_workspaces")
          .select("workspace, knowledge_base")
          .eq("category_id", categoryId)
          .eq("owner_user_id", userId)
          .maybeSingle(),
        supabase
          .from("tasks")
          .select(
            "id, title, status, priority, effort_hours, due_date, phase, parent_task_id"
          )
          .eq("user_id", userId)
          .eq("category_id", categoryId)
          .is("archived_at", null)
          .in("status", ["todo", "doing"])
          .order("priority", { ascending: true })
          .order("updated_at", { ascending: false }),
      ]);
      if (catRes.error || !catRes.data) {
        throw new Error("Project not found.");
      }
      setProject(catRes.data);
      const ws = wsRes.data?.workspace || {};
      setMantra(ws.mantra || "");
      setNarrative(ws.narrative || "");
      setKb(wsRes.data?.knowledge_base || "");
      setResources(Array.isArray(ws.resources) ? ws.resources : []);
      setMode(ws.mode || null);
      setDriveFolderUrl(ws.drive_folder_url || "");
      setLastReorientAt(ws.last_reorient_at || ws.last_aligned_at || null);
      // Sort tasks: top-level first (no parent_task_id), then by priority, then by updated_at.
      const sorted = (tasksRes.data || []).sort((a, b) => {
        if ((a.parent_task_id ? 1 : 0) !== (b.parent_task_id ? 1 : 0)) {
          return (a.parent_task_id ? 1 : 0) - (b.parent_task_id ? 1 : 0);
        }
        return priorityRank(a.priority) - priorityRank(b.priority);
      });
      setTasks(sorted);
      // Initialize decisions: any task with an existing phase pre-selects "keep" + that phase.
      const initial = {};
      for (const t of sorted) {
        if (t.phase) initial[t.id] = { action: "keep", phase: t.phase };
      }
      setDecisions(initial);
    } catch (err) {
      setError(err.message || "Failed to load project.");
    } finally {
      setLoading(false);
    }
  }, [userId, categoryId]);

  useEffect(() => {
    load();
  }, [load]);

  function setDecision(taskId, patch) {
    setDecisions((prev) => {
      const existing = prev[taskId] || {};
      const next = { ...existing, ...patch };
      // If action becomes done/archive, drop phase (it's irrelevant)
      if (next.action === "done" || next.action === "archive") {
        delete next.phase;
      }
      return { ...prev, [taskId]: next };
    });
  }

  function clearDecision(taskId) {
    setDecisions((prev) => {
      const { [taskId]: _drop, ...rest } = prev;
      return rest;
    });
  }

  const triageStats = useMemo(() => {
    let done = 0, archive = 0, kept = 0, untouched = 0;
    for (const t of tasks) {
      const d = decisions[t.id];
      if (!d) untouched += 1;
      else if (d.action === "done") done += 1;
      else if (d.action === "archive") archive += 1;
      else if (d.action === "keep") kept += 1;
    }
    return { done, archive, kept, untouched };
  }, [tasks, decisions]);

  async function handleApply() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const decisionsArr = Object.entries(decisions).map(([task_id, d]) => ({
        task_id,
        action: d.action,
        phase: d.action === "keep" ? d.phase || null : undefined,
      }));
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch("/api/reorient/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          category_id: categoryId,
          mantra,
          narrative,
          knowledge_base: kb,
          resources,
          mode,
          drive_folder_url: driveFolderUrl,
          decisions: decisionsArr,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `apply failed (${res.status})`);
      }
      const result = await res.json();
      onComplete?.({ result, advanceTarget });
    } catch (err) {
      setError(err.message || "Apply failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="rw-loading">Loading project…</div>;
  }
  if (error && !project) {
    return <div className="rw-error">{error}</div>;
  }

  const daysSinceLast = lastReorientAt
    ? Math.floor((Date.now() - new Date(lastReorientAt).getTime()) / 86400000)
    : null;

  return (
    <div className="rw">
      <div className="rw-head">
        <div className="rw-eyebrow">Reorient · {project?.name}</div>
        <h1 className="rw-title">
          {step === 0 && "Is this still what this project is for?"}
          {step === 1 && "Triage every open task."}
          {step === 2 && "Anything new I should know?"}
          {step === 3 && "Commit the pass."}
        </h1>
        <p className="rw-sub">
          {daysSinceLast == null
            ? "Never reoriented before."
            : daysSinceLast === 0
              ? "Last reoriented today."
              : `Last reoriented ${daysSinceLast} day${daysSinceLast === 1 ? "" : "s"} ago.`}
        </p>
        <div className="rw-stepbar">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={"rw-stepchip" + (i === step ? " active" : i < step ? " done" : "")}
            >
              <span className="rw-stepchip-num">{s.num}</span>
              <span className="rw-stepchip-label">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {error && <div className="rw-error">{error}</div>}

      <div className="rw-body">
        {step === 0 && (
          <StatusStep
            mantra={mantra}
            setMantra={setMantra}
            narrative={narrative}
            setNarrative={setNarrative}
          />
        )}
        {step === 1 && (
          <TriageStep
            tasks={tasks}
            decisions={decisions}
            setDecision={setDecision}
            clearDecision={clearDecision}
            stats={triageStats}
          />
        )}
        {step === 2 && (
          <KnowledgeStep
            kb={kb}
            setKb={setKb}
            resources={resources}
            setResources={setResources}
            newResource={newResource}
            setNewResource={setNewResource}
            driveFolderUrl={driveFolderUrl}
            setDriveFolderUrl={setDriveFolderUrl}
          />
        )}
        {step === 3 && (
          <CommitStep
            project={project}
            mode={mode}
            setMode={setMode}
            stats={triageStats}
            advanceTarget={advanceTarget}
            setAdvanceTarget={setAdvanceTarget}
          />
        )}
      </div>

      <div className="rw-nav">
        <div className="rw-nav-left">
          <button
            className="ps-btn"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            ← Back
          </button>
          {step < STEPS.length - 1 && (
            <button className="ps-btn" onClick={() => setStep((s) => s + 1)}>
              Next →
            </button>
          )}
        </div>
        <div className="rw-nav-right">
          {onSkipToNext && step < STEPS.length - 1 && (
            <button className="ps-btn" onClick={onSkipToNext}>
              Skip to next project →
            </button>
          )}
          {step === STEPS.length - 1 && (
            <button
              className="ps-btn ps-btn--primary"
              onClick={handleApply}
              disabled={saving}
            >
              {saving ? "Applying…" : "Apply & " + (advanceTarget === "next" ? "next →" : "done")}
            </button>
          )}
        </div>
      </div>

      <style jsx global>{`
        .rw { max-width: 880px; margin: 0 auto; padding: 24px 4px 80px; }
        .rw-head { margin-bottom: 24px; }
        .rw-eyebrow {
          font-family: var(--ps-mono); font-size: 10px;
          letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--ps-ink-50); margin-bottom: 8px;
        }
        .rw-title {
          font-family: var(--ps-serif); font-size: 30px; font-weight: 400;
          letter-spacing: -0.02em; line-height: 1.1; margin: 0 0 6px;
          color: var(--ps-ink);
        }
        .rw-sub {
          font-size: 13px; color: var(--ps-ink-60); margin: 0 0 18px;
        }
        .rw-stepbar {
          display: flex; gap: 8px; flex-wrap: wrap;
        }
        .rw-stepchip {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 12px; border-radius: 999px;
          border: 1px solid var(--ps-ink-10);
          background: var(--ps-paper-soft);
          opacity: 0.55;
        }
        .rw-stepchip.done { opacity: 0.85; }
        .rw-stepchip.active {
          opacity: 1; background: var(--ps-ink); color: var(--ps-bg);
          border-color: var(--ps-ink);
        }
        .rw-stepchip-num {
          font-family: var(--ps-mono); font-size: 10px; letter-spacing: 0.06em;
        }
        .rw-stepchip-label { font-size: 12px; }
        .rw-loading { padding: 80px; text-align: center; color: var(--ps-ink-60); }
        .rw-error {
          background: var(--ps-clay-soft); color: var(--ps-clay);
          border: 1px solid rgba(184, 92, 62, 0.22);
          padding: 10px 14px; border-radius: 10px;
          font-size: 13px; margin-bottom: 14px;
        }
        .rw-body {
          background: #fff; border: 1px solid var(--ps-ink-10);
          border-radius: 14px; padding: 22px 24px; margin-bottom: 18px;
        }
        .rw-nav {
          display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap;
        }
        .rw-nav-left, .rw-nav-right { display: flex; gap: 8px; }
        .rw-field-label {
          font-family: var(--ps-mono); font-size: 10px;
          letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--ps-ink-50); margin-bottom: 6px;
        }
        .rw-textarea {
          width: 100%; font-family: inherit; font-size: 14px;
          padding: 10px 12px; border-radius: 8px;
          border: 1px solid var(--ps-ink-10); color: var(--ps-ink);
          line-height: 1.45;
        }
        .rw-input {
          width: 100%; font-family: inherit; font-size: 14px;
          padding: 8px 12px; border-radius: 8px;
          border: 1px solid var(--ps-ink-10); color: var(--ps-ink);
        }
        .rw-stats {
          display: flex; gap: 14px; font-family: var(--ps-mono);
          font-size: 11px; letter-spacing: 0.06em; color: var(--ps-ink-60);
          margin-bottom: 12px;
        }
        .rw-stats strong { color: var(--ps-ink); }
        .rw-task-list { display: flex; flex-direction: column; gap: 8px; }
        .rw-task {
          display: grid; grid-template-columns: auto 1fr auto; gap: 10px;
          padding: 10px 12px; border-radius: 10px;
          border: 1px solid var(--ps-ink-08);
          background: var(--ps-paper-soft);
        }
        .rw-task.done-strike .rw-task-title,
        .rw-task.archive-strike .rw-task-title {
          text-decoration: line-through; color: var(--ps-ink-50);
        }
        .rw-task.done-strike { background: rgba(120, 160, 100, 0.06); }
        .rw-task.archive-strike { background: rgba(184, 92, 62, 0.06); }
        .rw-task-actions {
          display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
        }
        .rw-task-actions label {
          font-family: var(--ps-mono); font-size: 10px;
          letter-spacing: 0.06em; color: var(--ps-ink-60);
          display: flex; align-items: center; gap: 3px;
          padding: 4px 8px; border-radius: 999px;
          border: 1px solid var(--ps-ink-10);
          cursor: pointer; user-select: none;
        }
        .rw-task-actions label:hover { border-color: var(--ps-ink-30); }
        .rw-task-actions label.on {
          background: var(--ps-ink); color: var(--ps-bg);
          border-color: var(--ps-ink);
        }
        .rw-task-body { min-width: 0; }
        .rw-task-title {
          font-size: 13px; line-height: 1.4; color: var(--ps-ink);
          margin-bottom: 4px; word-break: break-word;
        }
        .rw-task-meta {
          display: flex; flex-wrap: wrap; gap: 8px; font-family: var(--ps-mono);
          font-size: 10px; letter-spacing: 0.06em; color: var(--ps-ink-50);
        }
        .rw-phase-pills {
          display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px;
        }
        .rw-phase-pill {
          font-family: var(--ps-mono); font-size: 10px;
          padding: 3px 8px; border-radius: 999px;
          border: 1px solid var(--ps-ink-10); cursor: pointer;
          color: var(--ps-ink-60);
        }
        .rw-phase-pill:hover { border-color: var(--ps-ink-30); }
        .rw-phase-pill.on {
          background: var(--ps-accent); color: #fff; border-color: var(--ps-accent);
        }
        .rw-resource-row {
          display: grid; grid-template-columns: 1fr 1fr auto;
          gap: 8px; align-items: center; padding: 8px 10px;
          border: 1px solid var(--ps-ink-08); border-radius: 8px;
          background: var(--ps-paper-soft);
        }
        .rw-resource-list { display: flex; flex-direction: column; gap: 6px; }
        .rw-mode-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 8px;
        }
        .rw-mode-card {
          padding: 12px 14px; border-radius: 10px;
          border: 1px solid var(--ps-ink-10); background: var(--ps-paper-soft);
          cursor: pointer; user-select: none;
        }
        .rw-mode-card:hover { border-color: var(--ps-ink-30); }
        .rw-mode-card.on {
          background: var(--ps-ink); color: var(--ps-bg); border-color: var(--ps-ink);
        }
        .rw-mode-card-label {
          font-size: 13px; font-weight: 500; margin-bottom: 2px;
        }
        .rw-summary {
          display: flex; flex-direction: column; gap: 8px; font-size: 13px;
          color: var(--ps-ink-80);
        }
        .rw-summary strong { color: var(--ps-ink); }
        .rw-advance {
          display: flex; gap: 8px; margin-top: 14px;
        }
        .rw-advance label {
          font-size: 12px; color: var(--ps-ink-60);
          display: flex; align-items: center; gap: 6px; cursor: pointer;
        }
      `}</style>
    </div>
  );
}

// --- step 1 -----------------------------------------------------------------

function StatusStep({ mantra, setMantra, narrative, setNarrative }) {
  return (
    <div>
      <div className="rw-field-label">Mantra — what this project is FOR</div>
      <textarea
        className="rw-textarea"
        rows={2}
        value={mantra}
        onChange={(e) => setMantra(e.target.value)}
        placeholder="One sentence. Concrete and specific."
      />
      <div className="rw-field-label" style={{ marginTop: 18 }}>
        Narrative — context, scope, current state
      </div>
      <textarea
        className="rw-textarea"
        rows={10}
        value={narrative}
        onChange={(e) => setNarrative(e.target.value)}
        placeholder="What's happening, what's the critical path, what's the chain of dependencies?"
      />
    </div>
  );
}

// --- step 2 -----------------------------------------------------------------

function TriageStep({ tasks, decisions, setDecision, clearDecision, stats }) {
  if (tasks.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 30, color: "var(--ps-ink-60)" }}>
        No open tasks in this project.
      </div>
    );
  }
  return (
    <div>
      <div className="rw-stats">
        <span>
          <strong>{stats.done}</strong> done
        </span>
        <span>
          <strong>{stats.archive}</strong> archive
        </span>
        <span>
          <strong>{stats.kept}</strong> kept &amp; phased
        </span>
        <span>
          <strong>{stats.untouched}</strong> untouched
        </span>
      </div>
      <div className="rw-task-list">
        {tasks.map((t) => (
          <TriageRow
            key={t.id}
            task={t}
            decision={decisions[t.id]}
            setDecision={(patch) => setDecision(t.id, patch)}
            clearDecision={() => clearDecision(t.id)}
          />
        ))}
      </div>
    </div>
  );
}

function TriageRow({ task, decision, setDecision, clearDecision }) {
  const action = decision?.action;
  const phase = decision?.phase || null;
  const minutes = Math.round((task.effort_hours || 0) * 60);
  const klass =
    "rw-task" +
    (action === "done" ? " done-strike" : action === "archive" ? " archive-strike" : "");
  return (
    <div className={klass}>
      <div className="rw-task-actions">
        <label className={action === "done" ? "on" : ""}>
          <input
            type="checkbox"
            style={{ display: "none" }}
            checked={action === "done"}
            onChange={(e) => (e.target.checked ? setDecision({ action: "done" }) : clearDecision())}
          />
          ☑ Done
        </label>
        <label className={action === "archive" ? "on" : ""}>
          <input
            type="checkbox"
            style={{ display: "none" }}
            checked={action === "archive"}
            onChange={(e) =>
              e.target.checked ? setDecision({ action: "archive" }) : clearDecision()
            }
          />
          ⌫ Archive
        </label>
      </div>
      <div className="rw-task-body">
        <div className="rw-task-title">{task.title}</div>
        <div className="rw-task-meta">
          {task.priority && <span>{task.priority}</span>}
          {minutes > 0 && <span>{minutes} min</span>}
          {task.due_date && <span>due {task.due_date}</span>}
          {task.phase && <span>was: {task.phase}</span>}
        </div>
        {action !== "done" && action !== "archive" && (
          <div className="rw-phase-pills">
            {REORIENT_PHASES.map((p) => (
              <button
                key={p.value}
                type="button"
                className={"rw-phase-pill" + (phase === p.value ? " on" : "")}
                onClick={() =>
                  setDecision({
                    action: "keep",
                    phase: phase === p.value ? null : p.value,
                  })
                }
                title={p.sub}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div />
    </div>
  );
}

// --- step 3 -----------------------------------------------------------------

function isDriveUrl(url) {
  return /^https?:\/\/(drive|docs)\.google\.com\//i.test(url || "");
}

function KnowledgeStep({
  kb,
  setKb,
  resources,
  setResources,
  newResource,
  setNewResource,
  driveFolderUrl,
  setDriveFolderUrl,
}) {
  function addResource() {
    if (!newResource?.label?.trim()) return;
    const kind = isDriveUrl(newResource.url)
      ? newResource.url.includes("/folders/")
        ? "folder"
        : "document"
      : newResource.kind || "document";
    setResources([
      ...(resources || []),
      { ...newResource, kind, id: `r_${Date.now()}` },
    ]);
    setNewResource(null);
  }
  function removeResource(idx) {
    const next = [...(resources || [])];
    next.splice(idx, 1);
    setResources(next);
  }
  return (
    <div>
      <div className="rw-field-label">Google Drive folder for this project</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 18 }}>
        <input
          className="rw-input"
          type="url"
          placeholder="https://drive.google.com/drive/folders/..."
          value={driveFolderUrl}
          onChange={(e) => setDriveFolderUrl(e.target.value)}
          style={{ flex: 1 }}
        />
        {driveFolderUrl && isDriveUrl(driveFolderUrl) && (
          <a
            href={driveFolderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ps-btn"
            style={{ whiteSpace: "nowrap" }}
          >
            Open ↗
          </a>
        )}
      </div>
      <div className="rw-field-label">Knowledge base — append or refine</div>
      <textarea
        className="rw-textarea"
        rows={10}
        value={kb}
        onChange={(e) => setKb(e.target.value)}
        placeholder="Contacts, reference numbers, decisions, deadlines, lessons learned…"
      />
      <div className="rw-field-label" style={{ marginTop: 18 }}>
        Resources ({(resources || []).length})
      </div>
      <div className="rw-resource-list">
        {(resources || []).map((r, i) => (
          <div className="rw-resource-row" key={r.id || i}>
            <div>
              <div style={{ fontSize: 13, color: "var(--ps-ink)" }}>
                {isDriveUrl(r.url) && (
                  <span style={{ marginRight: 6 }} title="Google Drive">
                    📁
                  </span>
                )}
                {r.label}
              </div>
              {r.notes && (
                <div style={{ fontSize: 11, color: "var(--ps-ink-60)" }}>{r.notes}</div>
              )}
            </div>
            <div style={{ fontSize: 12, color: "var(--ps-ink-60)", wordBreak: "break-all" }}>
              {r.url ? (
                <a href={r.url} target="_blank" rel="noopener noreferrer">
                  {r.url}
                </a>
              ) : (
                "—"
              )}
            </div>
            <button
              type="button"
              className="ps-btn"
              onClick={() => removeResource(i)}
              aria-label="Remove resource"
            >
              ×
            </button>
          </div>
        ))}
        {newResource ? (
          <div className="rw-resource-row">
            <input
              className="rw-input"
              placeholder="Label"
              value={newResource.label}
              onChange={(e) => setNewResource({ ...newResource, label: e.target.value })}
              autoFocus
            />
            <input
              className="rw-input"
              placeholder="URL (optional)"
              value={newResource.url}
              onChange={(e) => setNewResource({ ...newResource, url: e.target.value })}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button className="ps-btn ps-btn--primary" onClick={addResource}>
                Add
              </button>
              <button className="ps-btn" onClick={() => setNewResource(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="ps-btn"
            onClick={() => setNewResource({ label: "", url: "", notes: "" })}
          >
            + Add resource
          </button>
        )}
      </div>
    </div>
  );
}

// --- step 4 -----------------------------------------------------------------

function CommitStep({ project, mode, setMode, stats, advanceTarget, setAdvanceTarget }) {
  return (
    <div className="rw-summary">
      <div>
        Reorient pass for <strong>{project?.name}</strong>:
      </div>
      <div>
        <strong>{stats.done}</strong> tasks → done ·{" "}
        <strong>{stats.archive}</strong> → archive ·{" "}
        <strong>{stats.kept}</strong> kept &amp; phased ·{" "}
        <strong>{stats.untouched}</strong> untouched.
      </div>
      <div className="rw-field-label" style={{ marginTop: 14 }}>
        Project mode (optional)
      </div>
      <div className="rw-mode-grid">
        {REORIENT_MODES.map((m) => (
          <button
            type="button"
            key={m.value}
            className={"rw-mode-card" + (mode === m.value ? " on" : "")}
            onClick={() => setMode(mode === m.value ? null : m.value)}
          >
            <div className="rw-mode-card-label">{m.label}</div>
          </button>
        ))}
      </div>
      <div className="rw-advance">
        <label>
          <input
            type="radio"
            name="advance"
            checked={advanceTarget === "next"}
            onChange={() => setAdvanceTarget("next")}
          />
          Apply & advance to next project in queue
        </label>
        <label>
          <input
            type="radio"
            name="advance"
            checked={advanceTarget === "today"}
            onChange={() => setAdvanceTarget("today")}
          />
          Apply & return to Today
        </label>
      </div>
    </div>
  );
}
