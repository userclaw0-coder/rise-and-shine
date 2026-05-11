import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import {
  getUserProfile,
  upsertUserProfile,
  upsertWeeklyReview,
  createTask,
} from "../lib/db";
import OnboardingEngine from "../components/OnboardingEngine";

/** Monday of current week, YYYY-MM-DD (for human_needs_weekly baseline). */
function getCurrentWeekStart() {
  const d = new Date();
  const day = d.getUTCDay() || 7;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - (day - 1));
  return monday.toISOString().slice(0, 10);
}

export default function OnboardingPage() {
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
    const res = await upsertUserProfile(user.id, builtProfile);
    return res;
  }

  async function handleComplete(builtProfile) {
    const res = await upsertUserProfile(user.id, builtProfile);
    if (res?.error) return res;

    // Seed human_needs_weekly with this week's baseline so weekly review has
    // onboarding scores. Field name shifts: love_connection -> connection.
    const weekStart = getCurrentWeekStart();
    const scoresForWeekly = { ...(builtProfile.human_needs_scores || {}) };
    if (scoresForWeekly.love_connection != null) {
      scoresForWeekly.connection = scoresForWeekly.love_connection;
      delete scoresForWeekly.love_connection;
    }
    await upsertWeeklyReview(user.id, weekStart, { scores: scoresForWeekly });

    // Seed first task from immediate step (per ONBOARDING_FLOW).
    const createdFirstTask = Boolean(String(builtProfile.immediate_step || "").trim());
    if (createdFirstTask) {
      await createTask(user.id, {
        title: builtProfile.immediate_step.trim(),
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
    return { error: null };
  }

  function handleSkip() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("rs-onboarding-later", "1");
      window.location.href = "/today";
    }
  }

  return (
    <OnboardingEngine
      userId={user?.id}
      initialProfile={profile}
      mode="new"
      loadingInitial={isCheckingAuth || !user || loadingProfile}
      onSaveDraft={handleSaveDraft}
      onComplete={handleComplete}
      onSkip={handleSkip}
    />
  );
}
