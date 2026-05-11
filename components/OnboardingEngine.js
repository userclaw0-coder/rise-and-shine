// Onboarding step engine — generic chrome + state for new-user onboarding
// and the returning-user Reorient pass.
//
// Props:
//   userId             user UUID (used to build the profile)
//   initialProfile     profile JSON (optional; null on a true new-user run)
//   mode               "new" | "reorient" — drives copy variants
//   loadingInitial     when true, render a loading view
//   onSaveDraft        async (profile) => { error? } — Save draft button
//   onComplete         async (profile) => { error? } — Complete button (last step)
//   onSkip             () => void — Skip-for-now link
//
// The engine owns the form state, the step index, validation, error
// display, and the styled chrome. Step JSX lives in STEP_COMPONENTS.

import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import {
  ONBOARDING_STEPS,
  STAGES,
  STEP_COUNT,
  buildInitialFormState,
  buildProfileFromState,
  getStep,
  validateAllSteps,
} from "../lib/onboardingSteps";
import { STEP_COMPONENTS } from "./OnboardingSteps";

export default function OnboardingEngine({
  userId,
  initialProfile,
  mode = "new",
  loadingInitial = false,
  onSaveDraft,
  onComplete,
  onSkip,
}) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState(() => buildInitialFormState(null));
  const [hasHydrated, setHasHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");
  const [stepErrors, setStepErrors] = useState([]);

  // Hydrate form state from the loaded profile exactly once it's available.
  useEffect(() => {
    if (loadingInitial || hasHydrated) return;
    setState(buildInitialFormState(initialProfile));
    setHasHydrated(true);
  }, [loadingInitial, hasHydrated, initialProfile]);

  // Clear step-level errors when navigating between steps.
  useEffect(() => {
    setStepErrors([]);
  }, [step]);

  const currentStep = useMemo(() => getStep(step, mode), [step, mode]);
  const StepComponent = STEP_COMPONENTS[step];
  const activeStage = currentStep?.stage ?? 0;
  const progress = ((step + 1) / STEP_COUNT) * 100;

  function validateCurrentStep() {
    const errors = ONBOARDING_STEPS[step].validate(state);
    setStepErrors(errors);
    return errors.length === 0;
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const profile = buildProfileFromState(state, userId);
      const res = await onSaveDraft?.(profile);
      if (res?.error) {
        setError(res.error.message || res.error || "Failed to save profile.");
      } else {
        setSavedMsg("Saved. You can adjust this anytime.");
        setTimeout(() => setSavedMsg(""), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete() {
    setError("");
    const allErrors = validateAllSteps(state);
    if (allErrors.length > 0) {
      setStepErrors(allErrors);
      setError("Please fix the onboarding validation items before completing.");
      return;
    }
    setSaving(true);
    try {
      const profile = buildProfileFromState(state, userId);
      const res = await onComplete?.(profile);
      if (res?.error) {
        setError(res.error.message || res.error || "Failed to save profile.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loadingInitial || !hasHydrated) {
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

  const isLastStep = step === STEP_COUNT - 1;
  const railTitle = mode === "reorient" ? "Reorienting" : "Setting up";

  return (
    <>
      <Head>
        <title>
          {mode === "reorient" ? "Reorient" : "Onboarding"} · Rise &amp; Shine
        </title>
      </Head>
      <div className="ob-app">
        <aside className="ob-rail">
          <div className="ob-brand">
            <div className="ob-brand-mark">r</div>
            <div>
              <div className="ob-brand-title">Rise &amp; Shine</div>
              <div className="ob-brand-sub">{railTitle}</div>
            </div>
          </div>

          <div className="ob-stages">
            {STAGES.map((s, i) => (
              <div
                key={s.id}
                className={
                  "ob-stage" +
                  (i === activeStage ? " active" : i < activeStage ? " done" : "")
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

          {onSkip && (
            <div className="ob-rail-foot">
              <button type="button" className="ob-skip-link" onClick={onSkip}>
                Skip for now →
              </button>
            </div>
          )}
        </aside>

        <main className="ob-canvas">
          <div className="ob-content">
            <div className="ob-progress-wrap">
              <div className="ob-progress-meta">
                <span>
                  Step {step + 1} of {STEP_COUNT}
                </span>
                {savedMsg && <span className="ob-saved">{savedMsg}</span>}
              </div>
              <div className="ob-progress-bar">
                <div
                  className="ob-progress-fill"
                  style={{ width: progress + "%" }}
                />
              </div>
            </div>

            <div className="ob-eyebrow">{currentStep.eyebrow}</div>
            <h1 className="ob-title">{currentStep.title}</h1>
            <p className="ob-sub">{currentStep.sub}</p>

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

            <div className="ob-step-card">
              <StepComponent state={state} setState={setState} mode={mode} />
            </div>

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
                    if (isLastStep) return;
                    setError("");
                    if (!validateCurrentStep()) return;
                    setStep((s) => Math.min(STEP_COUNT - 1, s + 1));
                  }}
                  disabled={isLastStep}
                >
                  Next →
                </button>
              </div>
              <div className="ob-nav-right">
                {onSaveDraft && (
                  <button
                    type="button"
                    className="ob-btn"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Save draft"}
                  </button>
                )}
                <button
                  type="button"
                  className="ob-btn ob-btn-primary"
                  onClick={handleComplete}
                  disabled={saving || !isLastStep}
                >
                  {isLastStep
                    ? mode === "reorient"
                      ? "Complete → Today"
                      : "Complete → Today"
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
