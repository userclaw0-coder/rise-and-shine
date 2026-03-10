// Packet 63: AI Planner re-entry decision bundle — when to keep working, quick revisit, or full rerun; lightest next step
// Packet 65: AI Planner post-apply confidence bundle — what stayed the same, planner can wait, trustworthy at a glance
// Packet 66: AI Planner keep-moving-without-recheck bundle — one coherent treatment: next-step momentum, planner-can-wait, revisit threshold
// Packet 67: AI Planner progress-without-recheck bundle — progress loop: keep-going cues, revisit triggers, quick progress-check orientation
// Packet 68: AI Planner progress-check and re-entry bundle — compact progress cues, continue-vs-pause confidence, clearer re-entry thresholds; one-glance after-apply loop
// Packet 69: AI Planner steady-progress and rerun-readiness bundle — one coherent layer: steady progress signs, pause-vs-continue confidence, revisit vs full rerun; decisive at a glance
const KEEP_MOVING_LEAD =
  "Keep moving — no need to recheck the planner now. Your best next step is clear; the planner can wait.";
const APPLIED_KEEP_WORKING =
  "Keep working: your best move is from the updated plan. Pick the next task in your queue and keep going — no need to review every remaining suggestion or run Refine again. Lightest step: work your Next 3.";
const APPLIED_QUICK_REVISIT =
  "Quick revisit: if one remaining suggestion clearly helps, a quick look on a short break later today is enough. The rest can wait until another day — you don't need to clear every card today. Lightest step: optionally peek at one suggestion later, or ignore.";
const APPLIED_WHEN_FULL_RERUN_WORTH_IT =
  "When a full planner run is worth it: run \"Refine these 3 with AI\" when you've done a chunk of work, your Next 3 has changed, or you want a fresh set. Right after one apply, another run is unnecessary — your plan is already updated; reopening the planner now would be an interruption. Lightest step: don't run Refine now.";
const APPLIED_STAY_IN_MOTION =
  "Stay in motion: your queue is updated. Work your Next 3; the planner is there whenever you want another pass, but you don't need one to keep today moving — so you can keep going without feeling trapped in repeated planner loops.";
// Packet 67: progress loop — how to tell you're still on track without reopening
const PROGRESS_CHECK_ORIENTATION =
  "You're still on track if you're working from your updated Next 3, you've applied one change and are doing the next task, and nothing has made your plan feel wrong. No need to reopen the planner to verify — your queue is updated and today is moving.";
const PROGRESS_SIGNALS_KEEP_GOING =
  "Keep going when: you're working your Next 3; you know your next task; you're not stuck.";
const PROGRESS_SIGNALS_REVISIT_LATER =
  "Consider a quick revisit later when: one remaining suggestion clearly helps and you have a short break; you've done a chunk and want to peek at one more. Right now, keep going.";
const REVISIT_TRIGGERS_WORTH_IT =
  "Revisit is worth it when: you've done a chunk of work and one remaining suggestion still fits; your Next 3 has changed and you want a fresh set; you're on a short break and one suggestion would help.";
const REVISIT_TRIGGERS_NOT_NEEDED =
  "Revisit is not needed when: you just applied one suggestion; you're still working through your current Next 3; today is moving and you're not stuck — no pressure to rerun.";

// Packet 68: compact one-glance progress loop — progress cues, continue-vs-pause confidence, re-entry threshold
const PROGRESS_CUES_COMPACT =
  "Still progressing today: working from your Next 3, next task is clear, plan still feels right.";
const CONTINUE_OR_PAUSE_COMPACT =
  "Continue or pause: safe to keep working or take a short break — no planner churn; your updated plan stays trustworthy.";
const REVISIT_THRESHOLD_COMPACT =
  "Revisit worth it: after a chunk of work, or one remaining suggestion clearly helps on a short break. Not now: you just applied; keep going.";
const FULL_RERUN_UNNECESSARY_COMPACT =
  "Full rerun unnecessary now: plan is updated and trustworthy; run Refine again when you want a fresh set, not to verify progress.";

// Packet 69: steady-progress and rerun-readiness bundle — one coherent layer: steady progress, pause-vs-continue, revisit vs full rerun
const STEADY_PROGRESS_HEADLINE =
  "You're in a steady progress state — no need for another planner pass.";
const STEADY_PROGRESS_SIGNS =
  "Signs today is still advancing: you're working from your updated Next 3, your next task is clear, and nothing has made your plan feel wrong.";
const PAUSE_SAFE =
  "Short pause is safe: taking a break won't undo progress. Your plan stays trustworthy; you can keep working or pause without reopening the planner.";
const WHEN_REVISIT_ADDS_VALUE =
  "Revisit adds value when: you've done a chunk of work and one remaining suggestion still fits, or you're on a short break and one suggestion would help. Right now you don't need to — you just applied.";
const QUICK_REVISIT_SIGNALS =
  "Quick revisit helps when: one remaining suggestion clearly helps and you have a few minutes; you've finished a chunk and want to peek at one more. Not required to keep today moving.";
const FULL_RERUN_WORTHWHILE =
  "Full rerun is worthwhile when: you've done a chunk of work, your Next 3 has changed, or you want a fresh set. Right after one apply it's unnecessary — that would be reassurance churn, not progress.";
const FULL_RERUN_CHURN_AVOID =
  "Don't rerun to verify: your plan is already updated and trustworthy. Run Refine again when you want a new pass, not to double-check.";

// Packet 70: AI Planner autonomy bundle — keep-moving proof, safe pause confidence, revisit vs rerun thresholds; self-sufficient at a glance
const AUTONOMY_HEADLINE =
  "Autonomy mode: keep moving without reopening the planner.";
const AUTONOMY_KEEP_MOVING_PROOF =
  "Keep-moving proof: only the approved item changed; everything else stayed as-is. Your Next 3 is still your working set, and any remaining suggestions are optional — they can wait.";
const AUTONOMY_SAFE_PAUSE_RULE =
  "Safe pause: a short break won’t invalidate anything. When you return, resume from your Next 3 — no planner recheck needed.";
const AUTONOMY_WHEN_PLAN_STILL_GOOD =
  "Plan still good enough when: next task is clear, you’re making progress, and nothing new made the plan feel wrong.";
const AUTONOMY_WHEN_QUICK_REVISIT_HELPS =
  "Quick revisit helps when: one remaining card clearly fits right now, or you’re on a short break and want one small upgrade. One card is enough — stop after one.";
const AUTONOMY_WHEN_FULL_RERUN_WORTHWHILE =
  "Full rerun becomes worthwhile when: you completed at least one task (or a real chunk), your Next 3 is different, or constraints changed (deadline, blocker, surprise meeting).";
const AUTONOMY_WHEN_TO_AVOID_RERUN =
  "Avoid rerun when: you just applied one suggestion, you’re still on the same Next 3, or you’re only seeking reassurance.";

// Packet 71: AI Planner self-trust bundle — decisive stop rule to prevent reassurance loops
const SELF_TRUST_STOP_RULE =
  "Stop rule: if you can’t name the exact improvement you want, don’t reopen the planner — keep working.";

// Packet 72: execution confidence + rerun thresholds bundle — keep-working boundaries after apply
const KEEP_WORKING_THRESHOLD =
  "Keep working when: you can name the next task in one sentence and you’re not meaningfully stuck (≤10 minutes of friction).";
const RERUN_AVOID_THRESHOLD =
  "Avoid rerun when: you just applied one suggestion and are still on the same Next 3 — that’s reassurance churn, not progress.";

// Packet 74: keep-working contract bundle — prior denser post-apply layer. Packet 75 refines it into a clearer "continue with confidence" surface.

// Packet 76: AI Planner execution pace bundle — one dense Today layer: focus-now, what-can-wait, later-today revisit timing, rerun escalation triggers
// Packet 78: AI Planner continue-until-blocked bundle — unify keep-going proof, can-wait boundaries,
// optional checkpoint timing, and interruption-vs-rerun thresholds into one denser post-apply layer.
// Packet 79: AI Planner checkpoint-and-resume bundle — short checkpoint timing, resume-without-rerun confidence,
// what-can-stay-untouched guidance, and blocker-vs-rerun boundaries in one Today planner layer.
const EXECUTION_WINDOW_TITLE = "Continue until blocked (today)";
const EXECUTION_WINDOW_SUBTITLE =
  "A single post-apply contract: keep executing from your updated Next 3 until you’re meaningfully blocked — with clear can-wait boundaries, an optional checkpoint, and rerun-only-if triggers.";
const EW_NOW =
  "Focus now: start the next task from your updated Next 3 — then keep going.";
const EW_CAN_WAIT =
  "Can wait until later today: remaining cards + any “verify again” urge. Your plan is already updated and bounded to what you approved.";
const EW_LATER_TODAY =
  "Later today (optional): if exactly one remaining card clearly helps, do one quick revisit on a short break — one card, then stop.";
const EW_CHECKPOINT_WINDOW =
  "Checkpoint (optional): after you finish one task or after ~60–120 minutes, take ≤2 minutes to confirm your Next 3 still fits.";
const EW_CHECKPOINT_DECISION =
  "If it still fits, close and continue. If it doesn’t, either adjust your Next 3 manually or do one quick card revisit (one card, then stop). Escalate to a full rerun only if a trigger below is true.";
const EW_RESUME_LATER_WITHOUT_RERUN =
  "When you come back later today — even after a break or context switch — simply resume from your updated Next 3; you don’t need to reopen the planner unless a rerun trigger is true.";
const EW_INTERRUPTION_RULE =
  "Interruption rule: interruptions (meetings/messages/context switches) don’t require a rerun by themselves — resume from your Next 3 unless the interruption changed constraints.";
const EW_RERUN_ONLY_IF =
  "Full rerun only if: your Next 3 changed, constraints changed (deadline/blocker/surprise meeting), you finished a real chunk and want a fresh set, or you’re stuck/wrong for >10 minutes. Otherwise keep executing.";
const EW_WHAT_CAN_STAY_UNTOUCHED =
  "You don’t need to re-plan backlog items, other days, or remaining cards at every checkpoint — they can stay exactly as they are until a rerun trigger is true.";
const EW_BLOCKER_BOUNDARY =
  "Treat “blocked for >10 minutes or plan feels wrong for this session” as the boundary — that’s when a single rerun is worth it; below that, keep working from the current Next 3.";

// Packet 80: AI Planner safe-stop and next-resume bundle — done-for-now confidence,
// one best restart point, what can stay untouched, and when a rerun is actually warranted.
const SAFE_STOP_TITLE = "Safe stop & next resume";
const SAFE_STOP_HEADLINE =
  "You can safely stop here — today’s plan is updated and can hold until tomorrow.";
const SAFE_STOP_DONE_FOR_NOW =
  "Done-for-now rule: after one apply and a bit of work, it’s valid to close the planner and end today from your updated Next 3 — you don’t need to clear every card or rerun to count today as a success.";
const SAFE_STOP_NEXT_RESTART_POINT =
  "Next restart point: when you come back later (tonight or tomorrow), restart by looking at your updated Next 3 and picking the first not-done task. If that still fits, you can keep going without reopening the planner.";
const SAFE_STOP_CAN_STAY_UNTOUCHED_UNTIL_TOMORROW =
  "Can stay untouched until tomorrow: remaining cards, backlog items, and other days don’t need a second look tonight. They stay valid as-is until a real change in constraints or priorities makes a fresh pass worthwhile.";
const SAFE_STOP_RERUN_WORTH_IT =
  "Rerun is actually worth it when: your constraints really changed (new blocker, deadline, surprise work), your Next 3 no longer matches what today should focus on, or you feel stuck/wrong for more than ~10 minutes even after trying the next task.";
const SAFE_STOP_AVOID_RERUN_FOR_REASSURANCE =
  "Avoid rerun for reassurance only: if you’re mostly looking for a “did I do it right?” feeling, treat that as a signal to stop, not to rerun — your current plan is already stable enough.";
const SAFE_STOP_PAUSE_WITHOUT_GUILT =
  "Pause without guilt: closing the planner is a valid completion for today. You’re not abandoning the plan — you’re parking it in a stable state you can restart from later.";

// Packet 81: AI Planner done-for-today and tomorrow re-entry bundle — end-of-day closure,
// tomorrow restart confidence, overnight leave-it-alone, and clearer rerun thresholds.
const DONE_FOR_TODAY_TITLE = "Done for today & tomorrow restart";
const DONE_FOR_TODAY_HEADLINE =
  "Today can count as complete from here — your updated plan is strong enough to rest overnight.";
const DONE_FOR_TODAY_COMPLETION_RULE =
  "Complete-enough for today: after applying one suggestion and doing a bit of work from your updated Next 3, it’s valid to call Today “done” — you don’t need to empty every card, hit inbox zero, or chase another AI pass.";
const DONE_FOR_TODAY_TOMORROW_RESTART =
  "Tomorrow restart point: when you open Today again, start by looking at the first not-done task in your updated Next 3. If that still fits, begin there and keep going without rerunning the planner.";
const DONE_FOR_TODAY_OVERNIGHT_CAN_WAIT =
  "Overnight can-wait list: remaining cards, untouched backlog, and other days do not need another look tonight. They can stay exactly as they are until a real overnight change makes a new pass worthwhile.";
const DONE_FOR_TODAY_NORMAL_RESUME_VS_RERUN =
  "Normal resume vs rerun: tomorrow, treat “open Today and work from your Next 3” as the default. Only reopen the planner when something actually changed — new constraints, a different priority for the day, or your Next 3 no longer matches what you want from this session.";
const DONE_FOR_TODAY_RERUN_TRIGGERS =
  "Overnight rerun is worth it when: your day’s focus shifted (new deadline, new blocker, big surprise work), your Next 3 feels wrong for more than ~10 minutes, or you want a fresh set after finishing a real chunk tomorrow. It’s not needed just because a night passed.";

// Packet 82: AI Planner end-of-day carryforward bundle — overnight contract,
// tomorrow first move, plan-still-fits signals, and rerun-only-if shifts.
const CARRYFORWARD_TITLE = "Overnight carryforward contract";
const CARRYFORWARD_HEADLINE =
  "Tonight can be a handoff, not a reset — your updated plan can rest as-is and still give you a clear first move tomorrow.";
const CARRYFORWARD_WHAT_STAYS_STABLE =
  "What safely carries forward overnight: your updated Next 3, any remaining cards you didn’t touch, and the rest of your backlog. None of them need a second pass just because a night passed — they stay valid as-is unless tomorrow’s constraints really change.";
const CARRYFORWARD_FIRST_MOVE_TOMORROW =
  "Tomorrow’s first useful move: open Today and start from the first not-done task in your updated Next 3. If that still fits, treat it as your default starting point — no rerun, no re-scan, just begin there and keep going.";
const CARRYFORWARD_PLAN_STILL_FITS_SIGNALS =
  "Signs the current plan still fits: your first task still looks like a reasonable use of your energy, nothing big changed in deadlines or blockers, and you’re not meaningfully stuck (≤10 minutes of friction) once you start. In that case, keep working from your existing Next 3 without reopening the planner.";
const CARRYFORWARD_RERUN_ONLY_IF_OVERNIGHT_SHIFT =
  "When an overnight change really justifies a rerun: a new blocker or deadline reshapes what “today” should be, surprise work crowds out your current focus, or your Next 3 feels wrong for more than ~10 minutes even after trying the first task. That’s when a single fresh pass is worth it — not simply because it’s a new day.";

// Packet 83: AI Planner morning restart confidence bundle — first-task restart contract,
// leave-last-night-alone proof, early-friction tolerance, and rerun-only-if shifts for tomorrow.
const MORNING_RESTART_TITLE = "Tomorrow morning restart contract";
const MORNING_RESTART_HEADLINE =
  "Treat tomorrow as a restart from a stable plan, not a reset — your updated Next 3 is already strong enough to open and begin from.";
const MORNING_RESTART_FIRST_MOVE =
  "What to open first tomorrow: open Today, look at your updated Next 3, and start with the first not-done task. Don’t reopen the planner or re-scan everything unless a rerun trigger below is actually true.";
const MORNING_RESTART_WHAT_STAYS_UNTOUCHED =
  "What can stay exactly as you left it: remaining cards, backlog items, and other days. They do not need overnight edits or another AI pass just because it’s morning.";
const MORNING_RESTART_FRICTION_NORMAL =
  "Normal morning friction: a few minutes of warm-up, light resistance, or needing to reread the first task (around 10 minutes or less) still counts as the plan fitting — keep going from your existing Next 3.";
const MORNING_RESTART_RERUN_ONLY_IF =
  "Rerun is worth it tomorrow only when something real shifted: a new blocker or deadline, surprise work that reshapes the day, or your Next 3 still feels wrong after ~10 minutes of trying the first task. Not just because it’s a new day or you feel wobbly.";

// Packet 84: AI Planner first-block morning flow bundle — first-block execution contract:
// keep-doing clarity, harmless wobble tolerance, and rerun-only-if-the-morning-breaks.
const FIRST_BLOCK_TITLE = "First-block morning execution contract";
const FIRST_BLOCK_HEADLINE =
  "Treat your first work block as a focused lane, not another planning loop — this block is about starting and continuing from your updated Next 3.";
const FIRST_BLOCK_KEEP_DOING =
  "Keep doing what you opened: stay with the first task in your updated Next 3 until you either finish it or hit a real blocker. Glancing at other tabs or feeling warm-up resistance is still compatible with the plan fitting.";
const FIRST_BLOCK_WOBBLE_NORMAL =
  "Harmless morning wobble: rereading the task, needing a few minutes to remember context, or drifting for ≤10 minutes still counts as “normal first-block friction.” That’s not a sign the plan is wrong — keep working the same task.";
const FIRST_BLOCK_WHEN_PLAN_STILL_GOOD =
  "Plan still good enough when: the first task still roughly matches how you meant to use this block, your energy is okay-enough to make progress, and once you get moving you’re not stuck for more than ~10 minutes at a time.";
const FIRST_BLOCK_RERUN_ONLY_IF =
  "Reopen the planner only if the morning actually changed: a new blocker or deadline reshaped the day, surprise work crowded out this focus block, or the first task still feels wrong after ~10 solid minutes of trying to move it forward. Not just because the first few minutes felt wobbly.";

// Packet 85: AI Planner morning momentum protection bundle — one coherent morning execution contract:
// keep-going proof, harmless-wobble vs mismatch, stay-with-the-block guidance, and a mid-morning rerun threshold.
const MORNING_MOMENTUM_TITLE = "Morning momentum protection contract";
const MORNING_MOMENTUM_HEADLINE =
  "For the first half of the morning, treat this block as your lane and the planner as a stable contract — your job is to keep moving inside it, not to keep reopening the plan.";
const MORNING_MOMENTUM_KEEP_GOING_PROOF =
  "Keep-going proof: your plan is already updated from your last apply, your Next 3 is anchored, and this first block is pointed at the top task. You’re not waiting on a better plan — you’re executing the one you chose.";
const MORNING_MOMENTUM_WOBBLE_NORMAL =
  "Normal first-block wobble: rereading the task, light tab flinch, checking messages once, or taking up to ~10 minutes to warm up still counts as the block working. That’s friction inside the contract, not a reason to reopen the planner.";
const MORNING_MOMENTUM_REAL_MISMATCH =
  "Real plan mismatch: the first task clearly no longer fits what this block is for, a new constraint makes this work a bad choice, or you’ve genuinely tried to move it for ~10–15 minutes and still can’t make meaningful progress.";
const MORNING_MOMENTUM_STAY_WITH_BLOCK =
  "Stay with this block: as long as you’re nudging the first task forward — even in small chunks — stay with it and treat planner re-open as off-limits. If you need a micro-adjustment, tweak the task or Next 3 manually rather than rerunning AI.";
const MORNING_MOMENTUM_RERUN_THRESHOLD =
  "Mid-morning rerun threshold: only reopen the planner after you’ve either finished this first block or given it a real try (one solid attempt, not just a few minutes of wobble) and one of the “real plan mismatch” conditions is true. Otherwise, keep executing from the current Next 3.";

// Packet 86: AI Planner morning execution stability bundle — one coherent morning-stability contract:
// stay-with-the-block proof, harmless-drift vs real break, manual-adjustment guidance, and a clearer late-morning rerun threshold.
const MORNING_STABILITY_TITLE = "Morning execution stability contract";
const MORNING_STABILITY_HEADLINE =
  "For the first half of the morning, treat this block as a stable contract: small wobble is allowed inside it, and only a real break in what this block is for should send you back to the planner.";
const MORNING_STABILITY_PROOF =
  "Why this block still deserves protection: it’s anchored to the top task you already chose, your updated Next 3 still matches how you meant to use this morning, and nothing big has changed in your constraints. You’re not waiting on a better plan — you’re executing the one that already fits.";
const MORNING_STABILITY_HARMLESS_DRIFT =
  "Harmless drift: glancing at messages once, needing a few minutes to warm up, briefly tidying a small related detail, or sliding between tiny sub-steps of the same task for ≤10–15 minutes still counts as being inside this block. That wobble is normal, not a reason to reopen the planner.";
const MORNING_STABILITY_REAL_BREAK =
  "Real morning break: a surprise meeting that eats this whole block, a new deadline that clearly wants a different focus, or realizing that most of your effort in this block is going to a different task than the one at the top of your Next 3. That’s when this block has actually been repurposed.";
const MORNING_STABILITY_MANUAL_ADJUST =
  "When a small manual adjustment is enough: if the shape of the work is still right but the details need a tweak — renaming the task, trimming scope, changing effort, or reordering within the same cluster — edit the task or Next 3 directly instead of rerunning AI. Those small edits keep the contract intact without planner churn.";
const MORNING_STABILITY_RERUN_THRESHOLD =
  "Late-morning rerun threshold: only reopen the planner once you’ve given this block a real attempt and one of the real-break conditions is true — your first task no longer fits this time at all, more than half of your Next 3 clearly belongs to a different kind of day, or a new constraint reshapes what the rest of the morning should be. Below that bar, stay with the current block and keep nudging it forward.";

// Packet 87: AI Planner late-morning continuity bundle — adjacent to morning stability:
// carry-forward proof for the rest of the morning, ordinary slowdown tolerance,
// manual resequencing guidance, and a firmer pre-lunch rerun threshold.
const LATE_MORNING_TITLE = "Late-morning continuity contract";
const LATE_MORNING_HEADLINE =
  "Late in the morning, treat your current Next 3 as a stable lane through lunch — slow or imperfect progress inside it is normal, and only a real shift in what the rest of this morning should be is a reason to reopen the planner.";
const LATE_MORNING_CARRY_PROOF =
  "Why the current plan still carries: your updated Next 3 is already anchored to today’s priorities, you’ve made at least some progress or refilled once, and nothing big has invalidated what this morning is for. You’re not waiting on a better plan for before lunch — you’re executing the one you already chose.";
const LATE_MORNING_SLOWDOWN_NORMAL =
  "Ordinary slowdown that doesn’t break the plan: working more slowly than expected, a task spilling over into the next block, or needing small context swaps between the same 2–3 tasks. As long as you’re still inside the same cluster and your first task roughly matches how you meant to use this morning, the contract is intact.";
const LATE_MORNING_REAL_MISMATCH =
  "Real pre-lunch mismatch: most of your effort has drifted to tasks that are not in your current Next 3, a new constraint makes a different focus clearly more important for the rest of the morning, or more than half of your Next 3 now looks like it belongs to a different kind of day (for example, deep work vs errands). That’s a sign the lane itself needs to change, not just the pacing inside it.";
const LATE_MORNING_MANUAL_RESEQUENCE =
  "When a manual reshuffle is enough: if the same ingredients still belong in this morning but the order or shape needs a tweak — trimming scope on a task, swapping the order of two Next-3 items, or parking one task to the backlog and pulling an already-related task in — edit the queue by hand. Those adjustments keep the plan continuous without inviting a fresh AI pass.";
const LATE_MORNING_RERUN_THRESHOLD =
  "Pre-lunch rerun threshold: only reopen the planner when the rest of the morning should genuinely be about something else — a new blocker or deadline rewrites what “before lunch” is for, you’ve given the current focus a solid attempt and it still feels wrong for >10–15 minutes, or your Next 3 now mostly represents the wrong kind of work. Below that bar, keep finishing, trimming, or resequencing manually and let this plan carry you into lunch.";

// Packet 88: AI Planner pre-lunch execution contract bundle — builds on late-morning continuity:
// clearer through-lunch stability proof, manageable drift vs half-day break,
// lunch-approaching trim/resequence guidance, and an afternoon-inheritance vs rerun threshold.
const PRE_LUNCH_TITLE = "Pre-lunch execution contract";
const PRE_LUNCH_HEADLINE =
  "Treat the rest of the morning plus the lunch edge as one half-day lane — the current plan usually carries you through lunch, and only a real half-day change should force a fresh planner run right now.";
const PRE_LUNCH_THROUGH_LUNCH_PROOF =
  "Why this plan usually holds through lunch: it’s already anchored to today’s priorities, you have visible evidence of progress or at least one refill, and nothing has rewritten what “this half of the day” is for. You don’t need a new AI pass just because the clock is close to lunch.";
const PRE_LUNCH_MANAGEABLE_DRIFT =
  "Manageable drift: working more slowly than hoped, a task spilling across blocks, nibbling at a second Next-3 item, or doing small context swaps between 2–3 related tasks over ≤30 minutes. As long as you’re still inside the same cluster and your top task roughly matches how you meant to use the rest of this morning, the half-day contract is intact.";
const PRE_LUNCH_TRIM_RESEQUENCE_GUIDE =
  "When a quick trim or resequence is enough near lunch: if the ingredients are still right but the shape needs to tighten, manually shorten a task, swap the order of two items, or park one card and pull in an already-related task from your backlog. Make those edits directly in the queue instead of rerunning AI — they keep the lane continuous without a heavy reset.";
const PRE_LUNCH_AFTERNOON_INHERIT_RULE =
  "Default afternoon rule: let the afternoon inherit this plan unless something real changes — a new meeting eats the block, a deadline moves up, or most of your remaining energy clearly belongs to a different kind of work. In those cases, it’s better to run a fresh planner pass in your first post-lunch block than to squeeze in a rushed rerun right before lunch.";
const PRE_LUNCH_AFTERNOON_RERUN_THRESHOLD =
  "Afternoon rerun threshold: only treat the afternoon as a new plan when more than half of what you expect to do after lunch is different in kind from your current Next 3, or a clear new constraint reshapes the rest of the day. Otherwise, let this plan carry you into lunch and out the other side — you can always rerun calmly later if the afternoon truly becomes a different day.";

// Packet 89: AI Planner after-lunch inheritance bundle — builds on the pre-lunch execution contract:
// afternoon plan-carry proof, harmless lunch disruption thresholds, carry-forward triage, and a calm post-lunch rerun rule.
const AFTER_LUNCH_TITLE = "After-lunch inheritance contract";
const AFTER_LUNCH_HEADLINE =
  "Treat the afternoon as inheriting this Morning+Lunch lane by default — your plan usually survives lunch, and only a real half-day change should trigger a fresh planner run.";
const AFTER_LUNCH_WHEN_PLAN_CARRIES =
  "When the existing plan still carries the afternoon: your Next 3 still mostly matches how you meant to use the rest of today, at least one Next-3 item still looks like a good use of post-lunch energy, and nothing new has rewritten what this half of the day is for. In that case, start from the first not-done item and keep going — no rerun needed just because lunch happened.";
const AFTER_LUNCH_HARMLESS_DISRUPTIONS =
  "Harmless lunch-time disruption: your lunch break was longer or shorter than planned; you skimmed messages or chats; a quick check-in meeting touched the same work; or you needed a few minutes of warm-up or context re-reading after coming back. As long as your first Next-3 task still roughly fits this block, those bumps don’t invalidate the plan.";
const AFTER_LUNCH_PLAN_BREAKERS =
  "Lunch actually broke the plan when: a new meeting or request eats most of the afternoon, a deadline or blocker clearly reshapes what “after lunch” should be about, or more than half of your current Next 3 now belongs to the wrong kind of day (for example, deep work vs errands). That’s a sign the lane itself changed, not just the pacing.";
const AFTER_LUNCH_CARRY_FORWARD_TRIAGE =
  "Carry forward without guilt: keep only the tasks that still matter for this afternoon, park anything that truly slid out of today’s focus into backlog or another day, and treat unchanged-but-less-important items as safely optional. You don’t have to “catch up” on every pre-lunch intention for the plan to count as intact.";
const AFTER_LUNCH_RERUN_WORTH_IT =
  "When a calm post-lunch rerun is worth it: more than half of what you expect to do after lunch is different in kind from your current Next 3, or a clear new constraint (deadline, blocker, surprise project) reshapes the rest of the day. In that case, a single fresh pass in your first post-lunch block is better than forcing the old half-day lane to fit.";
const AFTER_LUNCH_RERUN_NOT_NEEDED =
  "When rerun is not needed: your first Next-3 task still looks reasonable after a few minutes of trying, the afternoon is still pointed at the same overall focus, and any friction is mostly “getting back into it” rather than being stuck for >10–15 minutes. In that case, treat reopening the planner as reassurance churn — keep executing from the inherited plan instead.";

// Packet 90: AI Planner late-afternoon continuity bundle — builds on after-lunch inheritance:
// late-afternoon plan-carry proof, normal slowdown thresholds, still-worth-doing triage,
// and end-of-day vs tomorrow-rerun guidance.
const LATE_AFTERNOON_TITLE = "Late-afternoon continuity contract";
const LATE_AFTERNOON_HEADLINE =
  "Treat the last work block as the tail of the same plan — most afternoons don’t need a new planner run, just a calmer finish inside the lane you already chose.";
const LATE_AFTERNOON_WHEN_PLAN_STILL_CARRIES =
  "Your existing plan still carries the rest of today when: at least one Next-3 task still looks like a good use of your remaining energy, the overall focus of your queue matches what you meant this day to be about, and nothing big has rewritten your constraints (no new deadline, blocker, or surprise project that eats the whole block). In that case, keep working from the first not-done task instead of reopening the planner.";
const LATE_AFTERNOON_NORMAL_SLOWDOWN =
  "Normal late-day slowdown: moving more slowly than hoped, shrinking what “done” means for a task, or letting something spill slightly into tomorrow. Feeling tired, needing extra rereads, or doing smaller-than-ideal chunks inside the same task is still compatible with the plan fitting — it doesn’t mean the day needs a new plan.";
const LATE_AFTERNOON_REAL_SCOPE_RESET =
  "Real scope reset: most of the work you can realistically do with the time and energy left is clearly different in kind from what’s in your current Next 3 (for example, you meant to finish deep work but now only have energy for small admin), or a new constraint genuinely rewrites what the rest of today should be for. That’s a signal the lane itself changed, not just the pace inside it.";
const LATE_AFTERNOON_CARRY_FORWARD_TRIAGE =
  "Late-day carry-forward triage: keep only the tasks that still feel meaningfully worth doing today or tomorrow, park anything that clearly no longer belongs to this week or this version of today into backlog or another day, and let “nice-to-have but no longer realistic” items go without guilt. Your plan is allowed to end smaller than it started.";
const LATE_AFTERNOON_END_OF_DAY_VS_TOMORROW =
  "End-of-day vs tomorrow rerun: if at least one Next-3 task still fits and you’re not stuck for more than ~10–15 minutes once you try it, finish the day by doing a small chunk and then use the existing plan as your overnight carryforward. Only plan a fresh rerun (tonight or tomorrow) when more than half of what should happen next is different in kind from your current Next 3 or a real constraint changed — not just because the day felt slow or imperfect.";

// Packet 64: Updated plan recap bundle — what changed, what to do now, when safe to ignore
const RECAP_WHAT_CHANGED_FALLBACK =
  "One suggestion was applied; your plan is updated.";
const RECAP_DO_NOW =
  "Your best move is from the updated plan: work your Next 3. No need to review every remaining suggestion or run Refine again.";
const RECAP_SAFE_TO_IGNORE =
  "You can close this and keep working — no need to reopen the planner until you've done a chunk of work, your Next 3 has changed, or you want a fresh set. Right now, another run would be an interruption.";
const RECAP_WHEN_REVISIT_WORTH_IT =
  "Revisit later today only if one remaining suggestion clearly helps; otherwise keep moving. Run \"Refine these 3 with AI\" when you want a fresh pass — not required to keep today moving.";

// Packet 65: Post-apply confidence bundle — what stayed the same, planner can wait
const RECAP_WHAT_STAYED_SAME =
  "Only the item you approved was updated; your queue order, other tasks, and any unapproved suggestions are unchanged — stable enough to trust.";
const RECAP_PLANNER_CAN_WAIT =
  "The planner can safely stay out of the way: close this and keep working. You don't need to reopen it until you've done a chunk of work, your Next 3 has changed, or you want a fresh set.";

function getReviewSummary(aiSuggestions) {
  if (!aiSuggestions) return null;

  const categories = [
    {
      key: "task_refinements",
      singular: "task refinement",
      plural: "task refinements",
    },
    {
      key: "suggested_subtasks_to_create",
      singular: "subtask plan",
      plural: "subtask plans",
    },
    {
      key: "automation_opportunities",
      singular: "automation idea",
      plural: "automation ideas",
    },
  ];

  const items = categories
    .map(({ key, singular, plural }) => {
      const count = aiSuggestions[key]?.length || 0;
      if (!count) return null;
      return `${count} ${count === 1 ? singular : plural}`;
    })
    .filter(Boolean);

  if (items.length === 0) return null;

  const total = categories.reduce(
    (sum, { key }) => sum + (aiSuggestions[key]?.length || 0),
    0
  );

  return {
    total,
    items,
  };
}

function getPhase({ aiLoading, aiError, aiStatus, aiSuggestions, queueReady }) {
  if (aiLoading) return "loading";
  if (typeof aiStatus === "string" && aiStatus.startsWith("fallback:")) return "fallback";
  if (aiError && !aiSuggestions) return "error";

  if (aiSuggestions) {
    const total =
      (aiSuggestions.task_refinements?.length || 0) +
      (aiSuggestions.suggested_subtasks_to_create?.length || 0) +
      (aiSuggestions.automation_opportunities?.length || 0);
    return total > 0 ? "review" : "empty";
  }

  return queueReady ? "idle" : "idle-no-queue";
}

function humanizePlannerReason(reason) {
  if (!reason || typeof reason !== "string") return "";

  const normalized = reason.trim().toLowerCase();

  if (
    normalized.includes("auth session missing") ||
    normalized.includes("sign in again") ||
    normalized.includes("jwt") ||
    normalized.includes("token")
  ) {
    return "Your session needs to be refreshed before the planner can run.";
  }

  if (
    normalized.includes("non-json") ||
    normalized.includes("raw") ||
    normalized.includes("parse")
  ) {
    return "The planner returned a response we couldn’t safely use this time.";
  }

  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("slow")
  ) {
    return "The planner took too long to respond, so we stopped before changing anything.";
  }

  if (
    normalized.includes("rate limit") ||
    normalized.includes("too many requests") ||
    normalized.includes("429")
  ) {
    return "The planner is busy right now, so it couldn’t finish your request yet.";
  }

  if (
    normalized.includes("unavailable") ||
    normalized.includes("failed") ||
    normalized.includes("error") ||
    normalized.includes("500") ||
    normalized.includes("503")
  ) {
    return "The planner ran into a temporary problem, so nothing was changed.";
  }

  return "The planner hit a temporary issue, and your tasks were left exactly as they were.";
}

function getFallbackReasonCopy(aiStatus, aiError) {
  if (typeof aiStatus === "string" && aiStatus.startsWith("fallback:")) {
    const rawReason = aiStatus.slice("fallback:".length).replace(/[-_]+/g, " ").trim();

    if (!rawReason) {
      return "The planner couldn’t complete the full AI pass this time, so it set up a quick backup review instead.";
    }

    return `${humanizePlannerReason(rawReason)} Instead of forcing a shaky result through, the planner set up a quick backup review.`;
  }

  return humanizePlannerReason(aiError);
}

const PHASE_CONTENT = {
  "idle-no-queue": {
    label: "Waiting for your Next 3",
    hint: "Fill your queue first so the planner has something concrete to review.",
    detail: "Once 3 tasks are loaded, AI can suggest cleaner titles, subtasks, and automation ideas without changing anything automatically.",
    icon: "○",
    color: "#6b7280",
    bg: "#f9fafb",
    border: "#e5e7eb",
  },
  idle: {
    label: "Ready when you are",
    hint: "Tap \"Refine these 3 with AI\" to review suggestions before anything changes.",
    detail: "The planner only works on your current Next 3, and every suggestion stays in review until you approve it.",
    icon: "○",
    color: "#6b7280",
    bg: "#f9fafb",
    border: "#e5e7eb",
  },
  loading: {
    label: "Actively reviewing your Next 3…",
    hint: "The planner is working through your current queue right now and drafting suggestions. This usually takes a few seconds.",
    detail: "This is a review step only — nothing in your tasks changes while loading, and any suggestions still wait for your approval.",
    icon: "◌",
    color: "#2563eb",
    bg: "#eff6ff",
    border: "#bfdbfe",
  },
  fallback: {
    label: "Backup path — you’re still in good shape",
    hint: "The full AI pass didn’t complete this time. A calm backup review is ready so you can keep moving at your own pace.",
    detail:
      "Nothing changed without your approval. You can skim what’s here, use one helpful tweak, pause entirely, or retry for a full pass later.",
    trustBundle: {
      safety:
        "It’s okay to pause here — nothing breaks, nothing expires, and each suggestion only changes a single task if you approve it.",
      resume:
        "When you come back, you resume from this same backup review; you don’t need to catch up or start over.",
      useful:
        "Use what helps and ignore the rest — even one small improvement still counts for today.",
      nextStep:
        "Next step: if you’re ready, review one suggestion or take the next task in your queue; if not, close this and return when it fits.",
    },
    icon: "◇",
    color: "#92400e",
    bg: "#fffbeb",
    border: "#fcd34d",
  },
  error: {
    label: "Couldn’t load suggestions",
    hint: "You can try again safely — nothing was changed.",
    detail: "If this keeps happening, your queue is still intact and you can continue working without the planner.",
    icon: "△",
    color: "#b91c1c",
    bg: "#fef2f2",
    border: "#fecaca",
  },
  review: {
    label: "Suggestions ready — optional review below",
    hint: "Each suggestion stands on its own: approve only the ones you want, or dismiss any you don’t.",
    detail: "Nothing is applied in bulk or automatically. Your current plan stays unchanged until you approve a specific suggestion, and dismissing only hides a card without changing any tasks.",
    readinessBundle: {
      whatChanges:
        "Approving one suggestion only updates that single item (one task title, one subtask set, or one automation idea) right away. You can always refine again later for a fresh pass.",
      whatStaysUntouched:
        "Every other suggestion stays in review until you approve it. There is no bulk apply — your queue and tasks stay as they are except for the ones you explicitly approve. Dismissing or skipping a card simply removes that suggestion from view; your underlying tasks and queue stay exactly as they are.",
      whyNow:
        "This set was built for your current Next 3 and is ready for a quick one-at-a-time pass. You can do one approval and stop, or work through as many as you like.",
      nextStep:
        "Quickest low-risk move: scan the list below, approve one suggestion that clearly helps, or dismiss and keep working your queue as-is. You can safely ignore anything that feels off and ask for a new set later.",
    },
    continuityBundle: {
      afterApprove:
        "Right after you approve one suggestion, that change is applied and the card goes away. You can approve another, or stop here and work your queue — no need to review everything.",
      afterDismiss:
        "After you dismiss one, that suggestion is removed from view and your tasks are unchanged. You can dismiss more, approve another, or simply continue with your current plan.",
      oneStep:
        "One small move is enough: approve one or dismiss one, then continue. You’re not expected to do a full pass — the planner stays steady either way.",
      momentum:
        "Staying steady: one approval or one dismiss keeps momentum. You can leave the rest for later or run \"Refine these 3 with AI\" again anytime for a fresh set.",
    },
    // Packet 63: re-entry decision bundle — keep working, quick revisit, full rerun, stay in motion
    // Packet 64: updated plan recap — what changed, do now, safe to ignore, when revisit worth it
    // Packet 65: post-apply confidence — what stayed the same, planner can wait
    // Packet 66: keep-moving bundle — one coherent action-ready treatment
    // Packet 67: progress loop — progress-check orientation, keep-going vs revisit signals, concrete revisit triggers
    // Packet 68: progress-check and re-entry bundle — compact one-glance loop
    appliedStateBundle: {
      keepMovingLead: KEEP_MOVING_LEAD,
      title: "Updated plan recap",
      confidenceHeadline: "Your plan is updated and trustworthy at a glance.",
      recapWhatChangedFallback: RECAP_WHAT_CHANGED_FALLBACK,
      recapWhatStayedSame: RECAP_WHAT_STAYED_SAME,
      recapDoNow: RECAP_DO_NOW,
      recapPlannerCanWait: RECAP_PLANNER_CAN_WAIT,
      recapSafeToIgnore: RECAP_SAFE_TO_IGNORE,
      recapWhenRevisitWorthIt: RECAP_WHEN_REVISIT_WORTH_IT,
      reEntryTitle: "Re-entry: your next move",
      keepWorking: APPLIED_KEEP_WORKING,
      quickRevisit: APPLIED_QUICK_REVISIT,
      whenFullRerunWorthIt: APPLIED_WHEN_FULL_RERUN_WORTH_IT,
      stayInMotion: APPLIED_STAY_IN_MOTION,
      progressCheckOrientation: PROGRESS_CHECK_ORIENTATION,
      progressSignalsKeepGoing: PROGRESS_SIGNALS_KEEP_GOING,
      progressSignalsRevisitLater: PROGRESS_SIGNALS_REVISIT_LATER,
      revisitTriggersWorthIt: REVISIT_TRIGGERS_WORTH_IT,
      revisitTriggersNotNeeded: REVISIT_TRIGGERS_NOT_NEEDED,
      // Packet 68: compact one-glance
      progressCuesCompact: PROGRESS_CUES_COMPACT,
      continueOrPauseCompact: CONTINUE_OR_PAUSE_COMPACT,
      revisitThresholdCompact: REVISIT_THRESHOLD_COMPACT,
      fullRerunUnnecessaryCompact: FULL_RERUN_UNNECESSARY_COMPACT,
      // Packet 69: steady-progress and rerun-readiness — one coherent layer
      steadyProgressHeadline: STEADY_PROGRESS_HEADLINE,
      steadyProgressSigns: STEADY_PROGRESS_SIGNS,
      pauseSafe: PAUSE_SAFE,
      whenRevisitAddsValue: WHEN_REVISIT_ADDS_VALUE,
      quickRevisitSignals: QUICK_REVISIT_SIGNALS,
      fullRerunWorthwhile: FULL_RERUN_WORTHWHILE,
      fullRerunChurnAvoid: FULL_RERUN_CHURN_AVOID,
      // Packet 82: overnight carryforward contract
      carryforwardTitle: CARRYFORWARD_TITLE,
      carryforwardHeadline: CARRYFORWARD_HEADLINE,
      carryforwardWhatStaysStable: CARRYFORWARD_WHAT_STAYS_STABLE,
      carryforwardFirstMoveTomorrow: CARRYFORWARD_FIRST_MOVE_TOMORROW,
      carryforwardPlanStillFitsSignals: CARRYFORWARD_PLAN_STILL_FITS_SIGNALS,
      carryforwardRerunOnlyIfOvernightShift: CARRYFORWARD_RERUN_ONLY_IF_OVERNIGHT_SHIFT,
      // Packet 83: tomorrow morning restart confidence bundle
      morningRestartTitle: MORNING_RESTART_TITLE,
      morningRestartHeadline: MORNING_RESTART_HEADLINE,
      morningRestartFirstMove: MORNING_RESTART_FIRST_MOVE,
      morningRestartWhatStaysUntouched: MORNING_RESTART_WHAT_STAYS_UNTOUCHED,
      morningRestartFrictionNormal: MORNING_RESTART_FRICTION_NORMAL,
      morningRestartRerunOnlyIf: MORNING_RESTART_RERUN_ONLY_IF,
      // Packet 89: after-lunch inheritance bundle
      afterLunchTitle: AFTER_LUNCH_TITLE,
      afterLunchHeadline: AFTER_LUNCH_HEADLINE,
      afterLunchWhenPlanCarries: AFTER_LUNCH_WHEN_PLAN_CARRIES,
      afterLunchHarmlessDisruptions: AFTER_LUNCH_HARMLESS_DISRUPTIONS,
      afterLunchPlanBreakers: AFTER_LUNCH_PLAN_BREAKERS,
      afterLunchCarryForwardTriage: AFTER_LUNCH_CARRY_FORWARD_TRIAGE,
      afterLunchRerunWorthIt: AFTER_LUNCH_RERUN_WORTH_IT,
      afterLunchRerunNotNeeded: AFTER_LUNCH_RERUN_NOT_NEEDED,
    },
    icon: "●",
    color: "#059669",
    bg: "#ecfdf5",
    border: "#86efac",
  },
  empty: {
    label: "No new suggestions this pass",
    hint: "That can be a good result — it usually means your current Next 3 already looks clear enough to keep moving.",
    detail:
      "This is different from an error: the planner finished safely, found nothing worth changing, and left your tasks exactly as they were. Work your queue as-is, or run \"Refine these 3 with AI\" again anytime for a fresh set.",
    icon: "✓",
    color: "#059669",
    bg: "#ecfdf5",
    border: "#86efac",
  },
  done: {
    label: "All suggestions reviewed",
    hint: "You’re up to date. Refine again anytime to get a fresh pass.",
    detail: "Your latest review is complete, and your tasks only reflect the changes you explicitly approved.",
    icon: "✓",
    color: "#059669",
    bg: "#ecfdf5",
    border: "#86efac",
  },
};

function isAppliedSuccessMessage(msg) {
  if (!msg || typeof msg !== "string") return false;
  return !msg.trim().toLowerCase().includes("failed");
}

export default function AiPlannerGuidance({
  aiLoading,
  aiError,
  aiStatus,
  aiSuggestions,
  queueReady,
  appliedMessage,
  appliedSuccessVisible = false,
  appliedDetails = null,
  nextActionLabel = "",
  isMorningFirstBlock = false,
  isLateMorningExecution = false,
  isAfterLunchExecution = false,
  isLateAfternoonExecution = false,
}) {
  const phase = getPhase({ aiLoading, aiError, aiStatus, aiSuggestions, queueReady });
  const content = PHASE_CONTENT[phase];
  const reasonCopy = getFallbackReasonCopy(aiStatus, aiError);
  const reviewSummary = getReviewSummary(aiSuggestions);
  const showAppliedState =
    phase === "review" &&
    content?.appliedStateBundle &&
    (appliedSuccessVisible || (appliedMessage && isAppliedSuccessMessage(appliedMessage)));
  if (!content) return null;

  const appliedChangedLines = (() => {
    if (!appliedDetails || typeof appliedDetails !== "object") return null;
    if (appliedDetails.kind === "task_refinement") {
      const changes = Array.isArray(appliedDetails.changes) ? appliedDetails.changes : [];
      if (changes.length === 0) return ["Task updated (no visible field changes detected)."];
      return changes.map((c) => {
        if (!c || typeof c !== "object") return null;
        if (c.field === "title") return `Title: “${c.from}” → “${c.to}”.`;
        if (c.field === "effort") return `Effort: ${c.from} → ${c.to}.`;
        if (c.field === "tags_added") return `Tags added: ${c.to}.`;
        return null;
      }).filter(Boolean);
    }
    if (appliedDetails.kind === "subtasks_created") {
      const created = Number(appliedDetails.created || 0);
      const attempted = Number(appliedDetails.attempted || 0);
      const failures = Number(appliedDetails.failures || 0);
      const lines = [];
      lines.push(`Subtasks created: ${created} of ${attempted}.`);
      if (appliedDetails.promoted && appliedDetails.promoted_title) {
        lines.push(`Next‑3 updated: “${appliedDetails.promoted_title}” is now in your queue.`);
      } else {
        lines.push("Next‑3 stayed the same (subtasks were added to backlog unless promoted).");
      }
      if (failures > 0) lines.push(`Failed to create: ${failures}.`);
      return lines;
    }
    return null;
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          padding: "8px 12px",
          borderRadius: 8,
          background: content.bg,
          border: `1px solid ${content.border}`,
          fontSize: 12,
          lineHeight: 1.5,
          color: content.color,
        }}
      >
        <span
          aria-hidden="true"
          style={{ flexShrink: 0, fontSize: 14, lineHeight: "18px" }}
        >
          {content.icon}
        </span>
        <div>
          <div style={{ fontWeight: 600 }}>{content.label}</div>
          <div style={{ color: "#4b5563", marginTop: 2 }}>{content.hint}</div>
          {content.detail && (
            <div style={{ color: "#6b7280", marginTop: 4 }}>{content.detail}</div>
          )}
          {(phase === "fallback" || phase === "error") && reasonCopy && (
            <div style={{ color: "#6b7280", marginTop: 4 }}>
              <span style={{ fontWeight: 600, color: content.color }}>Details:</span>{" "}
              {reasonCopy}
            </div>
          )}
          {phase === "fallback" && content.trustBundle && (
            <div
              role="region"
              aria-label="Fallback action path"
              style={{
                marginTop: 8,
                padding: "10px 12px",
                borderRadius: 8,
                background: "#fffbeb",
                border: "1px solid #fcd34d",
                fontSize: 12,
                lineHeight: 1.5,
                color: "#78350f",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4, color: "#92400e" }}>
                Calm backup action path
              </div>
              {reviewSummary && (
                <div style={{ marginBottom: 6, color: "#6b7280" }}>
                  <span style={{ fontWeight: 600, color: "#92400e" }}>Suggestions on deck:</span>{" "}
                  {reviewSummary.total} suggestion{reviewSummary.total === 1 ? "" : "s"} ·{" "}
                  {reviewSummary.items.join(" · ")}. You can safely ignore them all or
                  approve just one that clearly helps.
                </div>
              )}
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                <li style={{ marginBottom: 4 }}>{content.trustBundle.safety}</li>
                <li style={{ marginBottom: 4 }}>{content.trustBundle.useful}</li>
                <li style={{ marginBottom: 4 }}>{content.trustBundle.resume}</li>
                <li style={{ marginBottom: 0 }}>{content.trustBundle.nextStep}</li>
              </ol>
            </div>
          )}
          {phase === "review" && content.readinessBundle && (
            <div
              role="region"
              aria-label="Review readiness"
              style={{
                marginTop: 8,
                padding: "10px 12px",
                borderRadius: 8,
                background: "#d1fae5",
                border: "1px solid #6ee7b7",
                fontSize: 12,
                lineHeight: 1.5,
                color: "#065f46",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4, color: "#047857" }}>
                Review readiness — what to expect
              </div>
              {reviewSummary && (
                <div style={{ marginBottom: 6, color: "#047857" }}>
                  <span style={{ fontWeight: 600 }}>Suggestions on deck:</span>{" "}
                  {reviewSummary.total} suggestion{reviewSummary.total === 1 ? "" : "s"} ·{" "}
                  {reviewSummary.items.join(" · ")}. Worth a quick one-at-a-time pass.
                </div>
              )}
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                <li style={{ marginBottom: 4 }}>{content.readinessBundle.whatChanges}</li>
                <li style={{ marginBottom: 4 }}>{content.readinessBundle.whatStaysUntouched}</li>
                <li style={{ marginBottom: 4 }}>{content.readinessBundle.whyNow}</li>
                <li style={{ marginBottom: 0 }}>{content.readinessBundle.nextStep}</li>
              </ol>
            </div>
          )}
          {phase === "review" && content.continuityBundle && !showAppliedState && (
            <div
              role="region"
              aria-label="Post-review continuity"
              style={{
                marginTop: 8,
                padding: "10px 12px",
                borderRadius: 8,
                background: "#f0fdf4",
                border: "1px solid #86efac",
                fontSize: 12,
                lineHeight: 1.5,
                color: "#065f46",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4, color: "#047857" }}>
                What happens next — stay steady
              </div>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                <li style={{ marginBottom: 4 }}>{content.continuityBundle.afterApprove}</li>
                <li style={{ marginBottom: 4 }}>{content.continuityBundle.afterDismiss}</li>
                <li style={{ marginBottom: 4 }}>{content.continuityBundle.oneStep}</li>
                <li style={{ marginBottom: 0 }}>{content.continuityBundle.momentum}</li>
              </ol>
            </div>
          )}
          {showAppliedState && content.appliedStateBundle && (
            <div
              role="region"
              aria-label="Execution window after apply"
              style={{
                marginTop: 8,
                padding: "10px 12px",
                borderRadius: 8,
                background: "#ecfdf5",
                border: "1px solid #10b981",
                fontSize: 12,
                lineHeight: 1.5,
                color: "#065f46",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 2, color: "#047857" }}>
                {EXECUTION_WINDOW_TITLE}
              </div>
              <div style={{ fontSize: 12, color: "#047857", marginBottom: 10 }}>
                {EXECUTION_WINDOW_SUBTITLE}
              </div>

              <div
                style={{
                  marginBottom: 10,
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: "#d1fae5",
                  border: "1px solid #6ee7b7",
                }}
              >
                <div style={{ marginBottom: 4 }}>
                  <span style={{ fontWeight: 800 }}>Applied:</span>{" "}
                  {appliedMessage && isAppliedSuccessMessage(appliedMessage)
                    ? appliedMessage.trim()
                    : content.appliedStateBundle.recapWhatChangedFallback}
                </div>
                {appliedChangedLines && appliedChangedLines.length > 0 && (
                  <ul style={{ margin: "6px 0 0", paddingLeft: 16 }}>
                    {appliedChangedLines.slice(0, 3).map((line) => (
                      <li key={line} style={{ marginBottom: 4 }}>
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
                <div style={{ marginTop: 8, color: "#047857" }}>
                  <span style={{ fontWeight: 800 }}>Stable:</span> {AUTONOMY_KEEP_MOVING_PROOF}
                </div>
              </div>

              {isMorningFirstBlock && (
                <div
                  role="region"
                  aria-label="Morning execution stability and momentum contract"
                  style={{
                    marginTop: 10,
                    padding: "10px 10px 8px",
                    borderRadius: 6,
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 900,
                      marginBottom: 4,
                      color: "#1d4ed8",
                    }}
                  >
                    {MORNING_STABILITY_TITLE}
                  </div>
                  <div style={{ marginBottom: 6, color: "#1e3a8a", fontSize: 12 }}>
                    {MORNING_STABILITY_HEADLINE}
                  </div>
                  <ol
                    style={{
                      margin: 0,
                      paddingLeft: 18,
                      fontSize: 12,
                      color: "#1f2937",
                      lineHeight: 1.5,
                    }}
                  >
                    <li style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>Why this block still fits:</span>{" "}
                      {MORNING_STABILITY_PROOF} {MORNING_MOMENTUM_KEEP_GOING_PROOF}{" "}
                      {FIRST_BLOCK_KEEP_DOING}{" "}
                      {nextActionLabel ? (
                        <span style={{ fontWeight: 600 }}>
                          First-block focus: {nextActionLabel}
                        </span>
                      ) : null}
                    </li>
                    <li style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>Harmless drift vs real break:</span>{" "}
                      {FIRST_BLOCK_WOBBLE_NORMAL} {MORNING_MOMENTUM_WOBBLE_NORMAL}{" "}
                      {MORNING_STABILITY_HARMLESS_DRIFT}
                    </li>
                    <li style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>Signs the plan still fits:</span>{" "}
                      {FIRST_BLOCK_WHEN_PLAN_STILL_GOOD}
                    </li>
                    <li style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>When the morning actually broke:</span>{" "}
                      {MORNING_MOMENTUM_REAL_MISMATCH} {MORNING_STABILITY_REAL_BREAK}
                    </li>
                    <li style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>Small manual tweak vs rerun:</span>{" "}
                      {MORNING_STABILITY_MANUAL_ADJUST} {MORNING_MOMENTUM_STAY_WITH_BLOCK}
                    </li>
                    <li style={{ marginBottom: 0 }}>
                      <span style={{ fontWeight: 600 }}>Late-morning rerun threshold:</span>{" "}
                      {FIRST_BLOCK_RERUN_ONLY_IF} {MORNING_MOMENTUM_RERUN_THRESHOLD}{" "}
                      {MORNING_STABILITY_RERUN_THRESHOLD}
                    </li>
                  </ol>
                </div>
              )}

              {isLateMorningExecution && !isMorningFirstBlock && (
                <div
                  role="region"
                  aria-label="Late-morning continuity and pre-lunch execution contract"
                  style={{
                    marginTop: 10,
                    padding: "10px 10px 8px",
                    borderRadius: 6,
                    background: "#fefce8",
                    border: "1px solid #facc15",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 900,
                      marginBottom: 4,
                      color: "#854d0e",
                    }}
                  >
                    {LATE_MORNING_TITLE}
                  </div>
                  <div style={{ marginBottom: 6, color: "#713f12", fontSize: 12 }}>
                    {LATE_MORNING_HEADLINE}
                  </div>
                  <ol
                    style={{
                      margin: 0,
                      paddingLeft: 18,
                      fontSize: 12,
                      color: "#1f2937",
                      lineHeight: 1.5,
                    }}
                  >
                    <li style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>Why this plan can carry the rest of the morning:</span>{" "}
                      {LATE_MORNING_CARRY_PROOF}
                    </li>
                    <li style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>Slowdown vs a broken plan:</span>{" "}
                      {LATE_MORNING_SLOWDOWN_NORMAL}
                    </li>
                    <li style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>When the lane actually changed:</span>{" "}
                      {LATE_MORNING_REAL_MISMATCH}
                    </li>
                    <li style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>Finish/trim/resequence manually first:</span>{" "}
                      {LATE_MORNING_MANUAL_RESEQUENCE}
                    </li>
                    <li style={{ marginBottom: 0 }}>
                      <span style={{ fontWeight: 600 }}>Pre-lunch rerun threshold:</span>{" "}
                      {LATE_MORNING_RERUN_THRESHOLD}
                    </li>
                  </ol>
                  <div
                    style={{
                      marginTop: 10,
                      padding: "8px 10px",
                      borderRadius: 6,
                      background: "#fefce8",
                      border: "1px dashed #eab308",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 900,
                        marginBottom: 4,
                        color: "#854d0e",
                      }}
                    >
                      {PRE_LUNCH_TITLE}
                    </div>
                    <div style={{ marginBottom: 6, color: "#713f12", fontSize: 12 }}>
                      {PRE_LUNCH_HEADLINE}
                    </div>
                    <ol
                      style={{
                        margin: 0,
                        paddingLeft: 18,
                        fontSize: 12,
                        color: "#1f2937",
                        lineHeight: 1.5,
                      }}
                    >
                      <li style={{ marginBottom: 4 }}>
                        <span style={{ fontWeight: 600 }}>Why this plan carries through lunch:</span>{" "}
                        {PRE_LUNCH_THROUGH_LUNCH_PROOF}
                      </li>
                      <li style={{ marginBottom: 4 }}>
                        <span style={{ fontWeight: 600 }}>Manageable drift vs a broken half-day:</span>{" "}
                        {PRE_LUNCH_MANAGEABLE_DRIFT}
                      </li>
                      <li style={{ marginBottom: 4 }}>
                        <span style={{ fontWeight: 600 }}>As lunch approaches, trim/resequence by hand:</span>{" "}
                        {PRE_LUNCH_TRIM_RESEQUENCE_GUIDE}
                      </li>
                      <li style={{ marginBottom: 4 }}>
                        <span style={{ fontWeight: 600 }}>Default afternoon behavior:</span>{" "}
                        {PRE_LUNCH_AFTERNOON_INHERIT_RULE}
                      </li>
                      <li style={{ marginBottom: 0 }}>
                        <span style={{ fontWeight: 600 }}>When the afternoon deserves a fresh rerun:</span>{" "}
                        {PRE_LUNCH_AFTERNOON_RERUN_THRESHOLD}
                      </li>
                    </ol>
                  </div>
                </div>
              )}

              {isAfterLunchExecution &&
                !isMorningFirstBlock &&
                !isLateMorningExecution &&
                !isLateAfternoonExecution && (
                <div
                  role="region"
                  aria-label="After-lunch inheritance contract"
                  style={{
                    marginTop: 10,
                    padding: "10px 10px 8px",
                    borderRadius: 6,
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 900,
                      marginBottom: 4,
                      color: "#1d4ed8",
                    }}
                  >
                    {content.appliedStateBundle.afterLunchTitle}
                  </div>
                  <div style={{ marginBottom: 6, color: "#1e3a8a", fontSize: 12 }}>
                    {content.appliedStateBundle.afterLunchHeadline}
                  </div>
                  <ol
                    style={{
                      margin: 0,
                      paddingLeft: 18,
                      fontSize: 12,
                      color: "#1f2937",
                      lineHeight: 1.5,
                    }}
                  >
                    <li style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>When the existing plan still carries:</span>{" "}
                      {content.appliedStateBundle.afterLunchWhenPlanCarries}
                    </li>
                    <li style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>Harmless lunch-time disruption:</span>{" "}
                      {content.appliedStateBundle.afterLunchHarmlessDisruptions}
                    </li>
                    <li style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>When lunch actually broke the plan:</span>{" "}
                      {content.appliedStateBundle.afterLunchPlanBreakers}
                    </li>
                    <li style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>Carry forward without guilt:</span>{" "}
                      {content.appliedStateBundle.afterLunchCarryForwardTriage}
                    </li>
                    <li style={{ marginBottom: 0 }}>
                      <span style={{ fontWeight: 600 }}>Calm post-lunch rerun rule:</span>{" "}
                      {content.appliedStateBundle.afterLunchRerunWorthIt}{" "}
                      {content.appliedStateBundle.afterLunchRerunNotNeeded}
                    </li>
                  </ol>
                </div>
              )}

              {isLateAfternoonExecution && !isMorningFirstBlock && !isLateMorningExecution && (
                <div
                  role="region"
                  aria-label="Late-afternoon continuity contract"
                  style={{
                    marginTop: 10,
                    padding: "10px 10px 8px",
                    borderRadius: 6,
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 900,
                      marginBottom: 4,
                      color: "#991b1b",
                    }}
                  >
                    {LATE_AFTERNOON_TITLE}
                  </div>
                  <div style={{ marginBottom: 6, color: "#7f1d1d", fontSize: 12 }}>
                    {LATE_AFTERNOON_HEADLINE}
                  </div>
                  <ol
                    style={{
                      margin: 0,
                      paddingLeft: 18,
                      fontSize: 12,
                      color: "#111827",
                      lineHeight: 1.5,
                    }}
                  >
                    <li style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>When the existing plan still deserves to carry:</span>{" "}
                      {LATE_AFTERNOON_WHEN_PLAN_STILL_CARRIES}
                    </li>
                    <li style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>Normal late-day slowdown vs a broken day:</span>{" "}
                      {LATE_AFTERNOON_NORMAL_SLOWDOWN}
                    </li>
                    <li style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>When today actually changed shape:</span>{" "}
                      {LATE_AFTERNOON_REAL_SCOPE_RESET}
                    </li>
                    <li style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>Keep only the still-valuable tasks:</span>{" "}
                      {LATE_AFTERNOON_CARRY_FORWARD_TRIAGE}
                    </li>
                    <li style={{ marginBottom: 0 }}>
                      <span style={{ fontWeight: 600 }}>Calm end-of-day carryforward vs rerun:</span>{" "}
                      {LATE_AFTERNOON_END_OF_DAY_VS_TOMORROW}
                    </li>
                  </ol>
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    background: "#f0fdf4",
                    border: "1px solid #86efac",
                  }}
                >
                  <div style={{ fontWeight: 900, marginBottom: 4, color: "#047857" }}>Now</div>
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontWeight: 800 }}>Do next:</span> {EW_NOW}{" "}
                    {nextActionLabel ? (
                      <span style={{ color: "#065f46" }}>({nextActionLabel})</span>
                    ) : null}
                  </div>
                  <div style={{ color: "#065f46" }}>
                    <span style={{ fontWeight: 800 }}>Keep working when:</span> {KEEP_WORKING_THRESHOLD}
                  </div>
                </div>

                <div
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    background: "#f0fdf4",
                    border: "1px solid #86efac",
                  }}
                >
                  <div style={{ fontWeight: 900, marginBottom: 4, color: "#047857" }}>Can wait</div>
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontWeight: 800 }}>Ignore for now:</span>{" "}
                    {reviewSummary && reviewSummary.total > 0
                      ? `Remaining cards (${reviewSummary.total}): ${reviewSummary.items.join(" · ")}. ${EW_CAN_WAIT}`
                      : EW_CAN_WAIT}
                  </div>
                  <div style={{ marginBottom: 6, color: "#065f46" }}>
                    <span style={{ fontWeight: 800 }}>Later today:</span> {EW_LATER_TODAY}
                  </div>
                  <div style={{ color: "#065f46" }}>
                    <span style={{ fontWeight: 800 }}>Stop rule:</span> {SELF_TRUST_STOP_RULE}
                  </div>
                  <div style={{ marginTop: 4, color: "#065f46" }}>
                    <span style={{ fontWeight: 800 }}>Can stay untouched:</span> {EW_WHAT_CAN_STAY_UNTOUCHED}
                  </div>
                </div>

                <div
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    background: "#f0fdf4",
                    border: "1px solid #86efac",
                  }}
                >
                  <div style={{ fontWeight: 900, marginBottom: 4, color: "#047857" }}>
                    Checkpoint (optional)
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontWeight: 800 }}>Timing:</span> {EW_CHECKPOINT_WINDOW}
                  </div>
                  <div style={{ color: "#065f46", marginBottom: 6 }}>
                    <span style={{ fontWeight: 800 }}>Decision:</span> {EW_CHECKPOINT_DECISION}
                  </div>
                  <div style={{ color: "#065f46" }}>
                    <span style={{ fontWeight: 800 }}>Resume later:</span> {EW_RESUME_LATER_WITHOUT_RERUN}
                  </div>
                </div>

                <div
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    background: "#f0fdf4",
                    border: "1px solid #86efac",
                  }}
                >
                  <div style={{ fontWeight: 900, marginBottom: 4, color: "#047857" }}>
                    Interrupt vs rerun
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontWeight: 800 }}>Interruption:</span> {EW_INTERRUPTION_RULE}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontWeight: 800 }}>Full rerun:</span> {EW_RERUN_ONLY_IF}
                  </div>
                  <div style={{ color: "#065f46" }}>
                    <span style={{ fontWeight: 800 }}>Avoid rerun when:</span> {RERUN_AVOID_THRESHOLD}
                  </div>
                  <div style={{ marginTop: 4, color: "#065f46" }}>
                    <span style={{ fontWeight: 800 }}>Blocker boundary:</span> {EW_BLOCKER_BOUNDARY}
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: 10,
                  padding: "10px 10px 8px",
                  borderRadius: 6,
                  background: "#ecfdf5",
                  border: "1px solid #6ee7b7",
                }}
              >
                <div
                  style={{
                    fontWeight: 900,
                    marginBottom: 4,
                    color: "#047857",
                  }}
                >
                  {SAFE_STOP_TITLE}
                </div>
                <div style={{ marginBottom: 6, color: "#047857" }}>
                  {SAFE_STOP_HEADLINE}
                </div>
                <ol
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    fontSize: 12,
                    color: "#065f46",
                    lineHeight: 1.5,
                  }}
                >
                  <li style={{ marginBottom: 4 }}>{SAFE_STOP_DONE_FOR_NOW}</li>
                  <li style={{ marginBottom: 4 }}>
                    {SAFE_STOP_NEXT_RESTART_POINT}{" "}
                    {nextActionLabel ? (
                      <span style={{ fontWeight: 600 }}>
                        Restart cue: {nextActionLabel}
                      </span>
                    ) : null}
                  </li>
                  <li style={{ marginBottom: 4 }}>
                    {SAFE_STOP_CAN_STAY_UNTOUCHED_UNTIL_TOMORROW}
                  </li>
                  <li style={{ marginBottom: 4 }}>{SAFE_STOP_RERUN_WORTH_IT}</li>
                  <li style={{ marginBottom: 0 }}>
                    {SAFE_STOP_AVOID_RERUN_FOR_REASSURANCE} {SAFE_STOP_PAUSE_WITHOUT_GUILT}
                  </li>
                </ol>
              </div>

              <div
                style={{
                  marginTop: 10,
                  padding: "10px 10px 8px",
                  borderRadius: 6,
                  background: "#f0fdf4",
                  border: "1px solid #6ee7b7",
                }}
              >
                <div
                  style={{
                    fontWeight: 900,
                    marginBottom: 4,
                    color: "#047857",
                  }}
                >
                  {DONE_FOR_TODAY_TITLE}
                </div>
                <div style={{ marginBottom: 6, color: "#047857" }}>
                  {DONE_FOR_TODAY_HEADLINE}
                </div>
                <ol
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    fontSize: 12,
                    color: "#065f46",
                    lineHeight: 1.5,
                  }}
                >
                  <li style={{ marginBottom: 4 }}>{DONE_FOR_TODAY_COMPLETION_RULE}</li>
                  <li style={{ marginBottom: 4 }}>
                    {DONE_FOR_TODAY_TOMORROW_RESTART}{" "}
                    {nextActionLabel ? (
                      <span style={{ fontWeight: 600 }}>
                        Tomorrow restart cue: {nextActionLabel}
                      </span>
                    ) : null}
                  </li>
                  <li style={{ marginBottom: 4 }}>{DONE_FOR_TODAY_OVERNIGHT_CAN_WAIT}</li>
                  <li style={{ marginBottom: 4 }}>{DONE_FOR_TODAY_NORMAL_RESUME_VS_RERUN}</li>
                  <li style={{ marginBottom: 0 }}>{DONE_FOR_TODAY_RERUN_TRIGGERS}</li>
                </ol>
              </div>
            </div>
          )}
          {showAppliedState && content.appliedStateBundle && (
            <div
              role="region"
              aria-label="Overnight carryforward contract"
              style={{
                marginTop: 10,
                padding: "10px 10px 8px",
                borderRadius: 6,
                background: "#f9fafb",
                border: "1px solid #e5e7eb",
              }}
            >
              <div
                style={{
                  fontWeight: 900,
                  marginBottom: 4,
                  color: "#111827",
                }}
              >
                {content.appliedStateBundle.carryforwardTitle}
              </div>
              <div style={{ marginBottom: 6, color: "#374151", fontSize: 12 }}>
                {content.appliedStateBundle.carryforwardHeadline}
              </div>
              <ol
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  fontSize: 12,
                  color: "#4b5563",
                  lineHeight: 1.5,
                }}
              >
                <li style={{ marginBottom: 4 }}>
                  {content.appliedStateBundle.carryforwardWhatStaysStable}
                </li>
                <li style={{ marginBottom: 4 }}>
                  {content.appliedStateBundle.carryforwardFirstMoveTomorrow}{" "}
                  {nextActionLabel ? (
                    <span style={{ fontWeight: 600 }}>
                      Tomorrow restart cue: {nextActionLabel}
                    </span>
                  ) : null}
                </li>
                <li style={{ marginBottom: 4 }}>
                  {content.appliedStateBundle.carryforwardPlanStillFitsSignals}
                </li>
                <li style={{ marginBottom: 0 }}>
                  {content.appliedStateBundle.carryforwardRerunOnlyIfOvernightShift}
                </li>
              </ol>
            </div>
          )}
          {showAppliedState && content.appliedStateBundle && (
            <div
              role="region"
              aria-label="Tomorrow morning restart contract"
              style={{
                marginTop: 10,
                padding: "10px 10px 8px",
                borderRadius: 6,
                background: "#ecfdf5",
                border: "1px solid #6ee7b7",
              }}
            >
              <div
                style={{
                  fontWeight: 900,
                  marginBottom: 4,
                  color: "#047857",
                }}
              >
                {content.appliedStateBundle.morningRestartTitle}
              </div>
              <div style={{ marginBottom: 6, color: "#047857", fontSize: 12 }}>
                {content.appliedStateBundle.morningRestartHeadline}
              </div>
              <ol
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  fontSize: 12,
                  color: "#065f46",
                  lineHeight: 1.5,
                }}
              >
                <li style={{ marginBottom: 4 }}>
                  {content.appliedStateBundle.morningRestartFirstMove}{" "}
                  {nextActionLabel ? (
                    <span style={{ fontWeight: 600 }}>
                      Morning cue: {nextActionLabel}
                    </span>
                  ) : null}
                </li>
                <li style={{ marginBottom: 4 }}>
                  {content.appliedStateBundle.morningRestartWhatStaysUntouched}
                </li>
                <li style={{ marginBottom: 4 }}>
                  {content.appliedStateBundle.morningRestartFrictionNormal}
                </li>
                <li style={{ marginBottom: 0 }}>
                  {content.appliedStateBundle.morningRestartRerunOnlyIf}
                </li>
              </ol>
            </div>
          )}
        </div>
      </div>

      {reviewSummary && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            fontSize: 12,
            lineHeight: 1.5,
            color: "#374151",
          }}
        >
          <div style={{ fontWeight: 600, color: "#111827" }}>
            Ready to review: {reviewSummary.total} suggestion{reviewSummary.total === 1 ? "" : "s"}
          </div>
          <div style={{ color: "#4b5563", marginTop: 2 }}>
            {reviewSummary.items.join(" · ")}
          </div>
          <div style={{ color: "#6b7280", marginTop: 4 }}>
            {phase === "fallback"
              ? "You only need one good option. You don’t need to decide everything now — pick what feels useful, or come back and review later; your place here is saved."
              : "Review them one at a time — approving one suggestion won’t apply the others."}
          </div>
        </div>
      )}
    </div>
  );
}
