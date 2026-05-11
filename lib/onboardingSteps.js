// Onboarding step engine — declarative configs.
// Each step exposes:
//   id, eyebrow, title, sub, stage     (UI metadata, mode-aware variants supported)
//   defaults                          (initial form state for this step's fields)
//   fromProfile(profile)              (profile JSON -> partial form state)
//   toProfile(state)                  (partial form state -> partial profile JSON)
//   validate(state) -> string[]       (returns array of error messages; empty when valid)
//
// The engine merges defaults / fromProfile across all steps to build the
// total form state, and merges toProfile slices to build the final profile.
//
// `mode` ("new" | "reorient") is passed to the engine and step components
// for copy variation (the same step asks the user different questions
// during first onboarding vs a re-orient pass).

import { getHumanNeedStrategiesState } from "./humanNeedStrategies.js";

export const NEED_KEYS = [
  "certainty",
  "variety",
  "significance",
  "love_connection",
  "growth",
  "contribution",
];

export const NEED_LABELS = {
  certainty: "Certainty",
  variety: "Variety",
  significance: "Significance",
  love_connection: "Love & Connection",
  growth: "Growth",
  contribution: "Contribution",
};

export const NEED_EXAMPLES = {
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

// High-level stages shown in the sidebar rail.
export const STAGES = [
  { id: "destination", idx: "01", label: "Destination", sub: "Identity & vision" },
  { id: "needs", idx: "02", label: "Human needs", sub: "What you need to thrive" },
  { id: "current", idx: "03", label: "Current situation", sub: "Brain dump, resources, constraints" },
  { id: "time", idx: "04", label: "Time & energy", sub: "When you actually work" },
  { id: "action", idx: "05", label: "Strategic focus", sub: "First move" },
];

function emptyNeedsMap() {
  return NEED_KEYS.reduce((acc, k) => ((acc[k] = ""), acc), {});
}

function copyVariants({ baseEyebrow, baseTitle, baseSub, reorientTitle, reorientSub }) {
  return (mode) => ({
    eyebrow: baseEyebrow,
    title: mode === "reorient" && reorientTitle ? reorientTitle : baseTitle,
    sub: mode === "reorient" && reorientSub ? reorientSub : baseSub,
  });
}

// --- Step configs --------------------------------------------------------

const STEP_IDENTITY = {
  id: "identity",
  stage: 0,
  copy: copyVariants({
    baseEyebrow: "Part 01 · Destination",
    baseTitle: "Who are you becoming?",
    baseSub:
      "Identity attributes, the life domains that matter, and 1–3 outcomes that would make the next year count.",
    reorientTitle: "Is this still who you're becoming?",
    reorientSub:
      "Confirm the identity attributes that drive your behavior today. Update or replace what's drifted.",
  }),
  defaults: { identityAttributes: "" },
  fromProfile: (p) => ({
    identityAttributes: (p.identity_attributes || []).join(", "),
  }),
  toProfile: (state) => ({
    identity_attributes: state.identityAttributes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  }),
  validate: (state) => {
    const errors = [];
    if (
      !state.identityAttributes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean).length
    ) {
      errors.push("Add at least one identity phrase.");
    }
    return errors;
  },
};

const STEP_NEEDS_STRATEGIES = {
  id: "needs_strategies",
  stage: 1,
  copy: copyVariants({
    baseEyebrow: "Part 02 · Human needs · Strategies & outcomes",
    baseTitle: "How do you actually thrive?",
    baseSub:
      "For each of the six human needs, name a healthy strategy and a pattern that trips you up.",
    reorientTitle: "Are these still how you thrive?",
    reorientSub:
      "Refine the strategies that have actually been working. Update outcomes that have shifted.",
  }),
  defaults: { lifeDomains: getHumanNeedStrategiesState(), desiredOutcomes: "" },
  fromProfile: (p) => ({
    lifeDomains: getHumanNeedStrategiesState(p),
    desiredOutcomes: (p.desired_outcomes || [])
      .map((o) => o.title || "")
      .filter(Boolean)
      .join("\n"),
  }),
  toProfile: (state) => ({
    life_domains: state.lifeDomains,
    desired_outcomes: state.desiredOutcomes
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((title, idx) => ({ id: `local-${idx}`, title })),
  }),
  validate: (state) => {
    const errors = [];
    const hasLifeDomain = Object.values(state.lifeDomains || {}).some(
      (v) => String(v || "").trim().length > 0
    );
    const hasOutcomes =
      state.desiredOutcomes
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean).length > 0;
    if (!hasLifeDomain && !hasOutcomes) {
      errors.push("Add at least one human need strategy note or one desired outcome.");
    }
    return errors;
  },
};

const STEP_SIX_NEEDS = {
  id: "six_needs",
  stage: 1,
  copy: copyVariants({
    baseEyebrow: "Part 02 · Human needs · Assessment",
    baseTitle: "Score your six human needs.",
    baseSub: "Rate each need on a 1–10 scale. No judgement — just where you are right now.",
    reorientTitle: "Where are the six needs today?",
    reorientSub:
      "Re-score honestly — drift on a need is useful signal. Update the strategy if it's changed.",
  }),
  defaults: {
    humanNeedsScores: emptyNeedsMap(),
    humanNeedsStrategies: emptyNeedsMap(),
    needsRiskPatterns: emptyNeedsMap(),
  },
  fromProfile: (p) => ({
    humanNeedsScores: NEED_KEYS.reduce((acc, k) => {
      const v = p.human_needs_scores?.[k];
      acc[k] = v != null ? String(v) : "";
      return acc;
    }, {}),
    humanNeedsStrategies: NEED_KEYS.reduce((acc, k) => {
      acc[k] = p.human_needs_strategies?.[k] || "";
      return acc;
    }, {}),
    needsRiskPatterns: NEED_KEYS.reduce((acc, k) => {
      acc[k] = p.needs_risk_patterns?.[k] || "";
      return acc;
    }, {}),
  }),
  toProfile: (state) => ({
    human_needs_scores: NEED_KEYS.reduce((acc, k) => {
      const v = Number(state.humanNeedsScores[k]);
      acc[k] = Number.isFinite(v) ? Math.max(1, Math.min(10, v)) : null;
      return acc;
    }, {}),
    human_needs_strategies: { ...state.humanNeedsStrategies },
    needs_risk_patterns: { ...state.needsRiskPatterns },
  }),
  validate: (state) => {
    const errors = [];
    NEED_KEYS.forEach((key) => {
      const score = Number(state.humanNeedsScores[key]);
      if (!Number.isFinite(score) || score < 1 || score > 10) {
        errors.push(`${NEED_LABELS[key]} score must be between 1 and 10.`);
      }
      if (!String(state.humanNeedsStrategies[key] || "").trim()) {
        errors.push(`${NEED_LABELS[key]} needs a current strategy.`);
      }
    });
    return errors;
  },
};

const STEP_BRAIN_DUMP = {
  id: "brain_dump",
  stage: 2,
  copy: copyVariants({
    baseEyebrow: "Part 03 · Current situation",
    baseTitle: "Clear your head, name your resources.",
    baseSub:
      "Dump everything that's rattling around. We'll separate tasks, projects, and ideas — plus what you have to work with and what stands in the way.",
    reorientTitle: "What's on your mind right now?",
    reorientSub:
      "New things that crept in since last time. New resources you've gained. New constraints that opened up.",
  }),
  defaults: {
    brainDumpRaw: "",
    brainDumpTasks: "",
    brainDumpProjects: "",
    brainDumpIdeas: "",
    resources: "",
    constraints: "",
  },
  fromProfile: (p) => ({
    brainDumpRaw: p.brain_dump_raw || "",
    brainDumpTasks: (p.brain_dump_structured?.tasks || []).join("\n"),
    brainDumpProjects: (p.brain_dump_structured?.projects || []).join("\n"),
    brainDumpIdeas: (p.brain_dump_structured?.ideas || []).join("\n"),
    resources: (p.resources || []).join("\n"),
    constraints: (p.constraints || []).join("\n"),
  }),
  toProfile: (state) => {
    const tasks = state.brainDumpTasks
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const projects = state.brainDumpProjects
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const ideas = state.brainDumpIdeas
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const constraints = state.constraints
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      brain_dump_raw: state.brainDumpRaw || "",
      brain_dump_structured: { tasks, projects, ideas, constraints },
      resources: state.resources
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      constraints,
    };
  },
  validate: (state) => {
    const errors = [];
    const hasRaw = String(state.brainDumpRaw || "").trim().length > 0;
    const hasStructured = [
      state.brainDumpTasks,
      state.brainDumpProjects,
      state.brainDumpIdeas,
    ].some((v) => String(v || "").trim().length > 0);
    if (!hasRaw && !hasStructured) {
      errors.push("Add a raw brain dump or at least one structured item.");
    }
    return errors;
  },
};

const STEP_TIME_ENERGY = {
  id: "time_energy",
  stage: 3,
  copy: copyVariants({
    baseEyebrow: "Part 04 · Time & energy",
    baseTitle: "When does the work actually happen?",
    baseSub: "How many focused hours per week, when you're sharpest, and when you need to rest.",
    reorientTitle: "Has your time / energy shifted?",
    reorientSub:
      "Capacity is a moving target. Update to what your last 2–3 weeks have actually looked like.",
  }),
  defaults: {
    availableHours: "",
    bestTimeOfDay: "",
    lowEnergyTimes: "",
  },
  fromProfile: (p) => ({
    availableHours:
      p.available_hours_per_week != null ? String(p.available_hours_per_week) : "",
    bestTimeOfDay: p.energy_profile?.best_time_of_day || "",
    lowEnergyTimes: (p.energy_profile?.low_energy_times || []).join(", "),
  }),
  toProfile: (state) => ({
    available_hours_per_week: state.availableHours
      ? Number(state.availableHours)
      : null,
    energy_profile: {
      best_time_of_day: state.bestTimeOfDay || null,
      low_energy_times: state.lowEnergyTimes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    },
  }),
  validate: (state) => {
    const errors = [];
    if (String(state.availableHours || "").trim()) {
      const hours = Number(state.availableHours);
      if (!Number.isFinite(hours) || hours < 0 || hours > 168) {
        errors.push("Available hours per week must be between 0 and 168.");
      }
    }
    return errors;
  },
};

const STEP_FOCUS = {
  id: "focus",
  stage: 4,
  copy: copyVariants({
    baseEyebrow: "Part 05 · Strategic focus",
    baseTitle: "Pick the focus. Name the first move.",
    baseSub:
      "Pick a top 3 to focus on this quarter, and the single smallest action you could take today.",
    reorientTitle: "Re-pick your focus and your next move.",
    reorientSub:
      "What 3 priorities deserve this quarter? What's the one bite-sized action that breaks the inertia?",
  }),
  defaults: {
    leverageFocus: "",
    quarterFocus: "",
    immediateStep: "",
  },
  fromProfile: (p) => ({
    leverageFocus: (p.leverage_focus || []).join("\n"),
    quarterFocus: (p.quarter_focus || []).join(", "),
    immediateStep: p.immediate_step || "",
  }),
  toProfile: (state) => ({
    leverage_focus: state.leverageFocus
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    quarter_focus: state.quarterFocus
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    immediate_step: state.immediateStep || "",
  }),
  validate: (state) => {
    const errors = [];
    const hasFocus =
      String(state.leverageFocus || "").trim().length > 0 ||
      String(state.quarterFocus || "").trim().length > 0 ||
      String(state.immediateStep || "").trim().length > 0;
    if (!hasFocus) {
      errors.push("Add at least one strategic focus item or an immediate step.");
    }
    return errors;
  },
};

export const ONBOARDING_STEPS = [
  STEP_IDENTITY,
  STEP_NEEDS_STRATEGIES,
  STEP_SIX_NEEDS,
  STEP_BRAIN_DUMP,
  STEP_TIME_ENERGY,
  STEP_FOCUS,
];

// ---- Helpers used by the engine ---------------------------------------

/**
 * Build initial form state for the engine: merge each step's defaults,
 * then overlay any values loaded from the profile.
 */
export function buildInitialFormState(profile) {
  const state = {};
  for (const step of ONBOARDING_STEPS) {
    Object.assign(state, step.defaults);
  }
  if (profile) {
    for (const step of ONBOARDING_STEPS) {
      Object.assign(state, step.fromProfile(profile));
    }
  }
  return state;
}

/**
 * Build the full profile JSON from the current form state by merging
 * each step's toProfile slice.
 */
export function buildProfileFromState(state, userId) {
  const profile = { user_id: userId };
  for (const step of ONBOARDING_STEPS) {
    Object.assign(profile, step.toProfile(state));
  }
  // Field is referenced on the strategies step but the canonical
  // life_domains shape lives at the top of the profile.
  return profile;
}

/**
 * Run validation across all steps. Returns flat array of errors.
 */
export function validateAllSteps(state) {
  return ONBOARDING_STEPS.flatMap((step) => step.validate(state));
}

/**
 * Get step config + resolved copy for the given index and mode.
 */
export function getStep(index, mode = "new") {
  const step = ONBOARDING_STEPS[index];
  if (!step) return null;
  return { ...step, ...step.copy(mode) };
}

export const STEP_COUNT = ONBOARDING_STEPS.length;
