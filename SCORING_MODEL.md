# Task Outcome Scoring Model

Final Score =
priority_score
+ category_weight * 8
+ staleness_boost
+ tag_boost
+ subtask_boost
- effort_penalty

---

Priority Score

Critical = 50
High = 40
Medium = 30
Low = 20

---

Category Base Weights

Business = 5
Rental House = 4
Vehicles = 3
Home = 2
Boat = 1
Personal = 2

---

Tag Boosts

quick-win = +6
high-leverage = +6
urgent = +4

---

Subtask Boost

+6

---

Effort Penalty

effort_hours / 2 (max 6)

---

Staleness Boost

days_since_last_completion / 7 * 5
max 3

---

Outcome Selection Order

1 Quick Win
1 High Leverage
1 Progress Task
