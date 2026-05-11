// /reorient — Phase A (user-level pass) of the Reorient flow.
//
// Walks the user through the same 6 onboarding steps in delta mode:
// inputs are pre-filled from the saved profile, copy variants ask
// "is this still right?" instead of "fill this in," and Complete
// stamps `preferences.last_reorient_at` and returns to /today.
//
// Phase B (per-project pass) ships in a follow-up PR and is launched
// from /today's Reorient card after Phase A completes.

import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { getUserProfile, upsertUserProfile } from "../lib/db";
import OnboardingEngine from "../components/OnboardingEngine";

export default function ReorientPage() {
  const { user, isCheckingAuth } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      setLoadingProfile(true);
      const res = await getUserProfile(user.id);
      if (cancelled) return;
      setProfile(!res.error && res.data?.profile ? res.data.profile : null);
      setLoadingProfile(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleSaveDraft(builtProfile) {
    // In reorient mode we layer the engine's edits on top of the existing
    // profile rather than replacing it — the engine only owns onboarding
    // fields, but the profile also contains preferences, project_workspaces,
    // vision_field_images, etc. that must be preserved.
    const merged = { ...(profile || {}), ...builtProfile };
    const res = await upsertUserProfile(user.id, merged);
    return res;
  }

  async function handleComplete(builtProfile) {
    const existingPrefs = profile?.preferences || {};
    const merged = {
      ...(profile || {}),
      ...builtProfile,
      preferences: {
        ...existingPrefs,
        last_reorient_at: new Date().toISOString(),
      },
    };
    const res = await upsertUserProfile(user.id, merged);
    if (res?.error) return res;

    // No first-task seed, no human_needs_weekly seed. Reorient is on-demand
    // re-alignment for a user who's already past onboarding; both side effects
    // are first-run-only.

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "rs-reorient-just-completed",
        new Date().toISOString()
      );
      window.location.href = "/today";
    }
    return { error: null };
  }

  return (
    <OnboardingEngine
      userId={user?.id}
      initialProfile={profile}
      mode="reorient"
      loadingInitial={isCheckingAuth || !user || loadingProfile}
      onSaveDraft={handleSaveDraft}
      onComplete={handleComplete}
      // No onSkip — reorient is on-demand; if you don't want to do it,
      // just close the tab. Same destination either way.
    />
  );
}
