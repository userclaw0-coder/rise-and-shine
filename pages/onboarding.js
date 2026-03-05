import { useEffect, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import { getUserProfile, upsertUserProfile } from "../lib/db";

const STEPS = [
  "Identity & vision",
  "Life domains & outcomes",
  "Needs, resources, constraints",
  "Time & energy",
  "Strategic focus",
];

export default function OnboardingPage() {
  const { user, isCheckingAuth } = useAuth();
  const [step, setStep] = useState(0);
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
  const [resources, setResources] = useState("");
  const [constraints, setConstraints] = useState("");
  const [availableHours, setAvailableHours] = useState("");
  const [bestTimeOfDay, setBestTimeOfDay] = useState("");
  const [lowEnergyTimes, setLowEnergyTimes] = useState("");
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
        setResources((p.resources || []).join("\n"));
        setConstraints((p.constraints || []).join("\n"));
        setAvailableHours(
          p.available_hours_per_week != null
            ? String(p.available_hours_per_week)
            : ""
        );
        setBestTimeOfDay(p.energy_profile?.best_time_of_day || "");
        setLowEnergyTimes((p.energy_profile?.low_energy_times || []).join(", "));
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

  function buildProfile() {
    const identities = identityAttributes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const outcomes = desiredOutcomes
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((title, idx) => ({
        id: `local-${idx}`,
        title,
      }));
    return {
      user_id: user.id,
      identity_attributes: identities,
      life_domains: lifeDomains,
      desired_outcomes: outcomes,
      resources: resources
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      constraints: constraints
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      available_hours_per_week: availableHours
        ? Number(availableHours)
        : null,
      energy_profile: {
        best_time_of_day: bestTimeOfDay || null,
        low_energy_times: lowEnergyTimes
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      },
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
      const profile = buildProfile();
      const res = await upsertUserProfile(user.id, profile);
      if (res.error) {
        setError(res.error.message || "Failed to save profile.");
      } else {
        setSavedMsg("Saved. You can adjust this anytime.");
        setTimeout(() => setSavedMsg(""), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleCompleteOnboarding() {
    setSaving(true);
    setError("");
    try {
      const profile = buildProfile();
      const res = await upsertUserProfile(user.id, profile);
      if (res.error) {
        setError(res.error.message || "Failed to save profile.");
        return;
      }
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("rs-onboarding-later");
        window.location.href = "/vision";
      }
    } finally {
      setSaving(false);
    }
  }

  function handleSkipForNow() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("rs-onboarding-later", "1");
      window.location.href = "/today";
    }
  }

  function renderStep() {
    if (step === 0) {
      return (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>
            Identity & vision
          </h2>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 10px" }}>
            Imagine yourself three years from now. What kind of person are you?
            Use short identity phrases separated by commas.
          </p>
          <textarea
            value={identityAttributes}
            onChange={(e) => setIdentityAttributes(e.target.value)}
            rows={3}
            placeholder="Calm operator, Creative builder, Present parent…"
            style={{
              width: "100%",
              fontSize: 13,
              padding: 8,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
            }}
          />
        </>
      );
    }
    if (step === 1) {
      return (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>
            Life domains & outcomes
          </h2>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 10px" }}>
            Short vision statements for each domain, plus key outcomes you
            want in the next 12 months.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 8,
              marginBottom: 10,
            }}
          >
            {Object.entries(lifeDomains).map(([key, value]) => (
              <label
                key={key}
                style={{ fontSize: 12, color: "#4b5563", display: "flex", flexDirection: "column", gap: 4 }}
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
          <label
            style={{
              fontSize: 12,
              color: "#4b5563",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            Desired outcomes (one per line)
            <textarea
              value={desiredOutcomes}
              onChange={(e) => setDesiredOutcomes(e.target.value)}
              rows={3}
              placeholder="Launch a profitable consulting service&#10;Lose 25 pounds…"
              style={{
                fontSize: 13,
                padding: 8,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
              }}
            />
          </label>
        </>
      );
    }
    if (step === 2) {
      return (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>
            Needs, resources, and constraints
          </h2>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 10px" }}>
            Capture what supports you and what gets in the way.
          </p>
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
            Resources (one per line)
            <textarea
              value={resources}
              onChange={(e) => setResources(e.target.value)}
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
            }}
          >
            Constraints (one per line)
            <textarea
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              rows={3}
              style={{
                fontSize: 13,
                padding: 8,
                borderRadius: 8,
                border: "1px solid #e5e7eb",
              }}
            />
          </label>
        </>
      );
    }
    if (step === 3) {
      return (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>
            Time & energy
          </h2>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 10px" }}>
            This shapes how aggressively the planner schedules your work.
          </p>
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
            Available hours per week
            <input
              type="number"
              min={0}
              value={availableHours}
              onChange={(e) => setAvailableHours(e.target.value)}
              style={{
                fontSize: 13,
                padding: 6,
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                maxWidth: 120,
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
            Best time of day for deep work
            <input
              type="text"
              value={bestTimeOfDay}
              onChange={(e) => setBestTimeOfDay(e.target.value)}
              placeholder="e.g. 5–7am"
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
            Low-energy times (comma separated)
            <input
              type="text"
              value={lowEnergyTimes}
              onChange={(e) => setLowEnergyTimes(e.target.value)}
              placeholder="e.g. late evening, mid-afternoon"
              style={{
                fontSize: 13,
                padding: 6,
                borderRadius: 6,
                border: "1px solid #e5e7eb",
              }}
            />
          </label>
        </>
      );
    }
    // step 4
    return (
      <>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>
          Strategic focus
        </h2>
        <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 10px" }}>
          Capture leverage areas, quarter focus, and one immediate step.
        </p>
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
          Top three priorities this quarter (comma separated)
          <input
            type="text"
            value={quarterFocus}
            onChange={(e) => setQuarterFocus(e.target.value)}
            placeholder="Business, Rental House, Health"
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
            placeholder="One small action you could take today."
            style={{
              fontSize: 13,
              padding: 8,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
            }}
          />
        </label>
      </>
    );
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
            Onboarding
          </h1>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#6b7280",
            }}
          >
            5 short steps to tune Rise &amp; Shine to your life.
          </p>
        </div>
      </div>
      <section
        style={{
          padding: 16,
          borderRadius: 16,
          border: "1px solid #e5e7eb",
          background: "#ffffff",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Step {step + 1} of {STEPS.length}:{" "}
            <strong>{STEPS[step]}</strong>
          </div>
          {savedMsg && (
            <div style={{ fontSize: 12, color: "#059669" }}>{savedMsg}</div>
          )}
        </div>
        {error && (
          <p style={{ fontSize: 13, color: "#b91c1c", marginBottom: 8 }}>
            {error}
          </p>
        )}
        {renderStep()}
        <div
          style={{
            marginTop: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              style={{
                fontSize: 13,
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: step === 0 ? "#f9fafb" : "#ffffff",
                color: "#4b5563",
                cursor: step === 0 ? "default" : "pointer",
              }}
            >
              Back
            </button>
            <button
              type="button"
              onClick={() =>
                setStep((s) => Math.min(STEPS.length - 1, s + 1))
              }
              disabled={step === STEPS.length - 1}
              style={{
                fontSize: 13,
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background:
                  step === STEPS.length - 1 ? "#f9fafb" : "#ffffff",
                color: "#111827",
                cursor:
                  step === STEPS.length - 1 ? "default" : "pointer",
              }}
            >
              Next
            </button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={handleSkipForNow}
              style={{
                fontSize: 13,
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                color: "#4b5563",
                cursor: "pointer",
              }}
            >
              Later
            </button>
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
              {saving ? "Saving…" : "Save profile"}
            </button>
            <button
              type="button"
              onClick={handleCompleteOnboarding}
              disabled={saving || step !== STEPS.length - 1}
              style={{
                fontSize: 13,
                padding: "6px 14px",
                borderRadius: 999,
                border: "1px solid #059669",
                background:
                  step === STEPS.length - 1 ? "#059669" : "#f9fafb",
                color: step === STEPS.length - 1 ? "#ffffff" : "#6b7280",
                cursor:
                  saving || step !== STEPS.length - 1 ? "default" : "pointer",
              }}
            >
              Complete onboarding
            </button>
          </div>
        </div>
      </section>
    </DashboardLayout>
  );
}

