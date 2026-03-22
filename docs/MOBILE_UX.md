# Mobile / Android UX

The app is tuned for small screens and touch:

- **Viewport:** `width=device-width, initial-scale=1, viewport-fit=cover` in `_app.js` (notch / gesture areas).
- **Safe areas:** `--rs-safe-*` tokens in `globals.css`; main content, mobile top bar, sidebar drawer, and modals add `env(safe-area-inset-*)`.
- **Height:** `100dvh` on shell/layout/sidebar so Android Chrome’s dynamic toolbar doesn’t clip the layout.
- **Navigation drawer:** Below ~1080px, nav is a slide-out drawer; opening it sets `body.rs-drawer-open` (no background scroll).
- **Touch:** `touch-action: manipulation` on primary chrome buttons; drawer links use **48px** min height.
- **Forms:** `.rs-form-grid-2` stacks to one column under **520px** (templates, category edit, backlog modals).
- **Inputs:** Under **540px**, key inputs use **16px** font to reduce iOS zoom-on-focus and improve readability on Android.
- **Landing / weekly review:** Responsive grids via `.rs-landing-*` and `.rs-weekly-*` classes.

When adding new pages, prefer **single-column** layouts under ~640px, **min-width: 0** on flex children, and avoid fixed widths wider than the viewport.
