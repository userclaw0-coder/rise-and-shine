#!/usr/bin/env node
// Round-trip test for the onboarding refactor:
//   1. Load Tom's real user profile from Supabase
//   2. Run it through buildInitialFormState (profile -> form state)
//   3. Run that through buildProfileFromState (form state -> profile)
//   4. Diff the result against the original profile
//
// We expect the round-trip to produce a profile with the same fields
// the refactor knows about. Fields not handled by any step (e.g.
// preferences, project_workspaces, vision_field_images) are preserved
// outside the refactor's scope and should NOT appear in the rebuilt
// profile — that's correct: the engine only owns the onboarding fields.

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

import { createClient } from "@supabase/supabase-js";
import {
  buildInitialFormState,
  buildProfileFromState,
  validateAllSteps,
} from "../lib/onboardingSteps.js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const USER_ID = "4635828b-46c0-4737-b1bb-1d3082864e33"; // tom

function pickOnboardingFields(profile) {
  // Fields owned by the onboarding engine (across all 6 steps).
  const owned = [
    "identity_attributes",
    "life_domains",
    "desired_outcomes",
    "human_needs_scores",
    "human_needs_strategies",
    "needs_risk_patterns",
    "brain_dump_raw",
    "brain_dump_structured",
    "resources",
    "constraints",
    "available_hours_per_week",
    "energy_profile",
    "leverage_focus",
    "quarter_focus",
    "immediate_step",
  ];
  const out = {};
  for (const k of owned) out[k] = profile[k];
  return out;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a == b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

function findDiffs(a, b, path = "") {
  const diffs = [];
  if (deepEqual(a, b)) return diffs;
  if (typeof a !== "object" || typeof b !== "object" || a == null || b == null) {
    diffs.push({ path, a, b });
    return diffs;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    diffs.push(...findDiffs(a[k], b[k], path ? `${path}.${k}` : k));
  }
  return diffs;
}

async function main() {
  console.log("\n=== Onboarding refactor round-trip ===\n");

  const { data, error } = await supabase
    .from("user_profile")
    .select("profile")
    .eq("user_id", USER_ID)
    .maybeSingle();
  if (error) {
    console.error("Failed to load profile:", error.message);
    process.exit(1);
  }
  const profile = data?.profile;
  if (!profile) {
    console.error("No profile found for user.");
    process.exit(1);
  }

  // Round-trip
  const formState = buildInitialFormState(profile);
  const rebuilt = buildProfileFromState(formState, USER_ID);

  // Compare only onboarding-owned fields.
  const originalOwned = pickOnboardingFields(profile);
  const rebuiltOwned = pickOnboardingFields(rebuilt);

  // The rebuilt profile re-numbers outcome ids (local-0, local-1, ...).
  // Normalize before comparing.
  function normalizeOutcomes(p) {
    if (!Array.isArray(p.desired_outcomes)) return p;
    return {
      ...p,
      desired_outcomes: p.desired_outcomes.map((o) => ({ title: o.title })),
    };
  }
  const normalizedOriginal = normalizeOutcomes(originalOwned);
  const normalizedRebuilt = normalizeOutcomes(rebuiltOwned);

  const diffs = findDiffs(normalizedOriginal, normalizedRebuilt);
  if (diffs.length === 0) {
    console.log("✓ Round-trip produces equivalent profile (after outcome-id normalization).\n");
  } else {
    console.log(`✗ Found ${diffs.length} field differences:\n`);
    for (const d of diffs.slice(0, 30)) {
      console.log(`  ${d.path}:`);
      console.log(`    original: ${JSON.stringify(d.a)?.slice(0, 100)}`);
      console.log(`    rebuilt : ${JSON.stringify(d.b)?.slice(0, 100)}`);
    }
    if (diffs.length > 30) console.log(`  ... +${diffs.length - 30} more`);
  }

  // Validation should pass on a real, completed profile.
  const errors = validateAllSteps(formState);
  if (errors.length === 0) {
    console.log("✓ validateAllSteps passes on existing profile.\n");
  } else {
    console.log(`✗ validateAllSteps reports ${errors.length} errors on existing profile:`);
    for (const e of errors.slice(0, 10)) console.log(`    - ${e}`);
  }

  process.exit(diffs.length === 0 && errors.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
