import { useEffect, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import { getUserProfile, upsertUserProfile } from "../lib/db";

export default function VisionPage() {
  const { user, isCheckingAuth } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  const [identityAttributes, setIdentityAttributes] = useState("");
  const [lifeDomains, setLifeDomains] = useState({
    business: "",
    finances: "",
    health: "",
    relationships: "",
    lifestyle: "",
    growth: "",
  });
  const [desiredOutcomes, setDesiredOutcomes] = useState("");
  const [leverageFocus, setLeverageFocus] = useState("");
  const [quarterFocus, setQuarterFocus] = useState("");
  const [immediateStep, setImmediateStep] = useState("");

  useEffect(() => {
    if (!user) return;
    async function load() {
      setLoading(true);
      setError("");
      const res = await getUserProfile(user.id);
      if (!res.error && res.data && res.data.profile) {
        const p = res.data.profile;
        setIdentityAttributes((p.identity_attributes || []).join(", "));
        setLifeDomains({
          business: p.life_domains?.business || "",
          finances: p.life_domains?.finances || "",
          health: p.life_domains?.health || "",
          relationships: p.life_domains?.relationships || "",
          lifestyle: p.life_domains?.lifestyle || "",
          growth: p.life_domains?.growth || "",
        });
        setDesiredOutcomes(
          (p.desired_outcomes || [])
            .map((o) => o.title || "")
            .filter(Boolean)
            .join("\n")
        );
        setLeverageFocus((p.leverage_focus || []).join("\n"));
        setQuarterFocus((p.quarter_focus || []).join(", "));
        setImmediateStep(p.immediate_step || "");
      }
      setLoading(false);
    }
    load();
  }, [user]);

  if (isCheckingAuth || !user || loading) {
    return (
      <DashboardLayout>
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading…</p>
      </DashboardLayout>
    );
  }

  function buildProfile(existing) {
    const identities = identityAttributes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const outcomes = desiredOutcomes
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((title, idx) => ({
        id: `vision-${idx}`,
        title,
      }));
    return {
      ...(existing || {}),
      user_id: user.id,
      identity_attributes: identities,
      life_domains: lifeDomains,
      desired_outcomes: outcomes,
      leverage_focus: leverageFocus
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      quarter_focus: quarterFocus
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      immediate_step: immediateStep || "",
    };
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const existingRes = await getUserProfile(user.id);
      const existing = !existingRes.error && existingRes.data
        ? existingRes.data.profile || {}
        : {};
      const profile = buildProfile(existing);
      const res = await upsertUserProfile(user.id, profile);
      if (res.error) {
        setError(res.error.message || "Failed to save vision.");
      } else {
        setSavedMsg("Vision saved.");
        setTimeout(() => setSavedMsg(""), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardLayout>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 16,
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Vision
          </h1>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#6b7280",
            }}
          >
            Edit your identity, domains, outcomes, and strategic focus.
          </p>
        </div>
        {savedMsg && (
          <div style={{ fontSize: 12, color: "#059669" }}>{savedMsg}</div>
        )}
      </div>
      <section
        style={{
          padding: 16,
          borderRadius: 16,
          border: "1px solid #e5e7eb",
          background: "#ffffff",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {error && (
          <p style={{ fontSize: 13, color: "#b91c1c", margin: 0 }}>{error}</p>
        )}
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>
            Identity & vision
          </h2>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 6px" }}>
            Short identity phrases that describe who you are becoming.
          </p>
          <textarea
            value={identityAttributes}
            onChange={(e) => setIdentityAttributes(e.target.value)}
            rows={3}
            style={{
              width: "100%",
              fontSize: 13,
              padding: 8,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
            }}
          />
        </div>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>
            Life domains
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 8,
            }}
          >
            {Object.entries(lifeDomains).map(([key, value]) => (
              <label
                key={key}
                style={{
                  fontSize: 12,
                  color: "#4b5563",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <span style={{ textTransform: "capitalize" }}>{key}</span>
                <textarea
                  value={value}
                  onChange={(e) =>
                    setLifeDomains((prev) => ({
                      ...prev,
                      [key]: e.target.value,
                    }))
                  }
                  rows={2}
                  style={{
                    fontSize: 13,
                    padding: 6,
                    borderRadius: 6,
                    border: "1px solid #e5e7eb",
                  }}
                />
              </label>
            ))}
          </div>
        </div>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>
            Desired outcomes (12 months)
          </h2>
          <textarea
            value={desiredOutcomes}
            onChange={(e) => setDesiredOutcomes(e.target.value)}
            rows={4}
            style={{
              width: "100%",
              fontSize: 13,
              padding: 8,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
            }}
          />
        </div>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>
            Strategic focus
          </h2>
          <label
            style={{
              fontSize: 12,
              color: "#4b5563",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              marginBottom: 8,
            }}
          >
            Leverage areas (one per line)
            <textarea
              value={leverageFocus}
              onChange={(e) => setLeverageFocus(e.target.value)}
              rows={3}
              style={{
                fontSize: 13,
                padding: 8,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
              }}
            />
          </label>
          <label
            style={{
              fontSize: 12,
              color: "#4b5563",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              marginBottom: 8,
            }}
          >
            Quarter focus (comma separated)
            <input
              type="text"
              value={quarterFocus}
              onChange={(e) => setQuarterFocus(e.target.value)}
              style={{
                fontSize: 13,
                padding: 6,
                borderRadius: 6,
                border: "1px solid #e5e7eb",
              }}
            />
          </label>
          <label
            style={{
              fontSize: 12,
              color: "#4b5563",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            Immediate step
            <textarea
              value={immediateStep}
              onChange={(e) => setImmediateStep(e.target.value)}
              rows={2}
              style={{
                fontSize: 13,
                padding: 8,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
              }}
            />
          </label>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              fontSize: 13,
              padding: "6px 14px",
              borderRadius: 999,
              border: "1px solid #111827",
              background: "#111827",
              color: "#ffffff",
              cursor: saving ? "wait" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Save vision"}
          </button>
        </div>
      </section>
    </DashboardLayout>
  );
}

