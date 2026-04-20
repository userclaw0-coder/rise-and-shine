import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import { getUserProfile, upsertUserProfile } from "../lib/db";
import { supabase } from "../lib/supabaseClient";

const UPGRADE_FRAMEWORKS = [
  { id: "smart", label: "SMART" },
  { id: "woop", label: "WOOP" },
  { id: "identity", label: "Identity" },
  { id: "pre-mortem", label: "Pre-mortem" },
];

const MODES = [
  { id: "immerse", label: "Immerse", sub: "Feel it", icon: "◐" },
  { id: "compose", label: "Compose", sub: "Build the board", icon: "▦" },
  { id: "clarify", label: "Clarify", sub: "Upgrade your goals", icon: "✎" },
  { id: "align", label: "Align", sub: "See the system", icon: "◇" },
];

function normalizeOutcomes(list) {
  return (list || []).map((o, i) => ({
    id: o.id || `vision-${i}`,
    title: typeof o === "string" ? o : o.title || "",
    progress: o.progress ?? null,
  }));
}

function progressRing(pct) {
  const size = 120;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return { size, stroke, r, circ, dash };
}

export default function VisionPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState("align");
  const [profile, setProfile] = useState(null);
  const [identity, setIdentity] = useState("");
  const [outcomes, setOutcomes] = useState("");
  const [leverage, setLeverage] = useState("");
  const [quarterFocus, setQuarterFocus] = useState("");
  const [immediateStep, setImmediateStep] = useState("");
  const [thriveGoals, setThriveGoals] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [boardUrl, setBoardUrl] = useState("");
  const [fieldImages, setFieldImages] = useState({});
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState("");
  const [uploading, setUploading] = useState("");
  const [imIdx, setImIdx] = useState(0);
  const [imPlaying, setImPlaying] = useState(false);
  const [upgradeInput, setUpgradeInput] = useState("");
  const [upgrades, setUpgrades] = useState(null);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeError, setUpgradeError] = useState("");
  const saveTimer = useRef(null);

  useEffect(() => {
    try {
      const m = localStorage.getItem("rs-vision-mode");
      if (m) setMode(m);
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("rs-vision-mode", mode);
    } catch {
      // noop
    }
  }, [mode]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const res = await getUserProfile(user.id);
      if (cancelled) return;
      const p = res?.data?.profile || {};
      setProfile(p);
      setIdentity((p.identity_attributes || []).join(", "));
      setOutcomes(
        (p.desired_outcomes || []).map((o) => o.title || "").filter(Boolean).join("\n")
      );
      setLeverage((p.leverage_focus || []).join("\n"));
      setQuarterFocus((p.quarter_focus || []).join(", "));
      setImmediateStep(p.immediate_step || "");
      setThriveGoals((p.thrive_goals || []).join("\n"));
      setPhotoUrl(p.photo_url || "");
      setBoardUrl(p.vision_board_image_url || "");
      setFieldImages(p.vision_field_images || {});
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const buildProfile = useCallback(() => {
    const identities = identity.split(",").map((s) => s.trim()).filter(Boolean);
    const outList = outcomes
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((title, idx) => ({ id: `vision-${idx}`, title }));
    return {
      ...(profile || {}),
      identity_attributes: identities,
      desired_outcomes: outList,
      leverage_focus: leverage.split("\n").map((s) => s.trim()).filter(Boolean),
      quarter_focus: quarterFocus.split(",").map((s) => s.trim()).filter(Boolean),
      immediate_step: immediateStep || "",
      thrive_goals: thriveGoals.split("\n").map((s) => s.trim()).filter(Boolean),
      photo_url: photoUrl || undefined,
      vision_board_image_url: boardUrl || undefined,
      vision_field_images: fieldImages,
    };
  }, [
    profile,
    identity,
    outcomes,
    leverage,
    quarterFocus,
    immediateStep,
    thriveGoals,
    photoUrl,
    boardUrl,
    fieldImages,
  ]);

  useEffect(() => {
    if (!user || !profile) return;
    clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      const res = await upsertUserProfile(user.id, buildProfile());
      setSaving(false);
      if (!res.error) {
        setLastSaved(
          new Date().toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          })
        );
      }
    }, 900);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    identity,
    outcomes,
    leverage,
    quarterFocus,
    immediateStep,
    thriveGoals,
    photoUrl,
    boardUrl,
    fieldImages,
  ]);

  const outcomeList = useMemo(
    () => normalizeOutcomes((profile?.desired_outcomes || []).length ? profile.desired_outcomes : outcomes.split("\n").map((t, i) => ({ id: `v${i}`, title: t }))),
    [profile, outcomes]
  );
  const thriveList = thriveGoals.split("\n").map((s) => s.trim()).filter(Boolean);
  const leverageList = leverage.split("\n").map((s) => s.trim()).filter(Boolean);
  const quarterList = quarterFocus.split(",").map((s) => s.trim()).filter(Boolean);
  const identityList = identity.split(",").map((s) => s.trim()).filter(Boolean);

  const visionPct = useMemo(() => {
    const total = outcomeList.length + thriveList.length;
    if (total === 0) return 0;
    const scored = outcomeList.reduce(
      (acc, o) => acc + (o.progress != null ? o.progress : 30),
      0
    );
    const thriveAvg = thriveList.length > 0 ? 40 : 0;
    const raw = (scored + thriveAvg) / Math.max(1, total);
    return Math.min(99, Math.round(raw));
  }, [outcomeList, thriveList]);

  const scenes = useMemo(() => {
    const list = [];
    if (identityList.length > 0) {
      list.push({
        tag: "Identity",
        text: `I am ${identityList.join(", ")}.`,
      });
    }
    for (const o of outcomeList.slice(0, 6)) {
      if (o.title) list.push({ tag: "Outcome", text: o.title });
    }
    for (const t of thriveList.slice(0, 4)) {
      list.push({ tag: "Thrive", text: t });
    }
    if (immediateStep) {
      list.push({ tag: "Next step", text: immediateStep });
    }
    if (list.length === 0) {
      list.push({
        tag: "Begin",
        text: "Write your vision in Clarify mode to see it come alive here.",
      });
    }
    return list;
  }, [identityList, outcomeList, thriveList, immediateStep]);

  useEffect(() => {
    if (!imPlaying || mode !== "immerse") return;
    const t = setTimeout(
      () => setImIdx((i) => (i + 1) % Math.max(1, scenes.length)),
      8000
    );
    return () => clearTimeout(t);
  }, [imPlaying, imIdx, scenes.length, mode]);

  async function runUpgrade() {
    if (!user || !upgradeInput.trim() || upgradeLoading) return;
    setUpgradeLoading(true);
    setUpgradeError("");
    setUpgrades(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch("/api/coach/upgrade-goal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ goal: upgradeInput.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed");
      }
      const data = await res.json();
      setUpgrades(data.upgrades || []);
    } catch (err) {
      setUpgradeError(err.message || "Failed to upgrade goal.");
    } finally {
      setUpgradeLoading(false);
    }
  }

  function appendUpgradeToOutcomes(rewrite) {
    const joiner = (existing) =>
      existing?.trim() ? existing + "\n" + rewrite : rewrite;
    setOutcomes(joiner);
  }

  async function handleUpload(key, file) {
    if (!file || !user) return;
    setUploading(key);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${key}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("user-photos")
        .upload(path, file, { upsert: true });
      if (!error) {
        const { data: urlData } = supabase.storage
          .from("user-photos")
          .getPublicUrl(path);
        const url = urlData?.publicUrl || "";
        if (key === "board") setBoardUrl(url);
        else if (key === "photo") setPhotoUrl(url);
        else setFieldImages((fi) => ({ ...fi, [key]: url }));
      }
    } finally {
      setUploading("");
    }
  }

  const ring = progressRing(visionPct);

  if (!user) {
    return (
      <DashboardLayout>
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading…</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Head>
        <title>Vision · Rise &amp; Shine</title>
      </Head>
      <div className={"ps-page" + (mode === "immerse" ? " vis-immerse-shell" : "")}>
        <div
          className="ps-view vis-view"
          style={{
            maxWidth: mode === "immerse" ? "100%" : undefined,
            padding: mode === "immerse" ? 0 : undefined,
          }}
        >
          {mode !== "immerse" && (
            <div className="vis-head">
              <div>
                <div className="ps-eyebrow">Foundations · 02 · Vision &amp; Goals</div>
                <h1 className="ps-title">The life I&apos;m stepping into.</h1>
                <p className="ps-sub">
                  Priming, composing, clarifying, aligning — four ways to work
                  with your vision.
                </p>
              </div>
              <div className="vis-autosave">
                <span className={"wr-save-dot" + (saving ? " saving" : "")} />
                {saving ? "Saving…" : lastSaved ? "Saved " + lastSaved : "Autosave on"}
              </div>
            </div>
          )}

          <div className={"vis-modes" + (mode === "immerse" ? " floating" : "")}>
            {MODES.map((m) => (
              <button
                key={m.id}
                className={"vis-mode" + (mode === m.id ? " active" : "")}
                onClick={() => setMode(m.id)}
              >
                <span className="vis-mode-icon">{m.icon}</span>
                <span>
                  <span className="vis-mode-label">{m.label}</span>
                  <span className="vis-mode-sub">{m.sub}</span>
                </span>
              </button>
            ))}
          </div>

          {mode === "immerse" && (
            <div className="vis-immerse">
              <div className="vis-immerse-scene">
                <div className="vis-immerse-tag">
                  {scenes[imIdx]?.tag} · present moment
                </div>
                <div className="vis-immerse-text">{scenes[imIdx]?.text}</div>
              </div>
              <div className="vis-immerse-controls">
                <button
                  className="vis-im-btn"
                  onClick={() =>
                    setImIdx((i) => (i - 1 + scenes.length) % scenes.length)
                  }
                >
                  ‹
                </button>
                <button
                  className="vis-im-play"
                  onClick={() => setImPlaying((p) => !p)}
                >
                  {imPlaying ? "Pause" : "Begin priming"}
                </button>
                <button
                  className="vis-im-btn"
                  onClick={() =>
                    setImIdx((i) => (i + 1) % scenes.length)
                  }
                >
                  ›
                </button>
                <div className="vis-im-scrubber">
                  {scenes.map((_, i) => (
                    <span key={i} className={i === imIdx ? "on" : ""} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {mode === "compose" && (
            <div className="vis-compose">
              <div className="vis-compose-head">
                <div className="ps-section-title" style={{ margin: 0 }}>
                  The board
                </div>
                <label className="ps-btn ps-btn--primary vis-upload">
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) =>
                      handleUpload("board", e.target.files?.[0])
                    }
                  />
                  {uploading === "board" ? "Uploading…" : "Upload hero image"}
                </label>
              </div>
              {boardUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={boardUrl} alt="Vision board" className="vis-board-hero" />
              ) : (
                <div className="vis-board-empty">
                  Upload a hero image that represents where you&apos;re headed.
                </div>
              )}

              <div className="ps-section-title">Field tiles</div>
              <div className="vis-compose-grid">
                {outcomeList.slice(0, 8).map((o) => {
                  const key = o.id;
                  const img = fieldImages[key];
                  return (
                    <div key={key} className="vis-tile">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt={o.title} />
                      ) : (
                        <div className="vis-tile-empty">+</div>
                      )}
                      <div className="vis-tile-label">{o.title || "(untitled)"}</div>
                      <label className="ps-btn vis-tile-upload">
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(e) =>
                            handleUpload(key, e.target.files?.[0])
                          }
                        />
                        {uploading === key ? "Uploading…" : img ? "Replace" : "Upload"}
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {mode === "clarify" && (
            <div className="vis-clarify">
              <div className="vis-upgrade">
                <div className="vis-upgrade-head">
                  <div>
                    <div className="vis-upgrade-cap">Goal upgrade workshop</div>
                    <div className="vis-upgrade-sub">
                      Drop a fuzzy goal. The coach rewrites it through SMART,
                      WOOP (Oettingen), Identity (Clear), and Pre-mortem
                      (Klein/Kahneman). Append the version you like into your
                      outcomes.
                    </div>
                  </div>
                </div>
                <textarea
                  className="vis-textarea"
                  placeholder="e.g. 'get in shape', 'build a successful business', 'spend more time with family'"
                  value={upgradeInput}
                  onChange={(e) => setUpgradeInput(e.target.value)}
                />
                <div className="vis-upgrade-actions">
                  <button
                    className="ps-btn ps-btn--primary"
                    disabled={!upgradeInput.trim() || upgradeLoading}
                    onClick={runUpgrade}
                  >
                    {upgradeLoading ? "Running frameworks…" : "Upgrade this goal"}
                  </button>
                  {upgrades && (
                    <button
                      className="ps-btn"
                      onClick={() => {
                        setUpgrades(null);
                        setUpgradeInput("");
                        setUpgradeError("");
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                {upgradeError && (
                  <div className="today-error">{upgradeError}</div>
                )}
                {upgrades && upgrades.length > 0 && (
                  <div className="vis-upgrade-grid">
                    {upgrades.map((u, i) => {
                      const meta = UPGRADE_FRAMEWORKS.find((f) => f.id === u.framework) || {
                        label: u.framework,
                      };
                      return (
                        <div key={i} className="vis-upgrade-card">
                          <div className="vis-upgrade-tag">{meta.label}</div>
                          <div className="vis-upgrade-rewrite">{u.rewrite}</div>
                          {u.notes && (
                            <div className="vis-upgrade-notes">{u.notes}</div>
                          )}
                          <button
                            className="ps-btn"
                            onClick={() => appendUpgradeToOutcomes(u.rewrite)}
                          >
                            Append to outcomes ↓
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="vis-field">
                <label className="vis-field-label">Identity attributes</label>
                <div className="vis-field-sub">
                  Comma-separated. &quot;I am ___.&quot;
                </div>
                <input
                  className="vis-input"
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value)}
                  placeholder="calm, disciplined, curious, generous"
                />
              </div>

              <div className="vis-field">
                <label className="vis-field-label">Desired outcomes</label>
                <div className="vis-field-sub">
                  One per line. These become tiles on the board and chips on
                  Today.
                </div>
                <textarea
                  className="vis-textarea"
                  value={outcomes}
                  onChange={(e) => setOutcomes(e.target.value)}
                  placeholder="Ship v1 positioning doc&#10;Lock Q2 rental plan"
                />
              </div>

              <div className="vis-field">
                <label className="vis-field-label">Non-negotiable thrive goals</label>
                <div className="vis-field-sub">
                  One per line. Lived as baseline standards.
                </div>
                <textarea
                  className="vis-textarea"
                  value={thriveGoals}
                  onChange={(e) => setThriveGoals(e.target.value)}
                  placeholder="15% body fat, 1x bench, 2x squat&#10;Business generating $10k/mo&#10;Hawkwood on the water"
                />
              </div>

              <div className="vis-field">
                <label className="vis-field-label">Leverage focus</label>
                <div className="vis-field-sub">
                  One per line. The compounding moves.
                </div>
                <textarea
                  className="vis-textarea"
                  value={leverage}
                  onChange={(e) => setLeverage(e.target.value)}
                />
              </div>

              <div className="vis-field-grid">
                <div className="vis-field">
                  <label className="vis-field-label">Quarter focus</label>
                  <div className="vis-field-sub">Comma-separated.</div>
                  <input
                    className="vis-input"
                    value={quarterFocus}
                    onChange={(e) => setQuarterFocus(e.target.value)}
                  />
                </div>
                <div className="vis-field">
                  <label className="vis-field-label">Immediate step</label>
                  <div className="vis-field-sub">The smallest next move.</div>
                  <input
                    className="vis-input"
                    value={immediateStep}
                    onChange={(e) => setImmediateStep(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {mode === "align" && (
            <div className="vis-align">
              <div className="vis-align-hero">
                <div className="vis-ring">
                  <svg width={ring.size} height={ring.size}>
                    <circle
                      cx={ring.size / 2}
                      cy={ring.size / 2}
                      r={ring.r}
                      fill="none"
                      stroke="var(--ps-ink-10)"
                      strokeWidth={ring.stroke}
                    />
                    <circle
                      cx={ring.size / 2}
                      cy={ring.size / 2}
                      r={ring.r}
                      fill="none"
                      stroke="var(--ps-accent)"
                      strokeWidth={ring.stroke}
                      strokeDasharray={`${ring.dash} ${ring.circ}`}
                      strokeLinecap="round"
                      transform={`rotate(-90 ${ring.size / 2} ${ring.size / 2})`}
                    />
                  </svg>
                  <div className="vis-ring-num">{visionPct}%</div>
                </div>
                <div className="vis-align-hero-body">
                  <div className="ps-eyebrow">Vision alignment</div>
                  <div className="vis-identity">
                    I am {identityList.join(", ") || "— (set in Clarify)"}.
                  </div>
                  {immediateStep && (
                    <div className="vis-immediate">
                      <span className="vis-chip">Next step</span>
                      {immediateStep}
                    </div>
                  )}
                </div>
              </div>

              {thriveList.length > 0 && (
                <div className="vis-block">
                  <div className="ps-section-title">Thrive goals</div>
                  <div className="ps-section-sub">
                    Non-negotiable baselines, all lived at once.
                  </div>
                  {thriveList.map((t, i) => (
                    <div key={i} className="vis-bar-row">
                      <div className="vis-bar-label">{t}</div>
                      <div className="vis-bar">
                        <div
                          className="vis-bar-fill"
                          style={{
                            width: "45%",
                            background: "var(--ps-indigo)",
                          }}
                        />
                      </div>
                      <div className="vis-bar-num">—</div>
                    </div>
                  ))}
                </div>
              )}

              {outcomeList.length > 0 && (
                <div className="vis-block">
                  <div className="ps-section-title">Desired outcomes</div>
                  <div className="vis-outcomes">
                    {outcomeList.map((o) => (
                      <div key={o.id} className="vis-outcome">
                        <div className="vis-outcome-label">{o.title}</div>
                        <div className="vis-outcome-bar">
                          <div
                            className="vis-outcome-fill"
                            style={{
                              width: (o.progress ?? 30) + "%",
                              background: "var(--ps-accent)",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {quarterList.length > 0 && (
                <div className="vis-block">
                  <div className="ps-section-title">This quarter</div>
                  <div className="vis-pills">
                    {quarterList.map((q, i) => (
                      <span key={i} className="vis-pill">
                        {q}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {leverageList.length > 0 && (
                <div className="vis-block">
                  <div className="ps-section-title">Leverage focus</div>
                  <ul className="vis-list">
                    {leverageList.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        .vis-immerse-shell {
          background: #0b0908 !important;
          padding: 0 !important;
          margin: -16px !important;
        }
        .vis-view { min-height: 80vh; }
        .vis-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
          flex-wrap: wrap;
        }
        .vis-autosave {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 6px;
        }
        .vis-modes {
          display: flex;
          gap: 6px;
          padding: 4px;
          background: var(--ps-paper);
          border: 1px solid var(--ps-ink-08);
          border-radius: 10px;
          width: fit-content;
          margin: 20px 0;
          flex-wrap: wrap;
        }
        .vis-modes.floating {
          position: fixed;
          top: 24px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 10;
          background: rgba(30, 27, 22, 0.8);
          border-color: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
        }
        .vis-modes.floating .vis-mode {
          color: rgba(255, 255, 255, 0.7);
        }
        .vis-modes.floating .vis-mode.active {
          background: var(--ps-bg);
          color: var(--ps-ink);
        }
        .vis-mode {
          appearance: none;
          border: none;
          background: transparent;
          padding: 8px 14px;
          border-radius: 7px;
          font-family: var(--ps-mono);
          font-size: 11px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--ps-ink-60);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .vis-mode:hover { color: var(--ps-ink); }
        .vis-mode.active { background: var(--ps-ink); color: var(--ps-bg); }
        .vis-mode-icon { font-size: 14px; line-height: 1; }
        .vis-mode-label { display: block; font-weight: 500; }
        .vis-mode-sub { display: block; font-size: 9px; opacity: 0.7; font-weight: 400; margin-top: 1px; }
        .vis-immerse {
          min-height: 80vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 80px 40px;
          color: #fff;
          gap: 48px;
          background:
            radial-gradient(1200px 600px at 50% 50%, rgba(185, 115, 22, 0.08), transparent 60%),
            #0b0908;
        }
        .vis-immerse-scene {
          max-width: 720px;
          text-align: center;
        }
        .vis-immerse-tag {
          font-family: var(--ps-mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.4);
          margin-bottom: 20px;
        }
        .vis-immerse-text {
          font-family: var(--ps-serif);
          font-size: 36px;
          line-height: 1.3;
          letter-spacing: -0.015em;
          font-style: italic;
          color: rgba(255, 255, 255, 0.92);
        }
        .vis-immerse-controls {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .vis-im-btn, .vis-im-play {
          appearance: none;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: transparent;
          color: rgba(255, 255, 255, 0.85);
          padding: 10px 14px;
          border-radius: 999px;
          font-family: var(--ps-mono);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .vis-im-play { padding: 10px 20px; }
        .vis-im-btn:hover, .vis-im-play:hover { background: rgba(255, 255, 255, 0.08); }
        .vis-im-scrubber { display: flex; gap: 4px; margin-left: 8px; }
        .vis-im-scrubber span {
          width: 10px;
          height: 3px;
          border-radius: 2px;
          background: rgba(255, 255, 255, 0.2);
          transition: background 200ms;
        }
        .vis-im-scrubber span.on { background: var(--ps-accent); }

        .vis-compose {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .vis-compose-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        .vis-upload {
          cursor: pointer;
        }
        .vis-board-hero {
          width: 100%;
          max-height: 420px;
          object-fit: cover;
          border-radius: 14px;
          border: 1px solid var(--ps-ink-10);
        }
        .vis-board-empty {
          background: var(--ps-paper);
          border: 1px dashed var(--ps-ink-15);
          border-radius: 14px;
          padding: 60px 30px;
          text-align: center;
          color: var(--ps-ink-60);
          font-size: 13px;
        }
        .vis-compose-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        .vis-tile {
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 12px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .vis-tile img {
          width: 100%;
          height: 120px;
          object-fit: cover;
          border-radius: 8px;
        }
        .vis-tile-empty {
          height: 120px;
          border-radius: 8px;
          background: var(--ps-paper);
          border: 1px dashed var(--ps-ink-15);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--ps-serif);
          font-size: 28px;
          color: var(--ps-ink-30);
        }
        .vis-tile-label {
          font-size: 12px;
          color: var(--ps-ink-70);
          line-height: 1.35;
          min-height: 32px;
        }
        .vis-tile-upload {
          align-self: stretch;
          text-align: center;
          cursor: pointer;
        }

        .vis-clarify {
          display: flex;
          flex-direction: column;
          gap: 16px;
          max-width: 780px;
        }
        .vis-upgrade {
          background: var(--ps-accent-soft);
          border: 1px solid rgba(185, 115, 22, 0.25);
          border-radius: 14px;
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .vis-upgrade-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }
        .vis-upgrade-cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-accent);
        }
        .vis-upgrade-sub {
          font-size: 12.5px;
          color: var(--ps-ink-70);
          margin-top: 4px;
          line-height: 1.5;
          max-width: 600px;
        }
        .vis-upgrade-actions {
          display: flex;
          gap: 8px;
        }
        .vis-upgrade-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .vis-upgrade-card {
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 10px;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .vis-upgrade-tag {
          align-self: flex-start;
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-accent);
          background: var(--ps-accent-soft);
          padding: 2px 8px;
          border-radius: 4px;
        }
        .vis-upgrade-rewrite {
          font-family: var(--ps-serif);
          font-size: 15px;
          letter-spacing: -0.01em;
          line-height: 1.4;
          color: var(--ps-ink);
        }
        .vis-upgrade-notes {
          font-size: 11.5px;
          color: var(--ps-ink-60);
          line-height: 1.5;
        }
        @media (max-width: 700px) {
          .vis-upgrade-grid { grid-template-columns: 1fr; }
        }
        .vis-field {
          background: #fff;
          border: 1px solid var(--ps-ink-08);
          border-radius: 12px;
          padding: 14px 16px;
        }
        .vis-field-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .vis-field-label {
          font-family: var(--ps-serif);
          font-size: 17px;
          letter-spacing: -0.01em;
        }
        .vis-field-sub {
          font-size: 12px;
          color: var(--ps-ink-60);
          margin: 2px 0 10px;
        }
        .vis-input, .vis-textarea {
          width: 100%;
          appearance: none;
          border: 1px solid var(--ps-ink-10);
          background: var(--ps-paper);
          padding: 10px 12px;
          border-radius: 8px;
          font-family: var(--ps-mono);
          font-size: 13px;
          color: var(--ps-ink-80);
          line-height: 1.55;
        }
        .vis-textarea { min-height: 110px; resize: vertical; }

        .vis-align { display: flex; flex-direction: column; gap: 22px; }
        .vis-align-hero {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 24px;
          padding: 20px 22px;
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 14px;
          align-items: center;
        }
        .vis-ring { position: relative; width: 120px; height: 120px; }
        .vis-ring-num {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--ps-serif);
          font-size: 28px;
          letter-spacing: -0.02em;
          color: var(--ps-ink);
        }
        .vis-identity {
          font-family: var(--ps-serif);
          font-size: 22px;
          letter-spacing: -0.015em;
          line-height: 1.3;
          margin-top: 6px;
        }
        .vis-immediate {
          margin-top: 10px;
          font-size: 13px;
          color: var(--ps-ink-70);
          display: flex;
          gap: 8px;
          align-items: baseline;
          flex-wrap: wrap;
        }
        .vis-chip {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          background: var(--ps-accent-soft);
          color: var(--ps-accent);
          padding: 2px 8px;
          border-radius: 4px;
        }

        .vis-block {
          background: #fff;
          border: 1px solid var(--ps-ink-08);
          border-radius: 14px;
          padding: 18px 20px;
        }
        .vis-bar-row {
          display: grid;
          grid-template-columns: 1fr 140px 42px;
          gap: 10px;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid var(--ps-ink-05);
        }
        .vis-bar-row:last-child { border-bottom: none; }
        .vis-bar-label { font-size: 13px; color: var(--ps-ink-80); }
        .vis-bar {
          height: 6px;
          background: var(--ps-ink-08);
          border-radius: 3px;
          position: relative;
          overflow: hidden;
        }
        .vis-bar-fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; }
        .vis-bar-num {
          font-family: var(--ps-mono);
          font-size: 11px;
          color: var(--ps-ink-60);
          text-align: right;
        }
        .vis-outcomes {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 12px;
        }
        .vis-outcome {
          padding: 10px 12px;
          background: var(--ps-paper);
          border: 1px solid var(--ps-ink-08);
          border-radius: 8px;
        }
        .vis-outcome-label {
          font-size: 13px;
          color: var(--ps-ink-80);
          margin-bottom: 6px;
        }
        .vis-outcome-bar {
          height: 4px;
          background: var(--ps-ink-08);
          border-radius: 2px;
          position: relative;
          overflow: hidden;
        }
        .vis-outcome-fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 2px; }
        .vis-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 12px;
        }
        .vis-pill {
          padding: 4px 10px;
          background: var(--ps-accent-soft);
          color: var(--ps-accent);
          border-radius: 999px;
          font-family: var(--ps-mono);
          font-size: 11px;
          letter-spacing: 0.04em;
        }
        .vis-list {
          margin: 12px 0 0;
          padding-left: 20px;
          line-height: 1.6;
          color: var(--ps-ink-80);
        }

        @media (max-width: 900px) {
          .vis-compose-grid { grid-template-columns: repeat(2, 1fr); }
          .vis-outcomes { grid-template-columns: 1fr; }
          .vis-align-hero { grid-template-columns: 1fr; text-align: left; }
          .vis-field-grid { grid-template-columns: 1fr; }
          .vis-immerse-text { font-size: 26px; }
        }
      `}</style>
    </DashboardLayout>
  );
}
