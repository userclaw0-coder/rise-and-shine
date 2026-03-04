
# AUTOMATION_DETECTOR.md
Rise & Shine – Automation Opportunity Detector (v1)

Goal:
Find safe, high-ROI automation opportunities that reduce repetitive work.
Always approval-based.

---

## Inputs
- task_events history
- repeated tasks or repeated tags
- ideas inbox
- user’s tool access (email, calendar, CRM, etc.)

---

## Detection Heuristics
1) **Repeated task patterns**
If similar tasks appear > 3 times in 14 days, consider automation.

2) **Repeated time blocks**
If user consistently does admin tasks at same time, suggest batching or automation.

3) **Lead follow-up loops**
If user logs multiple “follow up” tasks, suggest automating reminders and templates.

4) **Research loops**
If user repeats “research X”, suggest a saved agent/workflow.

5) **Scheduling loops**
If tasks involve scheduling, suggest calendar automation.

---

## Output Structure
For each suggestion:
- what it automates
- estimated benefit
- recommended tooling (n8n, Zapier, OpenAI API, browser automation)
- required permissions
- safety considerations

---

## Example Output
```json
{
  "automation_opportunities": [
    {
      "title": "Follow-up assistant for leads",
      "what_it_does": "Creates follow-up tasks and drafts emails based on lead notes",
      "benefit": "Saves 30–60 minutes/day and improves consistency",
      "recommended_tooling": ["n8n", "OpenAI API", "Gmail"],
      "permissions_needed": ["Access to Gmail drafts", "Access to lead notes"],
      "risks": ["Accidental sending – require draft-only mode"]
    }
  ]
}
```
---
