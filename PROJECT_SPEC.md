# Rise & Shine Dashboard — Project Spec

## Core Philosophy
The system should minimize cognitive load and always suggest the **next most impactful action**.

User goal:
- brain dump tasks
- system prioritizes
- user executes next optimized action

Inspired by:
- Eisenhower matrix
- 80/20 principle
- momentum psychology

---

# Core Features

## Task Management
Tasks support:
- category
- subcategory
- tags
- priority
- effort_hours
- due_date
- status (todo / doing / done / archived)

Subtasks are tasks with `parent_task_id`.

Delete = archive only.

---

## Tags
High-signal tags:

quick-win  
high-leverage  
urgent  
blocked  
waiting  
deep  
physical  
low-energy  

Tags influence outcome selection.

---

## Daily Templates
Users create daily routines.

Templates contain ordered tasks.

Example:
Morning Routine
Evening Routine
Travel Routine

Drag/drop ordering required.

---

## Today Page
Displays:

Workout  
Daily template tasks  
3 Key Outcomes

Key outcomes algorithm:

1. Quick Win
2. High Leverage
3. Progress Task

Scoring factors:

priority  
category weight  
staleness  
tags  
effort penalty  
subtask boost  

Mode modifies category weights.

Modes:
Strategic Push
Build & Physical
Deep Cognitive
Maintenance
Light / Reset
Custom

---

## Event Logging
All actions recorded in `task_events`.

Examples:

completed
uncompleted
archived
restored
tag_added
tag_removed

Used for analytics.

---

## Analytics
Show:

7-day momentum
30-day momentum
completion timestamps
time-of-day productivity
streaks
category completion counts
tag usage

---

## Health Tracking

Body weight logs.

Weightlifting tracking:

session
exercise
weight
reps
set_number

Charts show progression.

---

## Ideas Inbox

Capture business ideas.

Ideas can be promoted to tasks.

---

## Notes

Daily notes visible in UI.

---

## Personal Category

Subcategories:

Family
Admin / Life Ops
Finance
Health
Learning
Social
Errands
Relationships
Spiritual / Mindset
Fun / Adventure
Personal Projects

---

## Technology Stack

Frontend:
Next.js

Backend:
Supabase Postgres

Auth:
Supabase Auth

Charts:
Recharts

Drag/Drop:
@dnd-kit

---

## Design Goals

Clean  
Minimal friction  
Keyboard friendly  
Fast interactions

No heavy UI frameworks required.
