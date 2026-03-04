
# WEEKLY_REVIEW_PROMPT.md
Rise & Shine – Weekly Review Prompt (Calm Operator Coach)

Purpose:
Weekly review sets the tone; daily execution stays gentle.
This review rebalances Six Human Needs, updates focus, and surfaces leverage/automation opportunities.

Frequency:
Weekly (suggest Sunday evening or Monday morning).

---

## Inputs the system should pass into the review
- week_start / week_end
- key metrics: tasks completed, streaks, momentum, workouts adherence
- top categories worked on
- notable completed tasks (with timestamps)
- current outcomes and quarter_focus
- current Six Human Needs scores

---

## Weekly Review Questions (User-facing)
1) **Wins**
“What are 1–3 wins from this week? What moved the needle?”

2) **Friction**
“What felt heavy or repeatedly avoided? Why?”

3) **Reality check**
“What changed in your life context (time, energy, constraints)?”

4) **Six Human Needs**
Re-rate each need 1–10:
Certainty, Variety, Significance, Connection, Growth, Contribution.

Then ask:
“What healthy action could raise your lowest-scoring need by 1 point next week?”

5) **Top leverage**
“If you could complete one high-leverage action next week, what would it be?”

6) **Next Week Theme**
Choose a “weekly theme” (one focus area):
Business / Rental / Health / Family / etc.

---

## AI Output (what the system generates)
- updated human_needs_weekly snapshot
- suggested weekly theme + reasoning
- recommended adjustments to category weights (small)
- 3–7 suggested focus tasks to promote into doing
- 2 suggested automations (approval-based)

---

## Output JSON Schema (recommended)
```json
{
  "week_summary": "string",
  "updated_human_needs": {
    "certainty": 1,
    "variety": 1,
    "significance": 1,
    "connection": 1,
    "growth": 1,
    "contribution": 1
  },
  "lowest_need_focus": {
    "need": "certainty",
    "action": "Schedule 30 minutes to review finances and plan next step"
  },
  "weekly_theme": {
    "theme": "Rental House",
    "why": "Permit work is currently the main bottleneck"
  },
  "promote_tasks": ["uuid", "uuid"],
  "automation_suggestions": [
    {
      "title": "string",
      "benefit": "string",
      "tools": ["n8n", "OpenAI API"],
      "requires_approval": true
    }
  ]
}
```
---
