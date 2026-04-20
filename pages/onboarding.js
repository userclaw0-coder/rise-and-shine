import { useEffect, useState } from "react";
import Head from "next/head";
import { useAuth } from "../hooks/useAuth";
import {
  getUserProfile,
  upsertUserProfile,
  upsertWeeklyReview,
  createTask,
} from "../lib/db";
import {
  HUMAN_NEED_STRATEGY_EXAMPLES,
  HUMAN_NEED_STRATEGY_KEYS,
  getHumanNeedStrategiesState,
  getHumanNeedStrategyLabel,
} from "../lib/humanNeedStrategies";

/** Monday of current week, YYYY-MM-DD (for human_needs_weekly baseline). */
function getCurrentWeekStart() {
  const d = new Date();
  const day = d.getUTCDay() || 7;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - (day - 1));
  return monday.toISOString().slice(0, 10);
}

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
  "Human Need Strategies & outcomes",
  "Six needs assessment",
  "Brain dump, resources, constraints",
  "Time & energy",
  "Strategic focus",
];

// Maps the 6 production steps onto the design's 5 narrative stages.
const STEP_TO_STAGE = [0, 1, 1, 2, 3, 4];
const STAGES = [
  { id: "destination", idx: "01", label: "Destination", sub: "Identity & vision" },
  { id: "needs", idx: "02", label: "Human needs", sub: "What you need to thrive" },
  { id: "current", idx: "03", label: "Current situation", sub: "Brain dump, resources, constraints" },
  { id: "time", idx: "04", label: "Time & energy", sub: "When you actually work" },
  { id: "action", idx: "05", label: "Strategic focus", sub: "First move" },
];

const STEP_EYEBROWS = [
  "Part 01 · Destination",
  "Part 02 · Human needs · Strategies & outcomes",
  "Part 02 · Human needs · Assessment",
  "Part 03 · Current situation",
  "Part 04 · Time & energy",
  "Part 05 · Strategic focus",
];

const STEP_TITLES = [
  "Who are you becoming?",
  "How do you actually thrive?",
  "Score your six human needs.",
  "Clear your head, name your resources.",
  "When does the work actually happen?",
  "Pick the focus. Name the first move.",
];

const STEP_SUBS = [
  "Identity attributes, the life domains that matter, and 1–3 outcomes that would make the next year count.",
  "For each of the six human needs, name a healthy strategy and a pattern that trips you up.",
  "Rate each need on a 1–10 scale. No judgement — just where you are right now.",
  "Dump everything that's rattling around. We'll separate tasks, projects, and ideas — plus what you have to work with and what stands in the way.",
  "How many focused hours per week, when you're sharpest, and when you need to rest.",
  "Pick a top 3 to focus on this quarter, and the single smallest action you could take today.",
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
  const [lifeDomains, setLifeDomains] = useState(getHumanNeedStrategiesState());
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
        setLifeDomains(getHumanNeedStrategiesState(p));
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
      <div className="ob-loading">
        <p>Loading…</p>
        <style jsx>{`
          .ob-loading {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #ece6da;
            color: #655e4f;
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif;
          }
        `}</style>
      </div>
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
        errors.push("Add at least one human need strategy note or one desired outcome.");
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

      // Seed human_needs_weekly with this week's baseline so weekly review has onboarding scores.
      const weekStart = getCurrentWeekStart();
      const scoresForWeekly = { ...(profile.human_needs_scores || {}) };
      if (scoresForWeekly.love_connection != null) {
        scoresForWeekly.connection = scoresForWeekly.love_connection;
        delete scoresForWeekly.love_connection;
      }
      await upsertWeeklyReview(user.id, weekStart, { scores: scoresForWeekly });

      // Seed first task from immediate step (per ONBOARDING_FLOW: "This seeds the first task").
      const createdFirstTask = Boolean(String(profile.immediate_step || "").trim());
      if (createdFirstTask) {
        await createTask(user.id, {
          title: profile.immediate_step.trim(),
          status: "todo",
        });
      }

      if (typeof window !== "undefined") {
        window.localStorage.removeItem("rs-onboarding-later");
        window.localStorage.setItem(
          "rs-onboarding-just-completed",
          createdFirstTask ? "task" : "done"
        );
        window.location.href = "/today";
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
            Human Need Strategies & outcomes
          </h2>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 10px" }}>
            Short working statements for each human need strategy, plus key outcomes you
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
            Preserve what you already have, then rename and refine each strategy over time. Outcomes stay execution-based.
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 8,
              marginBottom: 10,
            }}
          >
            {HUMAN_NEED_STRATEGY_KEYS.map((key) => (
              <label
                key={key}
                style={{ fontSize: 12, color: "#4b5563", display: "flex", flexDirection: "column", gap: 4 }}
              >
                <span>{getHumanNeedStrategyLabel(key)}</span>
                <textarea
                  value={lifeDomains[key] || ""}
                  onChange={(e) =>
                    setLifeDomains((prev) => ({
                      ...prev,
                      [key]: e.target.value,
                    }))
                  }
                  rows={2}
                  placeholder={HUMAN_NEED_STRATEGY_EXAMPLES[key] || ""}
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

  const activeStage = STEP_TO_STAGE[step];
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <>
      <Head>
        <title>Onboarding · Rise &amp; Shine</title>
      </Head>
      <div className="ob-app">
        <aside className="ob-rail">
          <div className="ob-brand">
            <div className="ob-brand-mark">r</div>
            <div>
              <div className="ob-brand-title">Rise &amp; Shine</div>
              <div className="ob-brand-sub">Setting up</div>
            </div>
          </div>

          <div className="ob-stages">
            {STAGES.map((s, i) => (
              <div
                key={s.id}
                className={
                  "ob-stage" +
                  (i === activeStage
                    ? " active"
                    : i < activeStage
                    ? " done"
                    : "")
                }
              >
                <span className="ob-stage-idx">{s.idx}</span>
                <div className="ob-stage-body">
                  <div className="ob-stage-label">{s.label}</div>
                  <div className="ob-stage-sub">{s.sub}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="ob-rail-foot">
            <button
              type="button"
              className="ob-skip-link"
              onClick={handleSkipForNow}
            >
              Skip for now →
            </button>
          </div>
        </aside>

        <main className="ob-canvas">
          <div className="ob-content">
            <div className="ob-progress-wrap">
              <div className="ob-progress-meta">
                <span>
                  Step {step + 1} of {STEPS.length}
                </span>
                {savedMsg && (
                  <span className="ob-saved">{savedMsg}</span>
                )}
              </div>
              <div className="ob-progress-bar">
                <div
                  className="ob-progress-fill"
                  style={{ width: progress + "%" }}
                />
              </div>
            </div>

            <div className="ob-eyebrow">{STEP_EYEBROWS[step]}</div>
            <h1 className="ob-title">{STEP_TITLES[step]}</h1>
            <p className="ob-sub">{STEP_SUBS[step]}</p>

            {error && <div className="ob-error">{error}</div>}
            {stepErrors.length > 0 && (
              <div className="ob-errors">
                <div className="ob-errors-cap">Before you move on</div>
                <ul>
                  {stepErrors.slice(0, 4).map((msg, idx) => (
                    <li key={`${msg}-${idx}`}>{msg}</li>
                  ))}
                  {stepErrors.length > 4 && (
                    <li>+{stepErrors.length - 4} more…</li>
                  )}
                </ul>
              </div>
            )}

            <div className="ob-step-card">{renderStep()}</div>

            <div className="ob-nav">
              <div className="ob-nav-left">
                <button
                  type="button"
                  className="ob-btn"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  disabled={step === 0}
                >
                  ← Back
                </button>
                <button
                  type="button"
                  className="ob-btn"
                  onClick={() => {
                    if (step === STEPS.length - 1) return;
                    setError("");
                    if (!validateStep(step)) return;
                    setStep((s) => Math.min(STEPS.length - 1, s + 1));
                  }}
                  disabled={step === STEPS.length - 1}
                >
                  Next →
                </button>
              </div>
              <div className="ob-nav-right">
                <button
                  type="button"
                  className="ob-btn"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save draft"}
                </button>
                <button
                  type="button"
                  className="ob-btn ob-btn-primary"
                  onClick={handleCompleteOnboarding}
                  disabled={saving || step !== STEPS.length - 1}
                >
                  {step === STEPS.length - 1
                    ? "Complete → Today"
                    : "Complete"}
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      <style jsx global>{`
        html,
        body,
        #__next {
          margin: 0;
          padding: 0;
          min-height: 100vh;
        }
        body {
          background: #ece6da;
        }
        .ob-app {
          display: grid;
          grid-template-columns: 280px 1fr;
          min-height: 100vh;
          background:
            radial-gradient(1400px 800px at 15% -10%, #f5e7cf 0%, transparent 55%),
            radial-gradient(1000px 600px at 90% 110%, #efdcc8 0%, transparent 55%),
            #ece6da;
          color: var(--ps-ink);
          font-family: var(--ps-sans);
        }
        .ob-rail {
          border-right: 1px solid var(--ps-ink-08);
          background: rgba(255, 251, 243, 0.55);
          padding: 28px 22px 20px;
          display: flex;
          flex-direction: column;
          gap: 18px;
          position: sticky;
          top: 0;
          max-height: 100vh;
        }
        .ob-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
        }
        .ob-brand-mark {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          background: linear-gradient(135deg, var(--ps-accent), var(--ps-clay));
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-family: var(--ps-serif);
          font-size: 15px;
          font-style: italic;
        }
        .ob-brand-title {
          font-size: 13px;
          font-weight: 500;
          letter-spacing: -0.01em;
        }
        .ob-brand-sub {
          font-family: var(--ps-mono);
          font-size: 9px;
          color: var(--ps-ink-50);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-top: 2px;
        }
        .ob-stages {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
        }
        .ob-stage {
          display: grid;
          grid-template-columns: 28px 1fr;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 8px;
          align-items: start;
          border: 1px solid transparent;
          opacity: 0.5;
        }
        .ob-stage.done {
          opacity: 0.75;
        }
        .ob-stage.active {
          background: var(--ps-ink);
          color: var(--ps-bg);
          opacity: 1;
        }
        .ob-stage.active .ob-stage-idx,
        .ob-stage.active .ob-stage-sub {
          color: rgba(250, 247, 242, 0.6);
        }
        .ob-stage-idx {
          font-family: var(--ps-mono);
          font-size: 11px;
          color: var(--ps-ink-40);
          letter-spacing: 0.06em;
          padding-top: 2px;
        }
        .ob-stage-label {
          font-size: 13px;
          font-weight: 500;
        }
        .ob-stage-sub {
          font-family: var(--ps-mono);
          font-size: 9.5px;
          color: var(--ps-ink-50);
          letter-spacing: 0.05em;
          margin-top: 2px;
          text-transform: uppercase;
        }
        .ob-rail-foot {
          padding-top: 14px;
          border-top: 1px solid var(--ps-ink-08);
        }
        .ob-skip-link {
          appearance: none;
          border: none;
          background: transparent;
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ps-ink-60);
          cursor: pointer;
          padding: 0;
        }
        .ob-skip-link:hover {
          color: var(--ps-accent);
        }
        .ob-canvas {
          display: flex;
          justify-content: center;
          padding: 40px 32px 80px;
        }
        .ob-content {
          width: 100%;
          max-width: 720px;
        }
        .ob-progress-wrap {
          margin-bottom: 28px;
        }
        .ob-progress-meta {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
          margin-bottom: 8px;
        }
        .ob-saved {
          color: var(--ps-sage);
        }
        .ob-progress-bar {
          height: 3px;
          background: var(--ps-ink-08);
          border-radius: 2px;
          overflow: hidden;
        }
        .ob-progress-fill {
          height: 100%;
          background: var(--ps-accent);
          transition: width 240ms ease;
        }
        .ob-eyebrow {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
          margin-bottom: 10px;
        }
        .ob-title {
          font-family: var(--ps-serif);
          font-size: 36px;
          font-weight: 400;
          letter-spacing: -0.02em;
          line-height: 1.1;
          margin: 0 0 12px;
          color: var(--ps-ink);
        }
        .ob-sub {
          font-size: 14px;
          color: var(--ps-ink-60);
          line-height: 1.55;
          margin: 0 0 28px;
        }
        .ob-error {
          background: var(--ps-clay-soft);
          color: var(--ps-clay);
          border: 1px solid rgba(184, 92, 62, 0.22);
          padding: 10px 14px;
          border-radius: 10px;
          font-size: 13px;
          margin-bottom: 14px;
        }
        .ob-errors {
          background: var(--ps-clay-soft);
          border: 1px solid rgba(184, 92, 62, 0.22);
          border-radius: 10px;
          padding: 12px 14px;
          margin-bottom: 14px;
        }
        .ob-errors-cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ps-clay);
          margin-bottom: 6px;
        }
        .ob-errors ul {
          margin: 0;
          padding-left: 18px;
          color: var(--ps-ink-80);
          font-size: 12.5px;
          line-height: 1.55;
        }
        .ob-step-card {
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 14px;
          padding: 22px 24px;
          margin-bottom: 24px;
        }
        .ob-step-card label {
          color: var(--ps-ink);
        }
        .ob-step-card input[type="text"],
        .ob-step-card input[type="number"],
        .ob-step-card textarea,
        .ob-step-card select {
          border-color: var(--ps-ink-10) !important;
          font-family: inherit !important;
          color: var(--ps-ink) !important;
        }
        .ob-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .ob-nav-left,
        .ob-nav-right {
          display: flex;
          gap: 8px;
        }
        .ob-btn {
          appearance: none;
          border: 1px solid var(--ps-ink-15);
          background: #fff;
          padding: 8px 16px;
          border-radius: 8px;
          font-family: var(--ps-mono);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ps-ink-70);
          cursor: pointer;
          transition: border-color 120ms, color 120ms;
        }
        .ob-btn:hover:not(:disabled) {
          border-color: var(--ps-ink);
          color: var(--ps-ink);
        }
        .ob-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .ob-btn-primary {
          background: var(--ps-ink);
          color: var(--ps-bg);
          border-color: var(--ps-ink);
        }
        .ob-btn-primary:hover:not(:disabled) {
          background: #000;
          color: var(--ps-bg);
        }
        @media (max-width: 900px) {
          .ob-app {
            grid-template-columns: 1fr;
          }
          .ob-rail {
            position: static;
            max-height: none;
          }
          .ob-stages {
            flex-direction: row;
            overflow-x: auto;
            flex: 0 0 auto;
          }
          .ob-stage {
            min-width: 180px;
          }
          .ob-canvas {
            padding: 24px 18px 60px;
          }
          .ob-title {
            font-size: 28px;
          }
        }
      `}</style>
    </>
  );
}

