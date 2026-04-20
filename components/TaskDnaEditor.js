import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import { HUMAN_NEED_STRATEGY_LABELS } from "../lib/humanNeedStrategies";

const TYPE_TAGS = [
  { id: "quick-win", label: "Quick Win" },
  { id: "high-leverage", label: "High Leverage" },
  { id: "progress", label: "Progress" },
  { id: "maintenance", label: "Maintenance" },
];

const EFFORT_BUCKETS = [
  { id: "XS", label: "XS · ≤15m", hours: 0.25 },
  { id: "S", label: "S · 15-30m", hours: 0.5 },
  { id: "M", label: "M · 30-90m", hours: 1.25 },
  { id: "L", label: "L · 90m+", hours: 2.5 },
];

function bucketForHours(h) {
  if (!h || h <= 0) return null;
  if (h <= 0.25) return "XS";
  if (h <= 0.5) return "S";
  if (h <= 1.5) return "M";
  return "L";
}

function tagsToTypeTag(tags) {
  if (!Array.isArray(tags)) return null;
  const names = tags
    .map((t) =>
      typeof t === "string" ? t : t?.tag?.name || t?.name || ""
    )
    .filter(Boolean);
  for (const candidate of ["quick-win", "high-leverage", "progress", "maintenance"]) {
    if (names.includes(candidate)) return candidate;
  }
  return null;
}

export default function TaskDnaEditor({
  task,
  onSaved,
  compact = false,
  projectOutcomes,
  projectLifeDomain,
  projectEditHref,
}) {
  const [typeTag, setTypeTag] = useState(null);
  const [effortBucket, setEffortBucket] = useState(null);
  const [proposed, setProposed] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!task) return;
    setTypeTag(tagsToTypeTag(task.tags));
    setEffortBucket(bucketForHours(task.effort_hours));
    setProposed(null);
    setError("");
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchProposal = useCallback(async () => {
    if (!task?.id || suggesting) return;
    setSuggesting(true);
    setError("");
    setProposed(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch("/api/coach/task-dna", {
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
      setProposed(data.proposed || null);
    } catch (err) {
      setError(err.message || "Coach unavailable.");
    } finally {
      setSuggesting(false);
    }
  }, [task?.id, suggesting]);

  async function save() {
    if (!task?.id || saving) return;
    setSaving(true);
    setError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) throw new Error("Not authenticated");

      const updates = {};
      const bucket = EFFORT_BUCKETS.find((b) => b.id === effortBucket);
      if (bucket) updates.effort_hours = bucket.hours;

      if (Object.keys(updates).length > 0) {
        const { error: updErr } = await supabase
          .from("tasks")
          .update(updates)
          .eq("id", task.id)
          .eq("user_id", userId);
        if (updErr) throw updErr;
      }

      // Type tag: merge into the type-slot, stripping other type tags.
      const currentTagNames = (task.tags || [])
        .map((t) => (typeof t === "string" ? t : t?.tag?.name || t?.name || ""))
        .filter(Boolean);
      const kept = currentTagNames.filter(
        (t) => !TYPE_TAGS.some((tt) => tt.id === t)
      );
      const nextTagNames = typeTag ? [...kept, typeTag] : kept;

      await supabase
        .from("task_tags")
        .delete()
        .eq("user_id", userId)
        .eq("task_id", task.id);
      if (nextTagNames.length > 0) {
        const tagIds = [];
        for (const name of nextTagNames) {
          const { data: existing } = await supabase
            .from("tags")
            .select("id")
            .eq("user_id", userId)
            .ilike("name", name)
            .limit(1)
            .maybeSingle();
          if (existing?.id) {
            tagIds.push(existing.id);
            continue;
          }
          const { data: created } = await supabase
            .from("tags")
            .insert({ user_id: userId, name })
            .select("id")
            .single();
          if (created?.id) tagIds.push(created.id);
        }
        if (tagIds.length > 0) {
          await supabase
            .from("task_tags")
            .insert(
              tagIds.map((tid) => ({
                user_id: userId,
                task_id: task.id,
                tag_id: tid,
              }))
            );
        }
      }

      await supabase.from("task_events").insert({
        user_id: userId,
        task_id: task.id,
        event_type: "updated",
        value: {
          source: "dna_editor",
          type_tag: typeTag,
          effort_bucket: effortBucket,
        },
      });

      onSaved?.();
    } catch (err) {
      setError(err.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  function applyProposedField(field) {
    if (!proposed) return;
    if (field === "type") setTypeTag(proposed.type_tag || null);
    if (field === "effort") setEffortBucket(proposed.effort_bucket || null);
  }

  function applyAllProposed() {
    if (!proposed) return;
    setTypeTag(proposed.type_tag || null);
    setEffortBucket(proposed.effort_bucket || null);
  }

  return (
    <div className={"dna-editor" + (compact ? " dna-editor--compact" : "")}>
      <div className="dna-head">
        <div className="dna-cap">Task DNA</div>
        <button
          type="button"
          className="ps-btn"
          onClick={fetchProposal}
          disabled={suggesting}
        >
          {suggesting ? "Coach thinking…" : "Coach: suggest"}
        </button>
      </div>

      {error && <div className="today-error">{error}</div>}

      <div className="dna-inherit">
        <div className="dna-inherit-cap">Inherited from project</div>
        <div className="dna-inherit-rows">
          <div className="dna-inherit-row">
            <span className="dna-inherit-label">Outcomes</span>
            <span className="dna-inherit-value">
              {Array.isArray(projectOutcomes) && projectOutcomes.length > 0
                ? projectOutcomes.map((o) => o.title).join(" · ")
                : "— none set on project"}
            </span>
          </div>
          <div className="dna-inherit-row">
            <span className="dna-inherit-label">Human need</span>
            <span className="dna-inherit-value">
              {projectLifeDomain
                ? HUMAN_NEED_STRATEGY_LABELS[projectLifeDomain] || projectLifeDomain
                : "— none set on project"}
            </span>
          </div>
        </div>
        {projectEditHref && (
          <Link href={projectEditHref} className="dna-inherit-edit">
            Edit on project →
          </Link>
        )}
      </div>

      <div className="dna-field-row">
        <div className="dna-field dna-field--half">
          <div className="dna-label">
            Type
            {proposed && (
              <button
                type="button"
                className="dna-apply"
                onClick={() => applyProposedField("type")}
              >
                use coach
              </button>
            )}
          </div>
          <div className="dna-chips">
            {TYPE_TAGS.map((t) => {
              const on = typeTag === t.id;
              const suggested = proposed?.type_tag === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={
                    "dna-chip" +
                    (on ? " on" : "") +
                    (suggested && !on ? " suggested" : "")
                  }
                  onClick={() =>
                    setTypeTag((cur) => (cur === t.id ? null : t.id))
                  }
                >
                  {on ? "✓ " : suggested ? "+ " : ""}
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="dna-field dna-field--half">
          <div className="dna-label">
            Size
            {proposed && (
              <button
                type="button"
                className="dna-apply"
                onClick={() => applyProposedField("effort")}
              >
                use coach
              </button>
            )}
          </div>
          <div className="dna-chips">
            {EFFORT_BUCKETS.map((b) => {
              const on = effortBucket === b.id;
              const suggested = proposed?.effort_bucket === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  className={
                    "dna-chip" +
                    (on ? " on" : "") +
                    (suggested && !on ? " suggested" : "")
                  }
                  onClick={() =>
                    setEffortBucket((cur) => (cur === b.id ? null : b.id))
                  }
                >
                  {on ? "✓ " : suggested ? "+ " : ""}
                  {b.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {proposed && (
        <div className="dna-proposal">
          <div className="dna-proposal-head">
            <span className="dna-proposal-cap">Coach rationale</span>
            <button
              type="button"
              className="ps-btn ps-btn--primary"
              onClick={applyAllProposed}
            >
              Accept all
            </button>
          </div>
          {proposed.rationale && (
            <div className="dna-proposal-reason">{proposed.rationale}</div>
          )}
        </div>
      )}

      <div className="dna-save">
        <button
          type="button"
          className="ps-btn ps-btn--primary"
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save DNA"}
        </button>
      </div>

      <style jsx global>{`
        .dna-editor {
          margin-top: 14px;
          padding: 14px 16px;
          background: var(--ps-paper);
          border: 1px solid var(--ps-ink-10);
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .dna-editor--compact { padding: 10px 12px; gap: 8px; }
        .dna-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }
        .dna-cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
        }
        .dna-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .dna-inherit {
          padding: 10px 12px;
          background: #fff;
          border: 1px dashed var(--ps-ink-10);
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .dna-inherit-cap {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
        }
        .dna-inherit-rows {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .dna-inherit-row {
          display: grid;
          grid-template-columns: 80px 1fr;
          gap: 8px;
          font-size: 12px;
          line-height: 1.4;
        }
        .dna-inherit-label {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
        }
        .dna-inherit-value {
          color: var(--ps-ink-80);
        }
        .dna-inherit-edit {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--ps-accent);
          text-decoration: none;
          align-self: flex-start;
        }
        .dna-inherit-edit:hover {
          text-decoration: underline;
        }
        .dna-field-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .dna-label {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-ink-60);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 6px;
        }
        .dna-apply {
          appearance: none;
          border: none;
          background: transparent;
          color: var(--ps-accent);
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          padding: 0 4px;
        }
        .dna-apply:hover {
          text-decoration: underline;
        }
        .dna-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .dna-chip {
          appearance: none;
          border: 1px solid var(--ps-ink-10);
          background: #fff;
          padding: 4px 10px;
          border-radius: 999px;
          font-family: inherit;
          font-size: 12px;
          color: var(--ps-ink-70);
          cursor: pointer;
          transition: border-color 120ms, color 120ms, background 120ms;
        }
        .dna-chip:hover {
          border-color: var(--ps-ink-30);
          color: var(--ps-ink);
        }
        .dna-chip.on {
          background: var(--ps-ink);
          color: var(--ps-bg);
          border-color: var(--ps-ink);
        }
        .dna-chip.suggested {
          border-color: var(--ps-accent);
          color: var(--ps-accent);
          background: var(--ps-accent-soft);
          border-style: dashed;
        }
        .dna-empty {
          font-size: 12px;
          color: var(--ps-ink-50);
          font-style: italic;
        }
        .dna-proposal {
          background: var(--ps-accent-soft);
          border: 1px solid rgba(185, 115, 22, 0.22);
          border-radius: 8px;
          padding: 10px 12px;
        }
        .dna-proposal-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          margin-bottom: 4px;
        }
        .dna-proposal-cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ps-accent);
        }
        .dna-proposal-reason {
          font-size: 12px;
          color: var(--ps-ink-80);
          line-height: 1.5;
        }
        .dna-save {
          display: flex;
          justify-content: flex-end;
        }
        @media (max-width: 720px) {
          .dna-field-row { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
