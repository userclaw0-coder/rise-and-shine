import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  HUMAN_NEED_STRATEGY_KEYS,
  HUMAN_NEED_STRATEGY_LABELS,
} from "../lib/humanNeedStrategies";
import { saveCollaborativeProjectWorkspace } from "../lib/collaborationClient";

/**
 * Project-level Outcome + Human Need selector. When saved, propagates
 * the choices to every non-archived task under the category so all
 * tasks inherit the project's DNA.
 */
export default function ProjectDnaEditor({
  categoryId,
  initialOutcomeIds,
  initialPrimaryLifeDomain,
  workspace,
  resources,
  onSaved,
}) {
  const [desiredOutcomes, setDesiredOutcomes] = useState([]);
  const [outcomeIds, setOutcomeIds] = useState([]);
  const [primaryLifeDomain, setPrimaryLifeDomain] = useState(null);
  const [proposed, setProposed] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lastSaved, setLastSaved] = useState("");

  useEffect(() => {
    setOutcomeIds(initialOutcomeIds || []);
    setPrimaryLifeDomain(initialPrimaryLifeDomain || null);
    setProposed(null);
    setError("");
  }, [initialOutcomeIds, initialPrimaryLifeDomain]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id;
        if (!userId) return;
        const { data } = await supabase
          .from("user_profile")
          .select("profile")
          .eq("user_id", userId)
          .maybeSingle();
        if (cancelled) return;
        setDesiredOutcomes(
          (data?.profile?.desired_outcomes || []).map((o) => ({
            id: o.id,
            title: o.title,
          }))
        );
      } catch {
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleOutcome = (id) =>
    setOutcomeIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );

  const fetchProposal = useCallback(async () => {
    if (!categoryId || suggesting) return;
    setSuggesting(true);
    setError("");
    setProposed(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch("/api/coach/project-dna", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          category_id: categoryId,
          current_outcome_ids: outcomeIds,
          current_primary_life_domain: primaryLifeDomain,
        }),
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
  }, [categoryId, outcomeIds, primaryLifeDomain, suggesting]);

  async function save() {
    if (!categoryId || saving) return;
    setSaving(true);
    setError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) throw new Error("Not authenticated");

      // 1. Persist project-level DNA inside shared_project_workspaces.workspace
      const nextWorkspace = {
        ...(workspace || {}),
        resources: resources || workspace?.resources || [],
        outcome_ids: outcomeIds,
        primary_life_domain: primaryLifeDomain || null,
      };
      await saveCollaborativeProjectWorkspace(categoryId, {
        workspace: nextWorkspace,
      });

      // 2. Propagate to every non-archived task under this category.
      const { error: cascadeErr } = await supabase
        .from("tasks")
        .update({
          outcome_ids: outcomeIds,
          primary_life_domain: primaryLifeDomain || null,
        })
        .eq("user_id", userId)
        .eq("category_id", categoryId)
        .is("archived_at", null);
      if (cascadeErr) throw cascadeErr;

      setLastSaved(
        new Date().toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        })
      );
      onSaved?.();
    } catch (err) {
      setError(err.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  function applyProposedField(field) {
    if (!proposed) return;
    if (field === "outcomes") setOutcomeIds(proposed.outcome_ids || []);
    if (field === "domain")
      setPrimaryLifeDomain(proposed.primary_life_domain || null);
  }

  function applyAllProposed() {
    if (!proposed) return;
    setOutcomeIds(proposed.outcome_ids || []);
    setPrimaryLifeDomain(proposed.primary_life_domain || null);
  }

  return (
    <div className="pdna">
      <div className="pdna-head">
        <div>
          <div className="pdna-cap">Project DNA — propagates to every task</div>
          <div className="pdna-sub">
            Outcomes this project serves + the human need it feeds. Saving
            cascades to every non-archived task under this project.
          </div>
        </div>
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

      <div className="pdna-field">
        <div className="pdna-label">
          Outcomes
          {proposed && (
            <button
              type="button"
              className="pdna-apply"
              onClick={() => applyProposedField("outcomes")}
            >
              use coach
            </button>
          )}
        </div>
        {desiredOutcomes.length === 0 ? (
          <div className="pdna-empty">
            No outcomes defined — add them on the Vision page.
          </div>
        ) : (
          <div className="pdna-chips">
            {desiredOutcomes.map((o) => {
              const on = outcomeIds.includes(o.id);
              const suggested = proposed?.outcome_ids?.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  className={
                    "pdna-chip" +
                    (on ? " on" : "") +
                    (suggested && !on ? " suggested" : "")
                  }
                  onClick={() => toggleOutcome(o.id)}
                >
                  {on ? "✓ " : suggested ? "+ " : ""}
                  {o.title}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="pdna-field">
        <div className="pdna-label">
          Human need
          {proposed && (
            <button
              type="button"
              className="pdna-apply"
              onClick={() => applyProposedField("domain")}
            >
              use coach
            </button>
          )}
        </div>
        <div className="pdna-chips">
          {HUMAN_NEED_STRATEGY_KEYS.map((key) => {
            const on = primaryLifeDomain === key;
            const suggested = proposed?.primary_life_domain === key;
            return (
              <button
                key={key}
                type="button"
                className={
                  "pdna-chip" +
                  (on ? " on" : "") +
                  (suggested && !on ? " suggested" : "")
                }
                onClick={() =>
                  setPrimaryLifeDomain((cur) => (cur === key ? null : key))
                }
              >
                {on ? "✓ " : suggested ? "+ " : ""}
                {HUMAN_NEED_STRATEGY_LABELS[key]}
              </button>
            );
          })}
        </div>
      </div>

      {proposed && (
        <div className="pdna-proposal">
          <div className="pdna-proposal-head">
            <span className="pdna-proposal-cap">Coach rationale</span>
            <button
              type="button"
              className="ps-btn ps-btn--primary"
              onClick={applyAllProposed}
            >
              Accept all
            </button>
          </div>
          {proposed.rationale && (
            <div className="pdna-proposal-reason">{proposed.rationale}</div>
          )}
        </div>
      )}

      <div className="pdna-save">
        {lastSaved && (
          <span className="pdna-saved">Saved at {lastSaved}</span>
        )}
        <button
          type="button"
          className="ps-btn ps-btn--primary"
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving + propagating…" : "Save & propagate to tasks"}
        </button>
      </div>

      <style jsx global>{`
        .pdna {
          margin-top: 14px;
          padding: 16px 18px;
          background: var(--ps-paper-soft);
          border: 1px solid var(--ps-ink-10);
          border-radius: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .pdna-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 14px;
          flex-wrap: wrap;
        }
        .pdna-cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-ink-60);
        }
        .pdna-sub {
          font-size: 12px;
          color: var(--ps-ink-60);
          margin-top: 4px;
          max-width: 540px;
          line-height: 1.5;
        }
        .pdna-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .pdna-label {
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
        .pdna-apply {
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
        .pdna-apply:hover {
          text-decoration: underline;
        }
        .pdna-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }
        .pdna-chip {
          appearance: none;
          border: 1px solid var(--ps-ink-10);
          background: #fff;
          padding: 5px 12px;
          border-radius: 999px;
          font-family: inherit;
          font-size: 12px;
          color: var(--ps-ink-70);
          cursor: pointer;
        }
        .pdna-chip:hover {
          border-color: var(--ps-ink-30);
          color: var(--ps-ink);
        }
        .pdna-chip.on {
          background: var(--ps-ink);
          color: var(--ps-bg);
          border-color: var(--ps-ink);
        }
        .pdna-chip.suggested {
          border-color: var(--ps-accent);
          color: var(--ps-accent);
          background: var(--ps-accent-soft);
          border-style: dashed;
        }
        .pdna-empty {
          font-size: 12px;
          color: var(--ps-ink-50);
          font-style: italic;
        }
        .pdna-proposal {
          background: var(--ps-accent-soft);
          border: 1px solid rgba(185, 115, 22, 0.22);
          border-radius: 8px;
          padding: 10px 12px;
        }
        .pdna-proposal-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          margin-bottom: 4px;
        }
        .pdna-proposal-cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ps-accent);
        }
        .pdna-proposal-reason {
          font-size: 12px;
          color: var(--ps-ink-80);
          line-height: 1.5;
        }
        .pdna-save {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 10px;
        }
        .pdna-saved {
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-sage);
        }
      `}</style>
    </div>
  );
}
