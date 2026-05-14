// OutcomeISCEditor — per-outcome list of Ideal State Criteria.
// Used on /vision (editable) and /category/[id] (read-only + collapsed).
//
// Props:
//   outcome            { id, title, criteria: [{id, statement, met, met_at}] }
//   readOnly           suppress add / edit / delete affordances (still shows progress)
//   defaultCollapsed   start collapsed; shows progress bar + next unmet ISC only;
//                      user clicks to expand the full criteria list
//   onChange(criteria) called with the full updated criteria array

import { useState } from "react";
import {
  addIscToOutcome,
  setIscMet,
  updateIscStatement,
  removeIsc,
  outcomeProgress,
} from "../lib/iscProgress";

export default function OutcomeISCEditor({
  outcome,
  readOnly = false,
  defaultCollapsed = false,
  onChange,
}) {
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState("");
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const criteria = Array.isArray(outcome?.criteria) ? outcome.criteria : [];
  const prog = outcomeProgress(outcome);
  const nextUnmet = criteria.find((c) => !c.met) || null;
  const showCollapsed = collapsed && criteria.length > 0;

  function mutate(transform) {
    if (readOnly || !onChange) return;
    // We hand off the criteria slice, not the whole outcome.
    const wrapped = transform([{ ...outcome, criteria }])[0];
    onChange(wrapped.criteria || []);
  }

  function handleAdd() {
    if (!draft.trim() || readOnly) return;
    mutate((list) => addIscToOutcome(list, outcome.id, draft));
    setDraft("");
    setDrafting(false);
  }

  return (
    <div className="isc">
      <div className="isc-progress">
        <div className="isc-progress-bar">
          <div
            className="isc-progress-fill"
            style={{ width: prog.percent + "%" }}
          />
        </div>
        <div className="isc-progress-label">
          {prog.total === 0 ? (
            <span className="isc-progress-empty">No criteria yet</span>
          ) : (
            <>
              <strong>{prog.met}</strong> / {prog.total} met
              <span className="isc-progress-pct"> · {prog.percent}%</span>
            </>
          )}
        </div>
        {criteria.length > 0 && (
          <button
            type="button"
            className="isc-collapse-toggle"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            title={collapsed ? "Show all criteria" : "Collapse criteria"}
          >
            {collapsed ? `▸ Show ${criteria.length}` : "▾ Collapse"}
          </button>
        )}
      </div>

      {showCollapsed && (
        <div className="isc-collapsed-summary">
          {nextUnmet ? (
            <>
              <span className="isc-collapsed-cap">Next:</span>
              <span className="isc-collapsed-text">{nextUnmet.statement}</span>
            </>
          ) : (
            <span className="isc-collapsed-done">All {prog.total} criteria met ✓</span>
          )}
        </div>
      )}

      {!collapsed && criteria.length > 0 && (
        <ul className="isc-list">
          {criteria.map((c) => (
            <li key={c.id} className={"isc-item" + (c.met ? " met" : "")}>
              <button
                type="button"
                className="isc-check"
                aria-pressed={c.met}
                aria-label={c.met ? "Mark not met" : "Mark met"}
                disabled={readOnly}
                onClick={() =>
                  mutate((list) => setIscMet(list, outcome.id, c.id, !c.met))
                }
              >
                {c.met ? "✓" : ""}
              </button>
              {readOnly ? (
                <span className="isc-statement">{c.statement}</span>
              ) : (
                <input
                  className="isc-statement-input"
                  value={c.statement}
                  onChange={(e) =>
                    mutate((list) =>
                      updateIscStatement(list, outcome.id, c.id, e.target.value)
                    )
                  }
                  placeholder="Concrete verification item…"
                />
              )}
              {!readOnly && (
                <button
                  type="button"
                  className="isc-remove"
                  aria-label="Remove criterion"
                  onClick={() =>
                    mutate((list) => removeIsc(list, outcome.id, c.id))
                  }
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!collapsed && !readOnly && (
        <div className="isc-add">
          {drafting ? (
            <>
              <input
                className="isc-statement-input isc-statement-input--add"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                  if (e.key === "Escape") {
                    setDrafting(false);
                    setDraft("");
                  }
                }}
                placeholder="e.g., U-BMS programmed and bench-tested"
                autoFocus
              />
              <button type="button" className="ps-btn ps-btn--primary" onClick={handleAdd}>
                Add
              </button>
              <button
                type="button"
                className="ps-btn"
                onClick={() => {
                  setDrafting(false);
                  setDraft("");
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="isc-add-btn"
              onClick={() => setDrafting(true)}
            >
              + Add criterion
            </button>
          )}
        </div>
      )}

      <style jsx>{`
        .isc {
          margin-top: 6px;
        }
        .isc-progress {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }
        .isc-progress-bar {
          flex: 1;
          height: 6px;
          background: var(--ps-ink-08);
          border-radius: 4px;
          overflow: hidden;
        }
        .isc-progress-fill {
          height: 100%;
          background: var(--ps-accent);
          transition: width 240ms ease;
        }
        .isc-progress-label {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          color: var(--ps-ink-60);
          white-space: nowrap;
        }
        .isc-progress-label strong {
          color: var(--ps-ink);
        }
        .isc-progress-pct {
          color: var(--ps-ink-50);
          margin-left: 4px;
        }
        .isc-progress-empty {
          color: var(--ps-ink-40);
          font-style: italic;
          font-family: inherit;
          font-size: 11px;
        }
        .isc-collapse-toggle {
          appearance: none;
          background: transparent;
          border: 1px solid transparent;
          color: var(--ps-ink-50);
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          padding: 2px 8px;
          border-radius: 4px;
          cursor: pointer;
          white-space: nowrap;
        }
        .isc-collapse-toggle:hover {
          color: var(--ps-ink);
          border-color: var(--ps-ink-15);
        }
        .isc-collapsed-summary {
          display: flex;
          gap: 8px;
          align-items: baseline;
          padding: 4px 0 8px 2px;
          font-size: 13px;
          color: var(--ps-ink-80);
        }
        .isc-collapsed-cap {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
          flex-shrink: 0;
        }
        .isc-collapsed-text {
          font-style: italic;
          line-height: 1.4;
        }
        .isc-collapsed-done {
          font-size: 12px;
          color: var(--ps-sage);
          font-family: var(--ps-mono);
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .isc-list {
          list-style: none;
          margin: 0 0 8px;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .isc-item {
          display: grid;
          grid-template-columns: 22px 1fr auto;
          gap: 8px;
          align-items: center;
          padding: 4px 6px 4px 2px;
          border-radius: 6px;
        }
        .isc-item:hover {
          background: var(--ps-paper-soft);
        }
        .isc-item.met .isc-statement,
        .isc-item.met .isc-statement-input {
          color: var(--ps-ink-50);
          text-decoration: line-through;
        }
        .isc-check {
          width: 18px;
          height: 18px;
          border-radius: 4px;
          border: 1.5px solid var(--ps-ink-30);
          background: #fff;
          font-size: 11px;
          line-height: 1;
          color: var(--ps-accent);
          cursor: pointer;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .isc-check[aria-pressed="true"] {
          background: var(--ps-accent);
          border-color: var(--ps-accent);
          color: #fff;
        }
        .isc-check:disabled {
          cursor: default;
          opacity: 0.6;
        }
        .isc-statement {
          font-size: 13px;
          color: var(--ps-ink);
          line-height: 1.4;
        }
        .isc-statement-input {
          font-family: inherit;
          font-size: 13px;
          padding: 4px 6px;
          border-radius: 6px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--ps-ink);
          width: 100%;
        }
        .isc-statement-input:focus,
        .isc-statement-input--add {
          border-color: var(--ps-ink-10);
          background: #fff;
          outline: none;
        }
        .isc-remove {
          appearance: none;
          background: transparent;
          border: none;
          color: var(--ps-ink-40);
          font-size: 16px;
          cursor: pointer;
          padding: 0 4px;
        }
        .isc-remove:hover {
          color: var(--ps-clay);
        }
        .isc-add {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .isc-add-btn {
          appearance: none;
          border: 1px dashed var(--ps-ink-15);
          background: transparent;
          color: var(--ps-ink-60);
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-family: var(--ps-mono);
          letter-spacing: 0.06em;
          cursor: pointer;
        }
        .isc-add-btn:hover {
          border-color: var(--ps-ink-30);
          color: var(--ps-ink);
        }
      `}</style>
    </div>
  );
}
