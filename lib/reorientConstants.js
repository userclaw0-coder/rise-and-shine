// Browser-safe constants for the Reorient flow.
// Separated from lib/reorientFlow.js because the wizard imports these and
// the flow file pulls in the service-role Supabase client at module load,
// which must never reach the browser.

export const REORIENT_PHASES = [
  { value: "immediate", label: "Immediate", sub: "today / 24h" },
  { value: "this_week", label: "This week", sub: "≤ 7 days" },
  { value: "next_2w", label: "Next 2w", sub: "8–14 days" },
  { value: "next_30d", label: "Next 30d", sub: "this month" },
  { value: "ongoing", label: "Ongoing", sub: "recurring" },
  { value: "blocked", label: "Blocked", sub: "waiting" },
  { value: "someday", label: "Someday", sub: "parked" },
];

export const REORIENT_MODES = [
  { value: "pushing", label: "Pushing hard" },
  { value: "steady", label: "Steady progress" },
  { value: "maintenance", label: "Maintenance" },
  { value: "paused", label: "Paused" },
];

export const STALE_THRESHOLD_DAYS = 30;
