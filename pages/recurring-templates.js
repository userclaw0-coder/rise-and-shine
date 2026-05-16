import { useCallback, useEffect, useMemo, useState } from "react";
import PSShell from "../components/PSShell";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabaseClient";
import {
  listRecurringTemplates,
  createRecurringTemplate,
  archiveRecurringTemplate,
  setRecurringTemplateActive,
  listUsageCounters,
  upsertUsageCounter,
} from "../lib/db";

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const PHASES = [
  "immediate",
  "this_week",
  "next_2w",
  "next_30d",
  "ongoing",
  "blocked",
  "someday",
];

function fmtWhen(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function describeRule(template) {
  if (template.recurrence_type === "interval") {
    return `every ${template.interval_days}d after completion`;
  }
  if (template.recurrence_type === "calendar") {
    const r = template.calendar_rule || {};
    if (r.every === "week") {
      const days = Array.isArray(r.on_dow) ? r.on_dow : [r.on_dow];
      return `weekly: ${days.map((d) => DOW_LABELS[d]).join(", ")}`;
    }
    if (r.every === "month") return `monthly on day ${r.on_day}`;
    if (r.every === "year") return `yearly on ${r.on_month}/${r.on_day}`;
    return "calendar";
  }
  if (template.recurrence_type === "usage") {
    return `every ${template.usage_interval} units of counter usage`;
  }
  return template.recurrence_type;
}

function describeStatus(template) {
  if (template.archived_at) return "archived";
  if (!template.active) return "paused";
  if (template.next_spawn_at) {
    const next = fmtWhen(template.next_spawn_at);
    const due = new Date(template.next_spawn_at) <= new Date();
    return due ? `due now (${next})` : `next ${next}`;
  }
  if (template.recurrence_type === "interval") return "waiting on completion";
  if (template.recurrence_type === "usage") return "waiting on counter";
  return "—";
}

export default function RecurringTemplatesPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [counters, setCounters] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [spawnNote, setSpawnNote] = useState("");

  const triggerSpawn = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch("/api/recurring/spawn-due", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const body = await res.json().catch(() => ({}));
      if (body?.spawned > 0) {
        setSpawnNote(`Spawned ${body.spawned} task${body.spawned === 1 ? "" : "s"} from due templates.`);
      }
    } catch {
      /* fail silently — spawn is best-effort */
    }
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      await triggerSpawn();
      const [tplRes, ctrRes, catRes] = await Promise.all([
        listRecurringTemplates(user.id, { includeArchived: false }),
        listUsageCounters(user.id),
        supabase
          .from("categories")
          .select("id, name")
          .eq("user_id", user.id)
          .order("name", { ascending: true }),
      ]);
      if (tplRes.error) throw new Error(tplRes.error.message);
      if (ctrRes.error) throw new Error(ctrRes.error.message);
      if (catRes.error) throw new Error(catRes.error.message);
      setTemplates(tplRes.data || []);
      setCounters(ctrRes.data || []);
      setCategories(catRes.data || []);
    } catch (err) {
      setError(err.message || "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [user, triggerSpawn]);

  useEffect(() => {
    load();
  }, [load]);

  const handleArchive = async (template) => {
    if (!user) return;
    if (!window.confirm(`Stop "${template.title}" from spawning?`)) return;
    const { error: archErr } = await archiveRecurringTemplate(user.id, template.id);
    if (archErr) {
      setError(archErr.message);
      return;
    }
    setTemplates((list) => list.filter((t) => t.id !== template.id));
  };

  const handleTogglePause = async (template) => {
    if (!user) return;
    const next = !template.active;
    const { data, error: tErr } = await setRecurringTemplateActive(user.id, template.id, next);
    if (tErr) {
      setError(tErr.message);
      return;
    }
    setTemplates((list) =>
      list.map((t) => (t.id === template.id ? { ...t, active: data.active } : t))
    );
  };

  return (
    <PSShell title="Recurring Templates">
      <div style={{ padding: "1.5rem", maxWidth: 920, margin: "0 auto" }}>
        <h1 style={{ marginBottom: "0.25rem" }}>Recurring Templates</h1>
        <p style={{ color: "var(--ps-ink-50)", marginTop: 0 }}>
          Recipes that auto-spawn a task when due. Three modes: <b>interval</b>{" "}
          (N days after completion), <b>calendar</b> (real dates), <b>usage</b>{" "}
          (when a counter advances).
        </p>

        {error && (
          <div style={{ background: "var(--ps-clay)", color: "#fff", padding: "0.5rem 0.75rem", borderRadius: 6, marginBottom: "1rem" }}>
            {error}
          </div>
        )}
        {spawnNote && (
          <div style={{ background: "var(--ps-sage)", color: "#fff", padding: "0.5rem 0.75rem", borderRadius: 6, marginBottom: "1rem" }}>
            {spawnNote}
          </div>
        )}

        {loading ? (
          <p>Loading…</p>
        ) : (
          <>
            <section style={{ marginTop: "2rem" }}>
              <h2>Templates</h2>
              <TemplateForm
                user={user}
                categories={categories}
                counters={counters}
                onCreated={load}
                onError={setError}
              />
              {templates.length === 0 ? (
                <p style={{ color: "var(--ps-ink-50)" }}>
                  No active templates yet. Create one above.
                </p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0 }}>
                  {templates.map((t) => (
                    <li
                      key={t.id}
                      style={{
                        border: "1px solid var(--ps-ink-20)",
                        padding: "0.75rem 1rem",
                        borderRadius: 8,
                        marginBottom: "0.5rem",
                        background: t.active ? "var(--ps-card-bg, #fff)" : "var(--ps-ink-05, #f6f6f6)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600 }}>{t.title}</div>
                          <div style={{ fontSize: "0.85rem", color: "var(--ps-ink-50)", marginTop: 2 }}>
                            {describeRule(t)} · {describeStatus(t)}
                            {t.category?.name ? ` · ${t.category.name}` : ""}
                            {t.phase ? ` · ${t.phase}` : ""}
                            {t.priority ? ` · ${t.priority}` : ""}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button onClick={() => handleTogglePause(t)} className="ps-btn">
                            {t.active ? "Pause" : "Resume"}
                          </button>
                          <button
                            onClick={() => handleArchive(t)}
                            className="ps-btn"
                            style={{ color: "var(--ps-clay)" }}
                          >
                            Archive
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section style={{ marginTop: "2.5rem" }}>
              <h2>Usage Counters</h2>
              <p style={{ color: "var(--ps-ink-50)", marginTop: 0 }}>
                Track miles, engine hours, cycles. Update the value as it changes —
                templates referencing this counter spawn tasks when the value advances by their interval.
              </p>
              <UsageCounterForm user={user} onSaved={load} onError={setError} />
              {counters.length === 0 ? (
                <p style={{ color: "var(--ps-ink-50)" }}>No counters yet.</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0 }}>
                  {counters.map((c) => (
                    <CounterRow key={c.id} counter={c} user={user} onSaved={load} onError={setError} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </PSShell>
  );
}

function TemplateForm({ user, categories, counters, onCreated, onError }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("interval");
  const [intervalDays, setIntervalDays] = useState(30);
  const [calendarKind, setCalendarKind] = useState("month");
  const [onDay, setOnDay] = useState(1);
  const [onMonth, setOnMonth] = useState(1);
  const [onDow, setOnDow] = useState([1]); // Monday
  const [counterId, setCounterId] = useState("");
  const [usageInterval, setUsageInterval] = useState(5000);
  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [phase, setPhase] = useState("immediate");
  const [effort, setEffort] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const calendarRule = useMemo(() => {
    if (calendarKind === "week") return { every: "week", on_dow: onDow };
    if (calendarKind === "month") return { every: "month", on_day: Number(onDay) };
    if (calendarKind === "year") return { every: "year", on_month: Number(onMonth), on_day: Number(onDay) };
    return null;
  }, [calendarKind, onDay, onMonth, onDow]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user || !title.trim() || submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        recurrence_type: type,
        category_id: categoryId || null,
        priority,
        phase,
        effort_hours: effort ? Number(effort) : null,
      };
      if (type === "interval") payload.interval_days = Number(intervalDays);
      if (type === "calendar") payload.calendar_rule = calendarRule;
      if (type === "usage") {
        if (!counterId) {
          onError("Pick a usage counter first.");
          setSubmitting(false);
          return;
        }
        payload.usage_counter_id = counterId;
        payload.usage_interval = Number(usageInterval);
      }
      const { error: cErr } = await createRecurringTemplate(user.id, payload);
      if (cErr) throw new Error(cErr.message);
      setTitle("");
      setEffort("");
      onCreated();
    } catch (err) {
      onError(err.message || "Create failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleDow = (d) => {
    setOnDow((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        border: "1px solid var(--ps-ink-20)",
        padding: "1rem",
        borderRadius: 8,
        marginBottom: "1rem",
        display: "grid",
        gap: "0.5rem",
      }}
    >
      <input
        type="text"
        placeholder="Task title (e.g., 'Oil change')"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        style={{ padding: "0.5rem", fontSize: "1rem" }}
      />
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        {[
          { v: "interval", l: "Interval" },
          { v: "calendar", l: "Calendar" },
          { v: "usage", l: "Usage" },
        ].map((opt) => (
          <label key={opt.v}>
            <input
              type="radio"
              name="rtype"
              value={opt.v}
              checked={type === opt.v}
              onChange={() => setType(opt.v)}
            />{" "}
            {opt.l}
          </label>
        ))}
      </div>

      {type === "interval" && (
        <label>
          Every{" "}
          <input
            type="number"
            min="1"
            value={intervalDays}
            onChange={(e) => setIntervalDays(e.target.value)}
            style={{ width: 80 }}
          />{" "}
          days after completion
        </label>
      )}

      {type === "calendar" && (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <select value={calendarKind} onChange={(e) => setCalendarKind(e.target.value)}>
            <option value="week">Weekly (days of week)</option>
            <option value="month">Monthly (day of month)</option>
            <option value="year">Yearly (specific date)</option>
          </select>
          {calendarKind === "week" && (
            <div style={{ display: "flex", gap: "0.25rem" }}>
              {DOW_LABELS.map((label, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleDow(idx)}
                  style={{
                    padding: "0.25rem 0.5rem",
                    border: "1px solid var(--ps-ink-20)",
                    background: onDow.includes(idx) ? "var(--ps-indigo)" : "transparent",
                    color: onDow.includes(idx) ? "#fff" : "inherit",
                    cursor: "pointer",
                    borderRadius: 4,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {calendarKind === "month" && (
            <label>
              On day{" "}
              <input
                type="number"
                min="1"
                max="31"
                value={onDay}
                onChange={(e) => setOnDay(e.target.value)}
                style={{ width: 60 }}
              />{" "}
              of every month
            </label>
          )}
          {calendarKind === "year" && (
            <label>
              Every year on month{" "}
              <input
                type="number"
                min="1"
                max="12"
                value={onMonth}
                onChange={(e) => setOnMonth(e.target.value)}
                style={{ width: 60 }}
              />{" "}
              day{" "}
              <input
                type="number"
                min="1"
                max="31"
                value={onDay}
                onChange={(e) => setOnDay(e.target.value)}
                style={{ width: 60 }}
              />
            </label>
          )}
        </div>
      )}

      {type === "usage" && (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <select value={counterId} onChange={(e) => setCounterId(e.target.value)}>
            <option value="">— select counter —</option>
            {counters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.asset_label} ({c.unit})
              </option>
            ))}
          </select>
          <label>
            Every{" "}
            <input
              type="number"
              min="1"
              value={usageInterval}
              onChange={(e) => setUsageInterval(e.target.value)}
              style={{ width: 100 }}
            />{" "}
            units
          </label>
        </div>
      )}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">— no category —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={phase} onChange={(e) => setPhase(e.target.value)}>
          {PHASES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          type="number"
          step="0.25"
          placeholder="effort hrs"
          value={effort}
          onChange={(e) => setEffort(e.target.value)}
          style={{ width: 90 }}
        />
      </div>

      <button type="submit" disabled={submitting || !title.trim()} className="ps-btn ps-btn--primary">
        {submitting ? "Adding…" : "Add template"}
      </button>
    </form>
  );
}

function UsageCounterForm({ user, onSaved, onError }) {
  const [label, setLabel] = useState("");
  const [unit, setUnit] = useState("miles");
  const [value, setValue] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user || !label.trim() || submitting) return;
    setSubmitting(true);
    try {
      const { error: uErr } = await upsertUsageCounter(user.id, {
        asset_label: label.trim(),
        unit: unit.trim(),
        current_value: Number(value) || 0,
      });
      if (uErr) throw new Error(uErr.message);
      setLabel("");
      setValue(0);
      onSaved();
    } catch (err) {
      onError(err.message || "Counter save failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        border: "1px solid var(--ps-ink-20)",
        padding: "0.75rem 1rem",
        borderRadius: 8,
        marginBottom: "0.75rem",
        display: "flex",
        gap: "0.5rem",
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <input
        type="text"
        placeholder="Asset label (e.g., Tesla 85D)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        style={{ padding: "0.4rem", minWidth: 200 }}
      />
      <input
        type="text"
        placeholder="unit (miles, hours…)"
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        style={{ padding: "0.4rem", width: 140 }}
      />
      <input
        type="number"
        step="any"
        placeholder="current value"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ padding: "0.4rem", width: 140 }}
      />
      <button type="submit" disabled={submitting || !label.trim()} className="ps-btn">
        {submitting ? "Saving…" : "Add counter"}
      </button>
    </form>
  );
}

function CounterRow({ counter, user, onSaved, onError }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(counter.current_value);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error: upErr } = await supabase
        .from("usage_counters")
        .update({ current_value: Number(val) })
        .eq("id", counter.id)
        .eq("user_id", user.id);
      if (upErr) throw new Error(upErr.message);
      setEditing(false);
      // Page-level load() triggers /api/recurring/spawn-due, which sweeps
      // counter thresholds and spawns any tasks that just came due.
      onSaved();
    } catch (err) {
      onError(err.message || "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <li
      style={{
        border: "1px solid var(--ps-ink-20)",
        padding: "0.6rem 0.9rem",
        borderRadius: 8,
        marginBottom: "0.4rem",
        display: "flex",
        gap: "1rem",
        alignItems: "center",
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{counter.asset_label}</div>
        <div style={{ fontSize: "0.85rem", color: "var(--ps-ink-50)" }}>
          {counter.current_value} {counter.unit}
        </div>
      </div>
      {editing ? (
        <>
          <input
            type="number"
            step="any"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            style={{ width: 140, padding: "0.3rem" }}
          />
          <button onClick={save} disabled={saving} className="ps-btn ps-btn--primary">
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={() => setEditing(false)} className="ps-btn">
            Cancel
          </button>
        </>
      ) : (
        <button onClick={() => setEditing(true)} className="ps-btn">
          Update value
        </button>
      )}
    </li>
  );
}
