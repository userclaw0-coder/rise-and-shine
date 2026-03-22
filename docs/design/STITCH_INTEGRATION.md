# Stitch design guides — integrated spec

This document records how the three Stitch PRD screen plans were merged into Rise & Shine.  
**Source folder (your machine):**  
`/home/clawofhank/cursor-well-wishes/CodexWellWishes/stitch_rise_and_shine_prd_screen_plan/`

Subfolders:

- `serene_aura/DESIGN.md` — Digital Sanctuary, Manrope + Work Sans, gold gradient CTAs  
- `aura_dashboard/DESIGN.md` — Mindful Curator, adds Inter for labels; slightly different hex values  
- `serene_sunrise/DESIGN.md` — Dawn Horizon, Plus Jakarta + Inter, **blue** secondary for some components  

## Conflict resolution (functional + on-brand)

| Topic | Choice |
|--------|--------|
| **Fonts** | **Manrope** (headlines / brand) + **Work Sans** (body / UI). Matches two of three guides; avoids a third font stack for maintainability. |
| **Surface base** | Warm off-white stack aligned with **serene_sunrise** / **aura** (`#fbf9f5` → `#f5f3ef` → `#ffffff`) for clear tonal layering. |
| **Primary / gold** | Single warm gold ramp for CTAs and active nav (gradient **~135deg**), not the blue “Morning Progress Rail” from sunrise (keeps one accent system). |
| **Borders** | **No-line** preference: sectioning via **background shifts**; **ghost** borders only where needed (e.g. subtle nav outline ~15% opacity). |
| **Shadows** | Soft, warm-tinted ambient shadow (low opacity), not heavy Material-style drops. |
| **Implementation** | **CSS variables** in `styles/globals.css` + shared classes on **DashboardLayout**, **SectionCard**, **Modal**; app-wide fonts via `_app.js`. |
| **Shell** | **Left sidebar** (Material Symbols + olive **Start on Today** CTA) on desktop; **drawer + top bar** under ~1080px. |
| **Editorial type** | **Cormorant Garamond** (`--rs-font-serif`) for page titles via **`PageHeader`**. |
| **Olive / gold** | `--rs-olive` / `--rs-accent-gold` for CTAs, charts, and dark insight panels. |

Individual pages still use many inline styles; over time, prefer `var(--rs-*)` or shared classes for new UI.

## Action Items (backlog) — strategic cards

- **Default (“Strategic”)**: `components/BacklogStrategicTaskCard.js` — metadata row (category pill, due, status), serif title, **strategic score** (gold emphasis when ≥ 65), subtasks with **+ N more** / show fewer, tag pills with **+ n more**, full field grid preserved (category, subcategory, priority, effort, due, status, outcome, domain, tag editor).
- **Compact list**: previous dense grid for power users; toggle next to search.
- **Quick capture** bar + **⌘K / Ctrl+K** open add-task modal; **FAB** mirrors add.
- Styles: `styles/globals.css` (`.rs-backlog-*`).
