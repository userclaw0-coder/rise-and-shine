import { useEffect, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import { getUserProfile, upsertUserProfile } from "../lib/db";

const NEED_KEYS = [
  "certainty",
  "variety",
  "significance",
  "love_connection",
  "growth",
  "contribution",
];

const NEED_LABELS = {
  certainty: "Certainty",
  variety: "Variety",
  significance: "Significance",
  love_connection: "Love & Connection",
  growth: "Growth",
  contribution: "Contribution",
};

const LIFE_DOMAIN_EXAMPLES = {
  business: "Grow MRR to $15k with one clear offer",
  finances: "Build a 6-month cash buffer and automate bills",
  health: "Lift 3x/week and sleep 7.5h average",
  relationships: "Weekly date night + protected family evenings",
  lifestyle: "Fewer context switches, more calm mornings",
  growth: "Ship one learning project per month",
};

const NEED_EXAMPLES = {
  certainty: {
    strategy: "Daily planning block + fixed AM routine",
    risk: "Over-planning to avoid hard conversations",
  },
  variety: {
    strategy: "Two novelty blocks per week (new route, new idea sprint)",
    risk: "Context switching when work feels boring",
  },
  significance: {
    strategy: "Ship one visible win every Friday",
    risk: "Chasing recognition over meaningful progress",
  },
  love_connection: {
    strategy: "No-phone dinner + weekly friend check-in",
    risk: "Isolating when stressed",
  },
  growth: {
    strategy: "30 minutes skill-building daily",
    risk: "Endless learning without applying",
  },
  contribution: {
    strategy: "Mentor one person / week or publish useful notes",
    risk: "Saying yes to everyone and burning out",
  },
};

const STEPS = [
  "Identity & vision",
  "Life domains & outcomes",
  "Six needs assessment",
  "Brain dump, resources, constraints",
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
  const [stepErrors, setStepErrors] = useState([]);

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
  const [humanNeedsScores, setHumanNeedsScores] = useState({
    certainty: "",
    variety: "",
    significance: "",
    love_connection: "",
    growth: "",
    contribution: "",
  });
  const [humanNeedsStrategies, setHumanNeedsStrategies] = useState({
    certainty: "",
    variety: "",
    significance: "",
    love_connection: "",
    growth: "",
    contribution: "",
  });
  const [needsRiskPatterns, setNeedsRiskPatterns] = useState({
    certainty: "",
    variety: "",
    significance: "",
    love_connection: "",
    growth: "",
    contribution: "",
  });
  const [brainDumpRaw, setBrainDumpRaw] = useState("");
  const [brainDumpTasks, setBrainDumpTasks] = useState("");
  const [brainDumpProjects, setBrainDumpProjects] = useState("");
  const [brainDumpIdeas, setBrainDumpIdeas] = useState("");
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
        setHumanNeedsScores({
          certainty: p.human_needs_scores?.certainty != null ? String(p.human_needs_scores.certainty) : "",
          variety: p.human_needs_scores?.variety != null ? String(p.human_needs_scores.variety) : "",
          significance: p.human_needs_scores?.significance != null ? String(p.human_needs_scores.significance) : "",
          love_connection:
            p.human_needs_scores?.love_connection != null
              ? String(p.human_needs_scores.love_connection)
              : "",
          growth: p.human_needs_scores?.growth != null ? String(p.human_needs_scores.growth) : "",
          contribution:
            p.human_needs_scores?.contribution != null
              ? String(p.human_needs_scores.contribution)
              : "",
        });
        setHumanNeedsStrategies({
          certainty: p.human_needs_strategies?.certainty || "",
          variety: p.human_needs_strategies?.variety || "",
          significance: p.human_needs_strategies?.significance || "",
          love_connection: p.human_needs_strategies?.love_connection || "",
          growth: p.human_needs_strategies?.growth || "",
          contribution: p.human_needs_strategies?.contribution || "",
        });
        setNeedsRiskPatterns({
          certainty: p.needs_risk_patterns?.certainty || "",
          variety: p.needs_risk_patterns?.variety || "",
          significance: p.needs_risk_patterns?.significance || "",
          love_connection: p.needs_risk_patterns?.love_connection || "",
          growth: p.needs_risk_patterns?.growth || "",
          contribution: p.needs_risk_patterns?.contribution || "",
        });
        setBrainDumpRaw(p.brain_dump_raw || "");
        setBrainDumpTasks((p.brain_dump_structured?.tasks || []).join("\n"));
        setBrainDumpProjects((p.brain_dump_structured?.projects || []).join("\n"));
        setBrainDumpIdeas((p.brain_dump_structured?.ideas || []).join("\n"));
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

  useEffect(() => {
    setStepErrors([]);
  }, [step]);

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
      human_needs_scores: NEED_KEYS.reduce((acc, key) => {
        const v = Number(humanNeedsScores[key]);
        acc[key] = Number.isFinite(v) ? Math.max(1, Math.min(10, v)) : null;
        return acc;
      }, {}),
      human_needs_strategies: { ...humanNeedsStrategies },
      needs_risk_patterns: { ...needsRiskPatterns },
      brain_dump_raw: brainDumpRaw || "",
      brain_dump_structured: {
        tasks: brainDumpTasks
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        projects: brainDumpProjects
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        ideas: brainDumpIdeas
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        constraints: constraints
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      },
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

  function getStepErrors(stepIndex) {
    const errors = [];

    if (stepIndex === 0) {
      if (!identityAttributes.split(",").map((s) => s.trim()).filter(Boolean).length) {
        errors.push("Add at least one identity phrase.");
      }
    }

    if (stepIndex === 1) {
      const hasLifeDomain = Object.values(lifeDomains).some((v) => String(v || "").trim().length > 0);
      const hasOutcomes = desiredOutcomes
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean).length > 0;
      if (!hasLifeDomain && !hasOutcomes) {
        errors.push("Add at least one life domain note or one desired outcome.");
      }
    }

    if (stepIndex === 2) {
      NEED_KEYS.forEach((key) => {
        const score = Number(humanNeedsScores[key]);
        if (!Number.isFinite(score) || score < 1 || score > 10) {
          errors.push(`${NEED_LABELS[key]} score must be between 1 and 10.`);
        }
        if (!String(humanNeedsStrategies[key] || "").trim()) {
          errors.push(`${NEED_LABELS[key]} needs a current strategy.`);
        }
      });
    }

    if (stepIndex === 3) {
      const hasRaw = String(brainDumpRaw || "").trim().length > 0;
      const hasStructured = [brainDumpTasks, brainDumpProjects, brainDumpIdeas]
        .some((v) => String(v || "").trim().length > 0);
      if (!hasRaw && !hasStructured) {
        errors.push("Add a raw brain dump or at least one structured item.");
      }
    }

    if (stepIndex === 4 && String(availableHours || "").trim()) {
      const hours = Number(availableHours);
      if (!Number.isFinite(hours) || hours < 0 || hours > 168) {
        errors.push("Available hours per week must be between 0 and 168.");
      }
    }

    if (stepIndex === 5) {
      const hasFocus =
        String(leverageFocus || "").trim().length > 0 ||
        String(quarterFocus || "").trim().length > 0 ||
        String(immediateStep || "").trim().length > 0;
      if (!hasFocus) {
        errors.push("Add at least one strategic focus item or an immediate step.");
      }
    }

    return errors;
  }

  function validateStep(stepIndex) {
    const errors = getStepErrors(stepIndex);
    setStepErrors(errors);
    return errors.length === 0;
  }

  function validateAllSteps() {
    const allErrors = STEPS.flatMap((_, idx) => getStepErrors(idx));
    setStepErrors(allErrors);
    return allErrors.length === 0;
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
    setError("");
    if (!validateAllSteps()) {
      setError("Please fix the onboarding validation items before completing.");
      return;
    }

    setSaving(true);
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
          <div
            style={{
              fontSize: 12,
              color: "#374151",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: 8,
              marginBottom: 10,
            }}
          >
            Tip: pick identity words that drive behavior today (&quot;I close loops&quot;, &quot;I protect focus&quot;).
          </div>
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
              fontSize: 12,
              color: "#374151",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: 8,
              marginBottom: 10,
            }}
          >
            Keep domain notes outcome-based (where you want to be), and outcomes execution-based (what you will ship).
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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
                  placeholder={LIFE_DOMAIN_EXAMPLES[key] || ""}
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
            Six human needs assessment
          </h2>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 10px" }}>
            Rate each need (1–10), how you currently meet it, and any unhelpful patterns.
          </p>
          <div
            style={{
              fontSize: 12,
              color: "#374151",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: 8,
              marginBottom: 10,
            }}
          >
            Tip: write concrete behaviors (what you actually do) rather than ideals.
            Example: &quot;I get certainty from a strict morning routine.&quot;
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {NEED_KEYS.map((key) => (
              <div key={key} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{NEED_LABELS[key]}</div>
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                  <label style={{ fontSize: 12, color: "#4b5563", display: "flex", flexDirection: "column", gap: 4 }}>
                    Score (1-10)
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={humanNeedsScores[key]}
                      onChange={(e) =>
                        setHumanNeedsScores((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      style={{ fontSize: 13, padding: 6, borderRadius: 6, border: "1px solid #e5e7eb", maxWidth: 90 }}
                    />
                  </label>
                  <label style={{ fontSize: 12, color: "#4b5563", display: "flex", flexDirection: "column", gap: 4 }}>
                    Current strategy
                    <input
                      type="text"
                      value={humanNeedsStrategies[key]}
                      onChange={(e) =>
                        setHumanNeedsStrategies((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      placeholder={NEED_EXAMPLES[key].strategy}
                      style={{ fontSize: 13, padding: 6, borderRadius: 6, border: "1px solid #e5e7eb" }}
                    />
                  </label>
                  <label style={{ fontSize: 12, color: "#4b5563", display: "flex", flexDirection: "column", gap: 4 }}>
                    Unhelpful pattern (optional)
                    <input
                      type="text"
                      value={needsRiskPatterns[key]}
                      onChange={(e) =>
                        setNeedsRiskPatterns((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      placeholder={NEED_EXAMPLES[key].risk}
                      style={{ fontSize: 13, padding: 6, borderRadius: 6, border: "1px solid #e5e7eb" }}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </>
      );
    }
    if (step === 3) {
      return (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>
            Brain dump, resources, and constraints
          </h2>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 10px" }}>
            Capture everything on your mind, then structure it for tasks/projects/ideas.
          </p>
          <div
            style={{
              fontSize: 12,
              color: "#374151",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: 8,
              marginBottom: 10,
            }}
          >
            Brain dump prompt: &quot;What is taking up mental space right now?&quot; Then sort items:
            tasks (single actions), projects (multi-step), ideas (someday/maybe).
          </div>
          <label style={{ fontSize: 12, color: "#4b5563", display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
            Brain dump (raw)
            <textarea value={brainDumpRaw} onChange={(e) => setBrainDumpRaw(e.target.value)} rows={4} placeholder="Everything swirling in your head: obligations, worries, ideas, errands, open loops…" style={{ fontSize: 13, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginBottom: 8 }}>
            <label style={{ fontSize: 12, color: "#4b5563", display: "flex", flexDirection: "column", gap: 4 }}>
              Structured tasks (one per line)
              <textarea value={brainDumpTasks} onChange={(e) => setBrainDumpTasks(e.target.value)} rows={4} placeholder="Call dentist&#10;Submit March invoices" style={{ fontSize: 13, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }} />
            </label>
            <label style={{ fontSize: 12, color: "#4b5563", display: "flex", flexDirection: "column", gap: 4 }}>
              Structured projects (one per line)
              <textarea value={brainDumpProjects} onChange={(e) => setBrainDumpProjects(e.target.value)} rows={4} placeholder="Website redesign&#10;Family summer trip plan" style={{ fontSize: 13, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }} />
            </label>
            <label style={{ fontSize: 12, color: "#4b5563", display: "flex", flexDirection: "column", gap: 4 }}>
              Structured ideas (one per line)
              <textarea value={brainDumpIdeas} onChange={(e) => setBrainDumpIdeas(e.target.value)} rows={4} placeholder="Podcast concept: mornings for makers&#10;Experiment with 4-day deep-work week" style={{ fontSize: 13, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }} />
            </label>
          </div>
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
              placeholder="Supportive partner&#10;$3k runway&#10;Contractor availability"
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
              placeholder="School pickup 3pm daily&#10;Low energy after 8pm"
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
    if (step === 4) {
      return (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>
            Time & energy
          </h2>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 10px" }}>
            This shapes how aggressively the planner schedules your work.
          </p>
          <div
            style={{
              fontSize: 12,
              color: "#374151",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: 8,
              marginBottom: 10,
            }}
          >
            Be realistic, not aspirational. Planner quality improves when this reflects your normal week.
            Example: if you usually get 8 focused hours, enter 8 (not your ideal 20).
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
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
                placeholder="12"
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
          </div>
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
        <div
          style={{
            fontSize: 12,
            color: "#374151",
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 8,
            marginBottom: 10,
          }}
        >
          Pick leverage points where a small effort compounds (systems, recurring assets, delegation). Example: &quot;Build one reusable sales script&quot; beats &quot;work harder.&quot;
        </div>
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
            placeholder="Automate lead follow-up\nWeekly planning review ritual\nDelegate bookkeeping"
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
            placeholder="Pipeline quality, Debt payoff, Strength training"
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
            placeholder="Block 45 minutes today to draft the offer page."
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
            6 short steps to tune Rise &amp; Shine to your life.
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
            gap: 8,
            flexWrap: "wrap",
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
        {stepErrors.length > 0 && (
          <ul style={{ margin: "0 0 10px", paddingLeft: 18, color: "#b91c1c", fontSize: 12 }}>
            {stepErrors.slice(0, 4).map((msg, idx) => (
              <li key={`${msg}-${idx}`}>{msg}</li>
            ))}
            {stepErrors.length > 4 && <li>+{stepErrors.length - 4} more…</li>}
          </ul>
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
              onClick={() => {
                if (step === STEPS.length - 1) return;
                setError("");
                if (!validateStep(step)) return;
                setStep((s) => Math.min(STEPS.length - 1, s + 1));
              }}
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

