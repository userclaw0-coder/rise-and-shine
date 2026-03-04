
# NEXT_ACTION_ALGO_V2.md
Rise & Shine – Next 3 Actions Engine (v2)

Goal:
Always show the **next three bite-sized actions** (not “today’s” tasks).
The three remain stable until completed, then the system refills the next three.

---

## Queue Behavior
- Show queue slots 1–3.
- Do **not** backfill immediately when one is checked.
- Only refill when **all three** are completed.
- Provide a “Refresh” button to manually rebuild the queue.

---

## Candidate Pool
Eligible tasks:
- status in (todo, doing)
- not archived
- not a daily-template task (routine)
- subtasks are eligible and may be preferred

Exclude:
- blocked tasks (tag blocked)
- waiting tasks (tag waiting)

---

## Scoring Inputs (Pareto + Eisenhower + Needs Balance)
Score each candidate task with components:

1) **Impact / Leverage (80/20)**
- high-leverage tag → boost
- dependency/unblocker → boost
- direct alignment to top outcomes → boost

2) **Urgency (Eisenhower)**
- urgent tag → boost
- due_date soon → boost
- critical risk mitigation → boost

3) **Importance**
- outcome alignment score
- category weights (Business > Rental > Vehicles > Home > Boat by default)

4) **Momentum**
- quick-win tag OR effort <= 1 hour boosts Quick Win selection
- staleness boost encourages neglected items

5) **Human Needs Balance**
If a need score is low (e.g., Certainty), small boost to tasks that address it.
This boost is subtle and never overwhelms urgency or importance.

---

## Selection Procedure
Select three items in order:

### Slot 1: Quick Win
Pick:
- tag quick-win OR effort <= 30 minutes
- low friction
- not blocked

If none exists:
- propose a quick-win subtask derived from the best leverage task.

### Slot 2: High Leverage
Pick the highest leverage item:
- unblocks other tasks OR
- strongly advances top outcomes

### Slot 3: Progress
Pick a solid progress step:
- ideally different category than slot 2
- maintains forward motion

---

## Subtask Promotion Preference
If a parent task is large (>2 hours or vague),
create a subtask suggestion:
- concrete verb
- 15–60 minutes
- inherits category + priority
- can be tagged quick-win or high-leverage

Subtasks get a score boost (e.g., +6).

---

## Refill Rules
When all 3 queue tasks are completed:
- increment refill_count
- recompute queue using current mode, needs, and events
- store new queue

---
