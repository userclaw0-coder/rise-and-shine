// ProjectPartsPanel — physical hardware inventory for a project.
//
// Read + edit surface only. Adding parts is done via Jarvis (in-app chat or
// MCP from Claude Code), not via this panel. The panel lets the user:
//   - browse parts grouped by status
//   - filter by status / workstream / location
//   - click a part to see + edit spec/notes
//   - mark a part installed (or update any field)
//   - delete a part
//
// Props:
//   categoryId   string (required)
//   supabase     Supabase client (for session token)

import { useEffect, useMemo, useState } from "react";

const STATUS_OPTIONS = [
  "on_hand",
  "installed",
  "ordered",
  "planned",
  "missing",
  "retired",
];
const STATUS_LABELS = {
  on_hand: "On hand",
  installed: "Installed",
  ordered: "Ordered",
  planned: "Planned",
  missing: "Missing",
  retired: "Retired",
};
const STATUS_ORDER = {
  on_hand: 0,
  ordered: 1,
  planned: 2,
  missing: 3,
  installed: 4,
  retired: 5,
};

async function authedFetch(supabase, url, init = {}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
}

function specPreview(spec) {
  if (!spec || typeof spec !== "object") return "";
  const entries = Object.entries(spec).slice(0, 3);
  if (entries.length === 0) return "";
  return entries.map(([k, v]) => `${k}: ${v}`).join(" · ");
}

export default function ProjectPartsPanel({ categoryId, supabase }) {
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterWorkstream, setFilterWorkstream] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [query, setQuery] = useState("");

  // Detail editor
  const [editingId, setEditingId] = useState(null);

  async function load() {
    if (!categoryId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ category_id: categoryId });
      const res = await authedFetch(supabase, `/api/parts?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setParts(data.parts || []);
    } catch (e) {
      setError(e.message || "Failed to load parts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  const workstreams = useMemo(
    () => Array.from(new Set(parts.map((p) => p.workstream).filter(Boolean))).sort(),
    [parts]
  );
  const locations = useMemo(
    () => Array.from(new Set(parts.map((p) => p.location).filter(Boolean))).sort(),
    [parts]
  );

  const filtered = useMemo(() => {
    return parts.filter((p) => {
      if (filterStatus && p.status !== filterStatus) return false;
      if (filterWorkstream && p.workstream !== filterWorkstream) return false;
      if (filterLocation && p.location !== filterLocation) return false;
      if (query) {
        const q = query.toLowerCase();
        const hay = [p.name, p.part_number, p.manufacturer, p.notes]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [parts, filterStatus, filterWorkstream, filterLocation, query]);

  const groups = useMemo(() => {
    const byStatus = {};
    for (const p of filtered) {
      const key = p.status || "on_hand";
      (byStatus[key] = byStatus[key] || []).push(p);
    }
    return Object.entries(byStatus)
      .sort(
        (a, b) =>
          (STATUS_ORDER[a[0]] ?? 99) - (STATUS_ORDER[b[0]] ?? 99)
      )
      .map(([status, items]) => ({ status, items }));
  }, [filtered]);

  const counts = useMemo(() => {
    const c = { total: parts.length };
    for (const s of STATUS_OPTIONS) c[s] = parts.filter((p) => p.status === s).length;
    return c;
  }, [parts]);

  const hasAnyFilter = !!(filterStatus || filterWorkstream || filterLocation || query);

  function clearFilters() {
    setFilterStatus("");
    setFilterWorkstream("");
    setFilterLocation("");
    setQuery("");
  }

  async function updatePart(id, patch) {
    const res = await authedFetch(supabase, `/api/parts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    setParts((prev) => prev.map((p) => (p.id === id ? data.part : p)));
    return data.part;
  }

  async function deletePart(id) {
    if (!confirm("Delete this part? This cannot be undone.")) return;
    const res = await authedFetch(supabase, `/api/parts/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error || `HTTP ${res.status}`);
      return;
    }
    setParts((prev) => prev.filter((p) => p.id !== id));
    setEditingId(null);
  }

  async function markInstalled(id) {
    try {
      await updatePart(id, {
        status: "installed",
        installed_at: new Date().toISOString(),
      });
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="pj-parts-wrap">
      <div className="pj-parts-head">
        <button
          type="button"
          className="pj-parts-toggle"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
        >
          <span className="pj-parts-chev">{collapsed ? "▸" : "▾"}</span>
          <span className="ps-section-title" style={{ margin: 0 }}>
            Parts inventory
          </span>
          <span className="pj-parts-count">{counts.total}</span>
        </button>
        {!collapsed && counts.total > 0 && (
          <div className="pj-parts-summary">
            {counts.on_hand > 0 && (
              <span className="pj-parts-stat pj-parts-stat--onhand">
                {counts.on_hand} on hand
              </span>
            )}
            {counts.installed > 0 && (
              <span className="pj-parts-stat pj-parts-stat--installed">
                {counts.installed} installed
              </span>
            )}
            {counts.ordered > 0 && (
              <span className="pj-parts-stat pj-parts-stat--ordered">
                {counts.ordered} ordered
              </span>
            )}
            {counts.planned > 0 && (
              <span className="pj-parts-stat">{counts.planned} planned</span>
            )}
            {counts.missing > 0 && (
              <span className="pj-parts-stat pj-parts-stat--missing">
                {counts.missing} missing
              </span>
            )}
          </div>
        )}
      </div>

      {!collapsed && (
        <>
          <div className="pj-parts-help">
            Log new parts by chatting with Jarvis (or via Claude Code MCP) —
            this panel is the read & edit surface.
          </div>

          {(counts.total > 0 || hasAnyFilter) && (
            <div className="pj-parts-filters">
              <input
                className="pj-parts-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, P/N, notes…"
              />
              <select
                className="pj-parts-filter"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              {workstreams.length > 0 && (
                <select
                  className="pj-parts-filter"
                  value={filterWorkstream}
                  onChange={(e) => setFilterWorkstream(e.target.value)}
                >
                  <option value="">All workstreams</option>
                  {workstreams.map((w) => (
                    <option key={w} value={w}>
                      ws:{w}
                    </option>
                  ))}
                </select>
              )}
              {locations.length > 0 && (
                <select
                  className="pj-parts-filter"
                  value={filterLocation}
                  onChange={(e) => setFilterLocation(e.target.value)}
                >
                  <option value="">All locations</option>
                  {locations.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              )}
              {hasAnyFilter && (
                <button
                  type="button"
                  className="pj-parts-clear"
                  onClick={clearFilters}
                >
                  ✕ Clear
                </button>
              )}
            </div>
          )}

          {error && <div className="pj-parts-error">{error}</div>}
          {loading && <div className="pj-parts-empty">Loading…</div>}
          {!loading && counts.total === 0 && (
            <div className="pj-parts-empty">
              No parts yet. Tell Jarvis about hardware you have on hand and it
              will populate this inventory.
            </div>
          )}
          {!loading && counts.total > 0 && filtered.length === 0 && (
            <div className="pj-parts-empty">No parts match the filters.</div>
          )}

          {groups.map((g) => (
            <div key={g.status} className="pj-parts-group">
              <div className="pj-parts-group-head">
                <span className="pj-parts-group-label">
                  {STATUS_LABELS[g.status] || g.status}
                </span>
                <span className="pj-parts-group-count">{g.items.length}</span>
              </div>
              <div className="pj-parts-grid">
                {g.items.map((p) => (
                  <PartCard
                    key={p.id}
                    part={p}
                    onOpen={() => setEditingId(p.id)}
                    onMarkInstalled={() => markInstalled(p.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {editingId && (
        <PartDetailModal
          part={parts.find((p) => p.id === editingId)}
          onClose={() => setEditingId(null)}
          onSave={async (patch) => {
            try {
              await updatePart(editingId, patch);
              setEditingId(null);
            } catch (e) {
              setError(e.message);
            }
          }}
          onDelete={() => deletePart(editingId)}
        />
      )}

      <style jsx>{`
        .pj-parts-wrap {
          margin: 16px 0;
          border: 1px solid var(--ps-ink-08);
          border-radius: 8px;
          padding: 12px 14px;
          background: var(--ps-paper-soft, #fafafa);
        }
        .pj-parts-head {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .pj-parts-toggle {
          appearance: none;
          background: transparent;
          border: none;
          padding: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          color: inherit;
        }
        .pj-parts-chev {
          color: var(--ps-ink-50);
          font-size: 13px;
        }
        .pj-parts-count {
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-50);
          letter-spacing: 0.08em;
        }
        .pj-parts-summary {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .pj-parts-stat {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 2px 8px;
          border-radius: 4px;
          background: var(--ps-ink-08);
          color: var(--ps-ink-70);
        }
        .pj-parts-stat--onhand {
          background: var(--ps-sage-15, #c2e6c4);
          color: var(--ps-sage-dark, #2a5a30);
        }
        .pj-parts-stat--installed {
          background: var(--ps-accent-15, #cce0ff);
          color: var(--ps-accent-dark, #1a4080);
        }
        .pj-parts-stat--ordered {
          background: var(--ps-clay-15, #ffe2cc);
          color: var(--ps-clay-dark, #8a4520);
        }
        .pj-parts-stat--missing {
          background: var(--ps-clay-15, #ffd2cc);
          color: var(--ps-clay-dark, #8a2520);
        }
        .pj-parts-help {
          font-size: 11px;
          color: var(--ps-ink-50);
          font-style: italic;
          margin: 8px 0 12px;
        }
        .pj-parts-filters {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 10px;
          padding-top: 8px;
          border-top: 1px dashed var(--ps-ink-08);
        }
        .pj-parts-search,
        .pj-parts-filter {
          font-family: inherit;
          font-size: 12px;
          padding: 4px 8px;
          border-radius: 6px;
          border: 1px solid var(--ps-ink-15);
          background: #fff;
          color: var(--ps-ink);
        }
        .pj-parts-search {
          flex: 1;
          min-width: 160px;
        }
        .pj-parts-clear {
          appearance: none;
          background: transparent;
          border: 1px solid var(--ps-ink-15);
          color: var(--ps-ink-60);
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 6px;
          cursor: pointer;
        }
        .pj-parts-clear:hover {
          color: var(--ps-clay);
          border-color: var(--ps-clay);
        }
        .pj-parts-empty,
        .pj-parts-error {
          padding: 12px;
          color: var(--ps-ink-50);
          font-size: 12px;
        }
        .pj-parts-error {
          color: var(--ps-clay);
        }
        .pj-parts-group {
          margin-top: 10px;
        }
        .pj-parts-group-head {
          display: flex;
          align-items: baseline;
          gap: 8px;
          padding: 4px 2px;
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ps-ink-60);
        }
        .pj-parts-group-count {
          color: var(--ps-ink-40);
        }
        .pj-parts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 8px;
        }
      `}</style>
    </div>
  );
}

function PartCard({ part, onOpen, onMarkInstalled }) {
  const preview = specPreview(part.spec);
  return (
    <div className="pc">
      <button type="button" className="pc-body" onClick={onOpen}>
        <div className="pc-name">{part.name}</div>
        <div className="pc-meta">
          {part.qty > 1 && <span className="pc-qty">{part.qty}×</span>}
          {part.part_number && <span className="pc-pn">{part.part_number}</span>}
        </div>
        {preview && <div className="pc-spec">{preview}</div>}
        <div className="pc-tags">
          {part.workstream && <span className="pc-tag">ws:{part.workstream}</span>}
          {part.location && <span className="pc-tag">{part.location}</span>}
        </div>
      </button>
      {part.status !== "installed" && part.status !== "retired" && (
        <button
          type="button"
          className="pc-install"
          onClick={onMarkInstalled}
          title="Mark installed"
        >
          ✓ install
        </button>
      )}

      <style jsx>{`
        .pc {
          position: relative;
          border: 1px solid var(--ps-ink-10);
          border-radius: 8px;
          background: #fff;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .pc-body {
          appearance: none;
          background: transparent;
          border: none;
          padding: 0;
          text-align: left;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 4px;
          color: inherit;
        }
        .pc-name {
          font-weight: 600;
          font-size: 13px;
          line-height: 1.3;
          color: var(--ps-ink);
        }
        .pc-meta {
          display: flex;
          gap: 8px;
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-50);
        }
        .pc-qty {
          color: var(--ps-accent);
        }
        .pc-spec {
          font-size: 11px;
          color: var(--ps-ink-60);
          line-height: 1.3;
        }
        .pc-tags {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }
        .pc-tag {
          font-family: var(--ps-mono);
          font-size: 9px;
          color: var(--ps-ink-50);
          letter-spacing: 0.06em;
          padding: 1px 6px;
          border-radius: 3px;
          background: var(--ps-ink-05, #f0f0f0);
        }
        .pc-install {
          align-self: flex-end;
          appearance: none;
          background: transparent;
          border: 1px solid var(--ps-sage, #6a9a72);
          color: var(--ps-sage, #6a9a72);
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 2px 6px;
          border-radius: 4px;
          cursor: pointer;
        }
        .pc-install:hover {
          background: var(--ps-sage, #6a9a72);
          color: #fff;
        }
      `}</style>
    </div>
  );
}

function PartDetailModal({ part, onClose, onSave, onDelete }) {
  const [name, setName] = useState(part?.name || "");
  const [partNumber, setPartNumber] = useState(part?.part_number || "");
  const [manufacturer, setManufacturer] = useState(part?.manufacturer || "");
  const [qty, setQty] = useState(part?.qty || 1);
  const [status, setStatus] = useState(part?.status || "on_hand");
  const [location, setLocation] = useState(part?.location || "");
  const [workstream, setWorkstream] = useState(part?.workstream || "");
  const [notes, setNotes] = useState(part?.notes || "");
  const [specJson, setSpecJson] = useState(
    JSON.stringify(part?.spec || {}, null, 2)
  );
  const [specError, setSpecError] = useState("");

  if (!part) return null;

  function handleSave() {
    let spec = {};
    try {
      spec = specJson.trim() ? JSON.parse(specJson) : {};
      setSpecError("");
    } catch (e) {
      setSpecError("Invalid JSON in spec");
      return;
    }
    onSave({
      name,
      part_number: partNumber,
      manufacturer,
      qty: Number(qty) || 0,
      status,
      location,
      workstream,
      notes,
      spec,
    });
  }

  return (
    <div className="pm-overlay" onClick={onClose}>
      <div className="pm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pm-head">
          <h3 className="pm-title">Edit part</h3>
          <button type="button" className="pm-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="pm-body">
          <label className="pm-field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="pm-row">
            <label className="pm-field">
              <span>Part number</span>
              <input
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value)}
              />
            </label>
            <label className="pm-field">
              <span>Manufacturer</span>
              <input
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
              />
            </label>
            <label className="pm-field pm-field--narrow">
              <span>Qty</span>
              <input
                type="number"
                min={0}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </label>
          </div>
          <div className="pm-row">
            <label className="pm-field">
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="pm-field">
              <span>Location</span>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="@home / @longterm / @workyard / @boat"
              />
            </label>
            <label className="pm-field">
              <span>Workstream</span>
              <input
                value={workstream}
                onChange={(e) => setWorkstream(e.target.value)}
                placeholder="EL / CH / HU / SY / SR / CO / LR / AI"
              />
            </label>
          </div>
          <label className="pm-field">
            <span>Notes</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <label className="pm-field">
            <span>
              Spec (JSON)
              {specError && (
                <em className="pm-err"> — {specError}</em>
              )}
            </span>
            <textarea
              rows={6}
              value={specJson}
              onChange={(e) => setSpecJson(e.target.value)}
              className="pm-spec"
            />
          </label>
        </div>
        <div className="pm-actions">
          <button type="button" className="pm-delete" onClick={onDelete}>
            Delete
          </button>
          <div className="pm-actions-right">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="pm-save" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .pm-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .pm-modal {
          background: #fff;
          border-radius: 10px;
          max-width: 640px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
        }
        .pm-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          border-bottom: 1px solid var(--ps-ink-08);
        }
        .pm-title {
          margin: 0;
          font-size: 16px;
        }
        .pm-close {
          appearance: none;
          background: transparent;
          border: none;
          font-size: 18px;
          cursor: pointer;
          color: var(--ps-ink-50);
        }
        .pm-body {
          padding: 14px 18px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .pm-row {
          display: grid;
          grid-template-columns: 1fr 1fr 80px;
          gap: 10px;
        }
        .pm-row + .pm-row {
          grid-template-columns: 140px 1fr 1fr;
        }
        .pm-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .pm-field > span {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ps-ink-60);
        }
        .pm-field input,
        .pm-field select,
        .pm-field textarea {
          font: inherit;
          padding: 6px 8px;
          border-radius: 6px;
          border: 1px solid var(--ps-ink-15);
          background: #fff;
          color: var(--ps-ink);
        }
        .pm-spec {
          font-family: var(--ps-mono);
          font-size: 11px;
        }
        .pm-err {
          color: var(--ps-clay);
          font-style: italic;
        }
        .pm-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 18px;
          border-top: 1px solid var(--ps-ink-08);
        }
        .pm-actions-right {
          display: flex;
          gap: 8px;
        }
        .pm-actions button {
          appearance: none;
          background: transparent;
          border: 1px solid var(--ps-ink-15);
          padding: 6px 14px;
          border-radius: 6px;
          font: inherit;
          cursor: pointer;
        }
        .pm-delete {
          color: var(--ps-clay) !important;
          border-color: var(--ps-clay) !important;
        }
        .pm-save {
          background: var(--ps-accent) !important;
          color: #fff !important;
          border-color: var(--ps-accent) !important;
        }
      `}</style>
    </div>
  );
}
