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
const MAX_NEEDS = 3;

export default function ProjectDnaEditor({
  categoryId,
  initialOutcomeIds,
  initialLifeDomains,
  initialPrimaryLifeDomain,
  onSaved,
}) {
  const [desiredOutcomes, setDesiredOutcomes] = useState([]);
  const [outcomeIds, setOutcomeIds] = useState([]);
  const [lifeDomains, setLifeDomains] = useState([]);
  const [proposed, setProposed] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lastSaved, setLastSaved] = useState("");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setOutcomeIds(initialOutcomeIds || []);
    // Hydrate life_domains from the explicit array if present, else
    // fall back to the single primary field so legacy data still works.
    if (
      Array.isArray(initialLifeDomains) &&
      initialLifeDomains.length > 0
    ) {
      setLifeDomains(initialLifeDomains.slice(0, MAX_NEEDS));
    } else if (initialPrimaryLifeDomain) {
      setLifeDomains([initialPrimaryLifeDomain]);
    } else {
      setLifeDomains([]);
    }
    setProposed(null);
    setError("");
  }, [initialOutcomeIds, initialLifeDomains, initialPrimaryLifeDomain]);

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
          current_life_domains: lifeDomains,
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
  }, [categoryId, outcomeIds, lifeDomains, suggesting]);

  async function save() {
    if (!categoryId || saving) return;
    setSaving(true);
    setError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) throw new Error("Not authenticated");

      const capped = lifeDomains.slice(0, MAX_NEEDS);
      const primary = capped[0] || null;

      // 1. Persist project-level DNA as top-level patch keys. The
      //    save API only recognizes flat keys and would silently drop
      //    a nested 'workspace' blob.
      await saveCollaborativeProjectWorkspace(categoryId, {
        outcome_ids: outcomeIds,
        life_domains: capped,
        primary_life_domain: primary,
      });

      // 2. Propagate to every non-archived task under this category.
      const { error: cascadeErr } = await supabase
        .from("tasks")
        .update({
          outcome_ids: outcomeIds,
          life_domains: capped,
          primary_life_domain: primary,
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

  function proposedNeeds() {
    if (!proposed) return [];
    const arr = Array.isArray(proposed.life_domains)
      ? proposed.life_domains
      : proposed.primary_life_domain
      ? [proposed.primary_life_domain]
      : [];
    return arr.slice(0, MAX_NEEDS);
  }

  function applyProposedField(field) {
    if (!proposed) return;
    if (field === "outcomes") setOutcomeIds(proposed.outcome_ids || []);
    if (field === "domain") setLifeDomains(proposedNeeds());
  }

  function applyAllProposed() {
    if (!proposed) return;
    setOutcomeIds(proposed.outcome_ids || []);
    setLifeDomains(proposedNeeds());
  }

  function toggleNeed(key) {
    setLifeDomains((cur) => {
      if (cur.includes(key)) return cur.filter((k) => k !== key);
      if (cur.length >= MAX_NEEDS) return cur; // cap at 3
      return [...cur, key];
    });
  }

  const hasSelection = outcomeIds.length > 0 || lifeDomains.length > 0;
  const summary = (() => {
    const parts = [];
    if (outcomeIds.length > 0) {
      const titles = desiredOutcomes
        .filter((o) => outcomeIds.includes(o.id))
        .map((o) => o.title);
      parts.push(
        `${outcomeIds.length} outcome${outcomeIds.length === 1 ? "" : "s"}` +
          (titles.length > 0 ? `: ${titles.slice(0, 2).join(" · ")}` : "") +
          (titles.length > 2 ? ` +${titles.length - 2}` : "")
      );
    }
    if (lifeDomains.length > 0) {
      parts.push(
        `needs: ${lifeDomains
          .map((k) => HUMAN_NEED_STRATEGY_LABELS[k] || k)
          .join(" · ")}`
      );
    }
    if (parts.length === 0) return "Not set yet — open to assign.";
    return parts.join("  ·  ");
  })();

  return (
    <div className={"pdna" + (expanded ? "" : " pdna--collapsed")}>
      <button
        type="button"
        className="pdna-head pdna-head--button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="pdna-head-body">
          <div className="pdna-cap">
            Project DNA{hasSelection ? "" : " — propagates to every task"}
          </div>
          <div className="pdna-summary">{summary}</div>
        </div>
        <span className="pdna-toggle" aria-hidden>
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {expanded && (
        <>
          <div className="pdna-sub">
            Outcomes this project serves + up to three human needs it feeds.
            Saving cascades to every non-archived task under this project.
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
              <span>
                Human needs{" "}
                <span className="pdna-hint">
                  · pick up to {MAX_NEEDS}
                </span>
              </span>
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
                const on = lifeDomains.includes(key);
                const suggested = proposedNeeds().includes(key);
                const atCap = !on && lifeDomains.length >= MAX_NEEDS;
                return (
                  <button
                    key={key}
                    type="button"
                    className={
                      "pdna-chip" +
                      (on ? " on" : "") +
                      (suggested && !on ? " suggested" : "") +
                      (atCap ? " disabled" : "")
                    }
                    onClick={() => !atCap && toggleNeed(key)}
                    disabled={atCap}
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

          <div className="pdna-actions">
            <button
              type="button"
              className="ps-btn"
              onClick={fetchProposal}
              disabled={suggesting}
            >
              {suggesting ? "Coach thinking…" : "Coach: suggest"}
            </button>
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
                {saving ? "Saving + propagating…" : "Save & propagate"}
              </button>
            </div>
          </div>
        </>
      )}

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
          transition: padding 120ms;
        }
        .pdna--collapsed {
          padding: 10px 14px;
        }
        .pdna-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 14px;
          flex-wrap: wrap;
        }
        .pdna-head--button {
          appearance: none;
          border: none;
          background: transparent;
          width: 100%;
          text-align: left;
          cursor: pointer;
          padding: 0;
          font-family: inherit;
          color: inherit;
        }
        .pdna-head-body {
          flex: 1;
          min-width: 0;
        }
        .pdna-summary {
          font-size: 12.5px;
          color: var(--ps-ink-70);
          line-height: 1.5;
          margin-top: 3px;
        }
        .pdna-toggle {
          font-size: 14px;
          color: var(--ps-ink-50);
          line-height: 1;
          padding: 2px 4px;
        }
        .pdna-head--button:hover .pdna-toggle {
          color: var(--ps-ink);
        }
        .pdna-hint {
          text-transform: none;
          letter-spacing: 0;
          font-size: 10px;
          color: var(--ps-ink-50);
          margin-left: 4px;
        }
        .pdna-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
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
        .pdna-chip.disabled {
          opacity: 0.4;
          cursor: not-allowed;
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
