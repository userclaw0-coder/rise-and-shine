# Rise & Shine — Project Spec

Single source of truth: vision, product behavior, and feature spec. (Merged from root Dashboard spec + docs Strategic Life Operating System.)

---

## Vision & Strategy

**Purpose:** Provide individuals with a system that converts life vision into daily optimized actions.

**Primary promise:** “What is the most efficient way to move from where I am to where I want to be — and how can AI help me get there faster and more reliably?”

**Target user:**
- Primary: General self-improvement users who want structured guidance, practical AI onboarding, and clearer next actions.
- Secondary: AI-curious builders/operators whose work and personal life overlap and who want AI-guided planning and leverage.

**Core system components:**
1. **Vision Engine** — Captures desired outcomes and life direction.
2. **Situation Engine** — Captures current tasks, resources, and constraints.
3. **Action Engine** — Selects next best actions.

**Conceptual frameworks:** Tony Robbins (Six Human Needs), Mel Robbins (action bias, momentum), James Clear (identity-based change), Pareto 80/20, Eisenhower (urgency vs importance).

**Daily system behavior:** User sees next three tasks; once completed, system loads next three. Human needs integration: planner can adjust priority weighting for needs (e.g. certainty, connection, growth). Weekly strategic review: user reflects on progress, blockers, opportunities, needs satisfaction; AI updates recommendations.

---

## Core Philosophy

The system should minimize cognitive load and always suggest the **next most impactful action**.

User goal:
- brain dump tasks
- system prioritizes
- user executes next optimized action

Inspired by: Eisenhower matrix, 80/20 principle, momentum psychology.

---

## Core Features

### Task Management
Tasks support: category, subcategory, tags, priority, effort_hours, due_date, status (todo / doing / done / archived). Subtasks are tasks with `parent_task_id`. Delete = archive only.

### Tags
High-signal tags: quick-win, high-leverage, urgent, blocked, waiting, deep, physical, low-energy. Tags influence outcome selection.

### Daily Templates
Users create daily routines. Templates contain ordered tasks (e.g. Morning Routine, Evening Routine, Travel Routine). Drag/drop ordering required.

### Today Page
Displays: Workout, daily template tasks, **3 Key Outcomes**.

Key outcomes algorithm: (1) Quick Win, (2) High Leverage, (3) Progress Task.

Scoring factors: priority, category weight, staleness, tags, effort penalty, subtask boost. Mode modifies category weights.

Modes: Strategic Push, Build & Physical, Deep Cognitive, Maintenance, Light / Reset, Custom.

### Event Logging
All actions recorded in `task_events` (e.g. completed, uncompleted, archived, restored, tag_added, tag_removed). Used for analytics.

### Analytics
7-day and 30-day momentum, completion timestamps, time-of-day productivity, streaks, category completion counts, tag usage.

### Health Tracking
Body weight logs. Weightlifting: session, exercise, weight, reps, set_number. Charts show progression.

### Ideas Inbox
Capture business ideas. Ideas can be promoted to tasks.

### Notes
Daily notes visible in UI.

### Personal Category
Subcategories: Family, Admin / Life Ops, Finance, Health, Learning, Social, Errands, Relationships, Spiritual / Mindset, Fun / Adventure, Personal Projects.

---

## Core Pages

Today | Backlog | Templates | Analytics | Onboarding | Weekly Review | Vision | Health | Ideas | Notes

---

## Technology Stack

- **Frontend:** Next.js
- **Backend:** Supabase (Postgres)
- **Auth:** Supabase Auth
- **Charts:** Recharts
- **Drag/drop:** @dnd-kit
- **Hosting:** Vercel
- **Automation:** n8n (future)

---

## Design Goals

Clean, minimal friction, keyboard friendly, fast interactions, clear decision support, human-centered planning. No heavy UI frameworks required.

---

## Future Capabilities

AI automation suggestions, business workflow automation, personal AI agents, local-first option.
