// Onboarding step components. Each component is "dumb" — receives the
// engine's form state and a setter, renders the UI for its slice.
//
// Props:
//   state: full form state (engine merges all step defaults + fromProfile)
//   setState: (updater | partial) => void  patch-style setter
//   mode: "new" | "reorient"               passed through for future copy variants

import {
  HUMAN_NEED_STRATEGY_KEYS,
  HUMAN_NEED_STRATEGY_EXAMPLES,
  getHumanNeedStrategyLabel,
} from "../lib/humanNeedStrategies";
import { NEED_KEYS, NEED_LABELS, NEED_EXAMPLES } from "../lib/onboardingSteps";

// --- shared inline-style fragments (kept verbatim from original onboarding) ---

const tipBoxStyle = {
  fontSize: 12,
  color: "#374151",
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 8,
  marginBottom: 10,
};
const labelStyle = {
  fontSize: 12,
  color: "#4b5563",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};
const textareaStyle = {
  fontSize: 13,
  padding: 8,
  borderRadius: 8,
  border: "1px solid #e5e7eb",
};
const inputStyle = {
  fontSize: 13,
  padding: 6,
  borderRadius: 6,
  border: "1px solid #e5e7eb",
};

function patch(setState, partial) {
  setState((prev) => ({ ...prev, ...partial }));
}
function patchNested(setState, key, child) {
  setState((prev) => ({ ...prev, [key]: { ...prev[key], ...child } }));
}

// --- Step 0: Identity & vision -------------------------------------------

export function IdentityStep({ state, setState }) {
  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>
        Identity & vision
      </h2>
      <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 10px" }}>
        Imagine yourself three years from now. What kind of person are you?
        Use short identity phrases separated by commas.
      </p>
      <div style={tipBoxStyle}>
        Tip: pick identity words that drive behavior today (&quot;I close loops&quot;, &quot;I protect focus&quot;).
      </div>
      <textarea
        value={state.identityAttributes}
        onChange={(e) => patch(setState, { identityAttributes: e.target.value })}
        rows={3}
        placeholder="Calm operator, Creative builder, Present parent…"
        style={{ width: "100%", ...textareaStyle }}
      />
    </>
  );
}

// --- Step 1: Human Need Strategies & outcomes ----------------------------

export function NeedsStrategiesStep({ state, setState }) {
  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>
        Human Need Strategies & outcomes
      </h2>
      <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 10px" }}>
        Short working statements for each human need strategy, plus key outcomes you
        want in the next 12 months.
      </p>
      <div style={tipBoxStyle}>
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
          <label key={key} style={labelStyle}>
            <span>{getHumanNeedStrategyLabel(key)}</span>
            <textarea
              value={state.lifeDomains?.[key] || ""}
              onChange={(e) =>
                patchNested(setState, "lifeDomains", { [key]: e.target.value })
              }
              rows={2}
              placeholder={HUMAN_NEED_STRATEGY_EXAMPLES[key] || ""}
              style={{ fontSize: 13, padding: 6, borderRadius: 6, border: "1px solid #e5e7eb" }}
            />
          </label>
        ))}
      </div>
      <label style={labelStyle}>
        Desired outcomes (one per line)
        <textarea
          value={state.desiredOutcomes}
          onChange={(e) => patch(setState, { desiredOutcomes: e.target.value })}
          rows={3}
          placeholder="Launch a profitable consulting service&#10;Lose 25 pounds…"
          style={textareaStyle}
        />
      </label>
    </>
  );
}

// --- Step 2: Six human needs assessment ----------------------------------

export function SixNeedsStep({ state, setState }) {
  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>
        Six human needs assessment
      </h2>
      <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 10px" }}>
        Rate each need (1–10), how you currently meet it, and any unhelpful patterns.
      </p>
      <div style={tipBoxStyle}>
        Tip: write concrete behaviors (what you actually do) rather than ideals.
        Example: &quot;I get certainty from a strict morning routine.&quot;
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {NEED_KEYS.map((key) => (
          <div key={key} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              {NEED_LABELS[key]}
            </div>
            <div
              style={{
                display: "grid",
                gap: 8,
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              }}
            >
              <label style={labelStyle}>
                Score (1-10)
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={state.humanNeedsScores?.[key] || ""}
                  onChange={(e) =>
                    patchNested(setState, "humanNeedsScores", { [key]: e.target.value })
                  }
                  style={{ ...inputStyle, maxWidth: 90 }}
                />
              </label>
              <label style={labelStyle}>
                Current strategy
                <input
                  type="text"
                  value={state.humanNeedsStrategies?.[key] || ""}
                  onChange={(e) =>
                    patchNested(setState, "humanNeedsStrategies", { [key]: e.target.value })
                  }
                  placeholder={NEED_EXAMPLES[key].strategy}
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                Unhelpful pattern (optional)
                <input
                  type="text"
                  value={state.needsRiskPatterns?.[key] || ""}
                  onChange={(e) =>
                    patchNested(setState, "needsRiskPatterns", { [key]: e.target.value })
                  }
                  placeholder={NEED_EXAMPLES[key].risk}
                  style={inputStyle}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// --- Step 3: Brain dump, resources, constraints --------------------------

export function BrainDumpStep({ state, setState }) {
  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>
        Brain dump, resources, and constraints
      </h2>
      <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 10px" }}>
        Capture everything on your mind, then structure it for tasks/projects/ideas.
      </p>
      <div style={tipBoxStyle}>
        Brain dump prompt: &quot;What is taking up mental space right now?&quot; Then sort items:
        tasks (single actions), projects (multi-step), ideas (someday/maybe).
      </div>
      <label style={{ ...labelStyle, marginBottom: 8 }}>
        Brain dump (raw)
        <textarea
          value={state.brainDumpRaw}
          onChange={(e) => patch(setState, { brainDumpRaw: e.target.value })}
          rows={4}
          placeholder="Everything swirling in your head: obligations, worries, ideas, errands, open loops…"
          style={textareaStyle}
        />
      </label>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <label style={labelStyle}>
          Structured tasks (one per line)
          <textarea
            value={state.brainDumpTasks}
            onChange={(e) => patch(setState, { brainDumpTasks: e.target.value })}
            rows={4}
            placeholder="Call dentist&#10;Submit March invoices"
            style={textareaStyle}
          />
        </label>
        <label style={labelStyle}>
          Structured projects (one per line)
          <textarea
            value={state.brainDumpProjects}
            onChange={(e) => patch(setState, { brainDumpProjects: e.target.value })}
            rows={4}
            placeholder="Website redesign&#10;Family summer trip plan"
            style={textareaStyle}
          />
        </label>
        <label style={labelStyle}>
          Structured ideas (one per line)
          <textarea
            value={state.brainDumpIdeas}
            onChange={(e) => patch(setState, { brainDumpIdeas: e.target.value })}
            rows={4}
            placeholder="Podcast concept: mornings for makers&#10;Experiment with 4-day deep-work week"
            style={textareaStyle}
          />
        </label>
      </div>
      <label style={{ ...labelStyle, marginBottom: 8 }}>
        Resources (one per line)
        <textarea
          value={state.resources}
          onChange={(e) => patch(setState, { resources: e.target.value })}
          rows={3}
          placeholder="Supportive partner&#10;$3k runway&#10;Contractor availability"
          style={textareaStyle}
        />
      </label>
      <label style={labelStyle}>
        Constraints (one per line)
        <textarea
          value={state.constraints}
          onChange={(e) => patch(setState, { constraints: e.target.value })}
          rows={3}
          placeholder="School pickup 3pm daily&#10;Low energy after 8pm"
          style={textareaStyle}
        />
      </label>
    </>
  );
}

// --- Step 4: Time & energy ----------------------------------------------

export function TimeEnergyStep({ state, setState }) {
  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>
        Time & energy
      </h2>
      <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 10px" }}>
        This shapes how aggressively the planner schedules your work.
      </p>
      <div style={tipBoxStyle}>
        Be realistic, not aspirational. Planner quality improves when this reflects your normal week.
        Example: if you usually get 8 focused hours, enter 8 (not your ideal 20).
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 8,
        }}
      >
        <label style={{ ...labelStyle, marginBottom: 8 }}>
          Available hours per week
          <input
            type="number"
            min={0}
            value={state.availableHours}
            onChange={(e) => patch(setState, { availableHours: e.target.value })}
            placeholder="12"
            style={{ ...inputStyle, maxWidth: 120 }}
          />
        </label>
        <label style={{ ...labelStyle, marginBottom: 8 }}>
          Best time of day for deep work
          <input
            type="text"
            value={state.bestTimeOfDay}
            onChange={(e) => patch(setState, { bestTimeOfDay: e.target.value })}
            placeholder="e.g. 5–7am"
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Low-energy times (comma separated)
          <input
            type="text"
            value={state.lowEnergyTimes}
            onChange={(e) => patch(setState, { lowEnergyTimes: e.target.value })}
            placeholder="e.g. late evening, mid-afternoon"
            style={inputStyle}
          />
        </label>
      </div>
    </>
  );
}

// --- Step 5: Strategic focus --------------------------------------------

export function FocusStep({ state, setState }) {
  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>
        Strategic focus
      </h2>
      <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 10px" }}>
        Capture leverage areas, quarter focus, and one immediate step.
      </p>
      <div style={tipBoxStyle}>
        Pick leverage points where a small effort compounds (systems, recurring assets, delegation). Example: &quot;Build one reusable sales script&quot; beats &quot;work harder.&quot;
      </div>
      <label style={{ ...labelStyle, marginBottom: 8 }}>
        Leverage areas (one per line)
        <textarea
          value={state.leverageFocus}
          onChange={(e) => patch(setState, { leverageFocus: e.target.value })}
          rows={3}
          placeholder="Automate lead follow-up&#10;Weekly planning review ritual&#10;Delegate bookkeeping"
          style={textareaStyle}
        />
      </label>
      <label style={{ ...labelStyle, marginBottom: 8 }}>
        Top three priorities this quarter (comma separated)
        <input
          type="text"
          value={state.quarterFocus}
          onChange={(e) => patch(setState, { quarterFocus: e.target.value })}
          placeholder="Pipeline quality, Debt payoff, Strength training"
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        Immediate step
        <textarea
          value={state.immediateStep}
          onChange={(e) => patch(setState, { immediateStep: e.target.value })}
          rows={2}
          placeholder="Block 45 minutes today to draft the offer page."
          style={textareaStyle}
        />
      </label>
    </>
  );
}

// Step components in order, indexed by ONBOARDING_STEPS.
export const STEP_COMPONENTS = [
  IdentityStep,
  NeedsStrategiesStep,
  SixNeedsStep,
  BrainDumpStep,
  TimeEnergyStep,
  FocusStep,
];
