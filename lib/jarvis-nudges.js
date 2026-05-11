// Jarvis nudge detection system
// Checks for conditions worth surfacing proactively

import { createClient } from "@supabase/supabase-js";
import { TIMEZONE } from "./scoring.js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function getMonday(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * Detect all nudge-worthy conditions for a user.
 * Returns an array of nudge objects, sorted by priority.
 * @param {string} userId
 * @returns {Promise<Array<{type: string, priority: number, message: string, data: object}>>}
 */
export async function detectNudges(userId) {
  const today = todayStr();
  const nudges = [];

  const [
    queueResult,
    overdueResult,
    streakResult,
    staleDoingResult,
    weeklyReviewResult,
    recentChatResult,
  ] = await Promise.all([
    checkQueueStatus(userId, today),
    checkOverdueTasks(userId, today),
    checkStreak(userId, today),
    checkStaleDoing(userId),
    checkWeeklyReview(userId, today),
    checkRecentChat(userId, today),
  ]);

  if (queueResult) nudges.push(queueResult);
  if (overdueResult) nudges.push(overdueResult);
  if (streakResult) nudges.push(streakResult);
  if (staleDoingResult) nudges.push(staleDoingResult);
  if (weeklyReviewResult) nudges.push(weeklyReviewResult);

  // Sort by priority (lower number = higher priority)
  nudges.sort((a, b) => a.priority - b.priority);

  return {
    nudges,
    has_nudges: nudges.length > 0,
    checked_at: new Date().toISOString(),
    has_chatted_today: recentChatResult,
  };
}

async function checkQueueStatus(userId, today) {
  const { data: plan } = await supabase
    .from("daily_plans")
    .select("queue")
    .eq("user_id", userId)
    .eq("date", today)
    .maybeSingle();

  if (!plan || !plan.queue || plan.queue.length === 0) {
    return {
      type: "no_queue",
      priority: 1,
      message: "Your Next-3 queue isn't set up for today yet.",
      data: {},
    };
  }

  // Check if all 3 are completed
  const taskIds = plan.queue.map((q) => q.task_id).filter(Boolean);
  if (taskIds.length > 0) {
    const { data: events } = await supabase
      .from("task_events")
      .select("task_id")
      .eq("user_id", userId)
      .eq("event_type", "completed")
      .in("task_id", taskIds)
      .gte("created_at", `${today}T00:00:00`);

    const completedSet = new Set((events || []).map((e) => e.task_id));
    const allDone = taskIds.every((id) => completedSet.has(id));
    if (allDone) {
      return {
        type: "queue_complete",
        priority: 5,
        message: "You crushed your Next-3 today! Want to refill or call it a win?",
        data: { completed_count: taskIds.length },
      };
    }
  }

  return null;
}

async function checkOverdueTasks(userId, today) {
  const { count, error } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["todo", "doing"])
    .lt("due_date", today);

  if (error || !count || count === 0) return null;

  return {
    type: "overdue",
    priority: 2,
    message: `You have ${count} overdue task${count > 1 ? "s" : ""} that need attention.`,
    data: { count },
  };
}

async function checkStreak(userId, today) {
  // Check if yesterday had completions (streak maintenance)
  const yesterday = daysAgo(1);
  const { count: yesterdayCount } = await supabase
    .from("task_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_type", "completed")
    .gte("created_at", `${yesterday}T00:00:00`)
    .lte("created_at", `${yesterday}T23:59:59`);

  const { count: todayCount } = await supabase
    .from("task_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_type", "completed")
    .gte("created_at", `${today}T00:00:00`);

  // Calculate current streak
  let streak = 0;
  if (todayCount > 0) streak++; // today counts
  let d = new Date(yesterday);
  for (let i = 0; i < 30; i++) {
    const ds = d.toISOString().slice(0, 10);
    const { count } = await supabase
      .from("task_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event_type", "completed")
      .gte("created_at", `${ds}T00:00:00`)
      .lte("created_at", `${ds}T23:59:59`);
    if (count > 0) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  if (streak >= 3 && todayCount === 0) {
    return {
      type: "streak_at_risk",
      priority: 3,
      message: `You're on a ${streak}-day streak! Complete a task today to keep it going.`,
      data: { streak, today_completions: 0 },
    };
  }

  if (streak >= 7) {
    return {
      type: "streak_strong",
      priority: 8,
      message: `${streak}-day streak and counting. Nice consistency.`,
      data: { streak, today_completions: todayCount },
    };
  }

  return null;
}

async function checkStaleDoing(userId) {
  const threeDaysAgo = daysAgo(3);
  const { data: staleTasks, error } = await supabase
    .from("tasks")
    .select("id, title")
    .eq("user_id", userId)
    .eq("status", "doing")
    .lt("updated_at", `${threeDaysAgo}T00:00:00`)
    .limit(5);

  if (error || !staleTasks || staleTasks.length === 0) return null;

  return {
    type: "stale_doing",
    priority: 4,
    message: `${staleTasks.length} task${staleTasks.length > 1 ? "s have" : " has"} been "in progress" for 3+ days without updates.`,
    data: { tasks: staleTasks.map((t) => ({ id: t.id, title: t.title })) },
  };
}

async function checkWeeklyReview(userId, today) {
  const dayOfWeek = new Date(today).getDay(); // 0=Sun, 6=Sat
  // Nudge on Friday (5), Saturday (6), Sunday (0)
  if (dayOfWeek !== 0 && dayOfWeek !== 5 && dayOfWeek !== 6) return null;

  const weekStart = getMonday(today);
  const { data: review } = await supabase
    .from("human_needs_weekly")
    .select("id")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (review) return null; // Already done this week

  return {
    type: "weekly_review_due",
    priority: 3,
    message: "Time for your weekly review. Want me to walk you through it?",
    data: { week_start: weekStart },
  };
}

async function checkRecentChat(userId, today) {
  const { count } = await supabase
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "user")
    .gte("created_at", `${today}T00:00:00`);

  return (count || 0) > 0;
}
