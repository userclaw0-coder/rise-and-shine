
# ONBOARDING_FLOW.md
Rise & Shine – Guided Onboarding Flow

Purpose:
Help users define vision, understand their current situation, and create structured data that the AI planning engine can use to recommend the next best actions.

Total onboarding time target: 10–15 minutes.

Voice:
Calm operator coach. Clear, strategic, encouraging but not motivational hype.

---

## Stage 1 – Identity & Vision (Destination)

### Step 1: Identity Statement
Prompt:
“Imagine yourself three years from now living the life you truly want. What kind of person are you?”

Store:
identity_attributes[]

Examples:
- Calm and disciplined
- Creative builder
- Financially independent
- Healthy and energetic

---

### Step 2: Life Domain Vision
Users provide a short statement for each domain:

Domains:
- Business / Work
- Financial
- Health / Energy
- Relationships / Family
- Lifestyle / Freedom
- Learning / Personal Growth

Store:
life_domains

Example:
Health → “Lean, strong, active every day.”

---

### Step 3: Desired Outcomes
Prompt:
“What specific outcomes would make the next 12 months a major success?”

Examples:
- Launch a profitable consulting service
- Build rental income to $3k/month
- Lose 25 pounds

Store:
desired_outcomes[]

---

## Stage 2 – Six Human Needs Assessment

Based on Tony Robbins’ framework.

Needs:
1. Certainty
2. Variety
3. Significance
4. Love & Connection
5. Growth
6. Contribution

### Step 4: Needs Score
User rates each need 1–10.

Store:
human_needs_scores

### Step 5: Current Strategies
“How do you currently meet each need?”

Store:
human_needs_strategies

### Step 6: Unhelpful Patterns
“Are there ways you meet these needs that don’t serve you?”

Store:
needs_risk_patterns

---

## Stage 3 – Current Situation

### Step 7: Brain Dump
Prompt:
“List everything currently on your mind.”

AI organizes into:
tasks
projects
ideas
constraints

---

### Step 8: Resources & Constraints

Examples:
Resources:
- skills
- tools
- relationships

Constraints:
- time
- finances
- obligations

Store:
resources[]
constraints[]

---

### Step 9: Time & Energy Profile

Questions:
- Weekly available hours
- Best time of day for deep work

Store:
available_hours
energy_profile

---

## Stage 4 – Strategic Focus

### Step 10: Leverage Areas
“What areas would create the biggest positive change?”

Store:
leverage_focus[]

---

### Step 11: Top Three Priorities
“If you could only make progress in three areas this quarter, what would they be?”

Store:
quarter_focus[]

---

## Stage 5 – First Action

### Step 12: Immediate Step
“What is one small action you could take today to move forward?”

This seeds the first task.

---

## Weekly Review

Every week the AI asks:
- What progress did you make?
- What blocked you?
- What opportunities appeared?
- Re-rate the Six Human Needs

AI adjusts priorities accordingly.
