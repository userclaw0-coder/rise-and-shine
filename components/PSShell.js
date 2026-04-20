import { useCallback, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabaseClient";
import PSCoach from "./PSCoach";

export const PS_NAV = [
  { id: "map", href: "/system", label: "System Map", idx: "01", section: "Foundations" },
  { id: "vision", href: "/vision", label: "Vision & Goals", idx: "02", section: "Foundations" },
  { id: "today", href: "/today", label: "Today", idx: "03", section: "Daily" },
  { id: "hits", href: "/templates", label: "Daily Hits", idx: "04", section: "Daily" },
  { id: "projects", href: "/projects", label: "Projects", idx: "05", section: "Daily" },
  { id: "fitness", href: "/health", label: "Body & Training", idx: "06", section: "Daily" },
  { id: "review", href: "/weekly-review", label: "Weekly review", idx: "07", section: "Strategic" },
];

export const PS_NAV_ALSO = [
  { id: "ideas", href: "/ideas", label: "Ideas" },
  { id: "jarvis", href: "/chat", label: "Jarvis" },
  { id: "actions", href: "/backlog", label: "Action items" },
  { id: "notes", href: "/notes", label: "Notes" },
  { id: "analytics", href: "/analytics", label: "Analytics" },
];

const SECTIONS = ["Foundations", "Daily", "Strategic"];

export default function PSShell({
  scope,
  scopeHint,
  coachPayload,
  coachSuggestions,
  coachDisabled = false,
  title,
  children,
}) {
  const router = useRouter();
  const path = router.pathname;
  const { user, isCheckingAuth } = useAuth();
  const [coachOpen, setCoachOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = localStorage.getItem("rs-ps-coach");
      if (saved === "closed") return false;
      return true;
    } catch {
      return true;
    }
  });
  const [navOpen, setNavOpen] = useState(false);

  const toggleCoach = useCallback(() => {
    setCoachOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem("rs-ps-coach", next ? "open" : "closed");
      } catch {
        // noop
      }
      return next;
    });
  }, []);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, []);

  const activeId = (() => {
    const all = [...PS_NAV, ...PS_NAV_ALSO];
    const byScope = all.find((n) => n.id === scope);
    if (byScope) return byScope.id;
    const byPath = all.find((n) => {
      if (n.href === path) return true;
      if (n.href === "/projects" && path.startsWith("/category/")) return true;
      return false;
    });
    return byPath?.id || scope;
  })();

  if (isCheckingAuth) {
    return (
      <div className="ps-shell-loading">
        <p>Loading…</p>
        <style jsx>{`
          .ps-shell-loading {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #ece6da;
            font-family: -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif;
            color: #655e4f;
            font-size: 14px;
          }
        `}</style>
      </div>
    );
  }

  if (!user) return null;

  const initials = (user.email || "?").slice(0, 1).toUpperCase();
  const emailPrefix = (user.email || "").split("@")[0];

  return (
    <>
      <Head>
        <title>
          {title ? title + " · " : ""}Rise &amp; Shine
        </title>
      </Head>
      <div className="ps-app">
        <button
          type="button"
          className="ps-mobile-menu"
          aria-label="Open navigation"
          onClick={() => setNavOpen(true)}
        >
          <span />
          <span />
          <span />
        </button>

        {navOpen && (
          <div
            className="ps-rail-scrim"
            onClick={() => setNavOpen(false)}
            role="presentation"
          />
        )}

        <nav className={"ps-rail" + (navOpen ? " ps-rail--open" : "")}>
          <div className="ps-brand">
            <div className="ps-brand-mark">r</div>
            <div>
              <div className="ps-brand-title">Rise &amp; Shine</div>
              <div className="ps-brand-sub">Planning System</div>
            </div>
          </div>

          {SECTIONS.map((sec) => (
            <div key={sec} className="ps-rail-section">
              <div className="ps-rail-cap">{sec}</div>
              <div className="ps-rail-list">
                {PS_NAV.filter((n) => n.section === sec).map((n) => (
                  <a
                    key={n.id}
                    href={n.href}
                    className={
                      "ps-rail-item" + (n.id === activeId ? " active" : "")
                    }
                    onClick={() => setNavOpen(false)}
                  >
                    <span className="ps-rail-idx">{n.idx}</span>
                    <span className="ps-rail-label">{n.label}</span>
                  </a>
                ))}
              </div>
            </div>
          ))}

          <div className="ps-rail-section">
            <div className="ps-rail-cap">Also in app</div>
            <div className="ps-rail-list">
              {PS_NAV_ALSO.map((n) => (
                <a
                  key={n.id}
                  href={n.href}
                  className={
                    "ps-rail-item" + (n.id === activeId ? " active" : "")
                  }
                  onClick={() => setNavOpen(false)}
                >
                  <span className="ps-rail-idx">·</span>
                  <span className="ps-rail-label">{n.label}</span>
                </a>
              ))}
            </div>
          </div>

          <div className="ps-rail-footer">
            <div className="ps-rail-user">
              <div className="ps-rail-avatar">{initials}</div>
              <div className="ps-rail-user-body">
                <div className="ps-rail-user-name">{emailPrefix || "You"}</div>
                <div className="ps-rail-user-sub">The curator</div>
              </div>
            </div>
            <button
              type="button"
              className="ps-rail-signout"
              onClick={handleSignOut}
            >
              Sign out
            </button>
          </div>
        </nav>

        <main className="ps-canvas">
          <div className="ps-canvas-scroll">{children}</div>
        </main>

        {!coachDisabled && (
          <PSCoach
            scope={scope}
            scopeHint={scopeHint}
            payload={coachPayload}
            suggestions={coachSuggestions}
            collapsed={!coachOpen}
            onToggle={toggleCoach}
          />
        )}
      </div>

      <style jsx global>{`
        html,
        body,
        #__next {
          margin: 0;
          padding: 0;
          height: 100%;
          min-height: 100vh;
        }
        body {
          background: #ece6da;
          font-family: -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif;
          color: var(--ps-ink);
        }
        .ps-app {
          display: flex;
          min-height: 100vh;
          background:
            radial-gradient(1400px 800px at 15% -10%, #f5e7cf 0%, transparent 55%),
            radial-gradient(1000px 600px at 90% 110%, #efdcc8 0%, transparent 55%),
            #ece6da;
          color: var(--ps-ink);
        }

        /* Left rail */
        .ps-rail {
          width: 248px;
          flex-shrink: 0;
          padding: 28px 22px 20px;
          border-right: 1px solid var(--ps-ink-08);
          background: rgba(255, 251, 243, 0.55);
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          position: sticky;
          top: 0;
          max-height: 100vh;
        }
        .ps-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 26px;
        }
        .ps-brand-mark {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          background: linear-gradient(135deg, var(--ps-accent), var(--ps-clay));
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-family: var(--ps-serif);
          font-size: 15px;
          font-style: italic;
        }
        .ps-brand-title {
          font-size: 13px;
          font-weight: 500;
          letter-spacing: -0.01em;
          color: var(--ps-ink);
        }
        .ps-brand-sub {
          font-family: var(--ps-mono);
          font-size: 9px;
          color: var(--ps-ink-50);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-top: 2px;
        }
        .ps-rail-section + .ps-rail-section {
          margin-top: 18px;
        }
        .ps-rail-cap {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-ink-40);
          margin: 0 0 8px;
        }
        .ps-rail-list {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        .ps-rail-item {
          appearance: none;
          border: none;
          background: transparent;
          cursor: pointer;
          text-align: left;
          padding: 8px 10px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          gap: 10px;
          color: var(--ps-ink-60);
          text-decoration: none;
          transition: background 120ms, color 120ms;
        }
        .ps-rail-item:hover {
          background: var(--ps-ink-05);
          color: var(--ps-ink);
        }
        .ps-rail-item.active {
          background: var(--ps-ink);
          color: var(--ps-bg);
        }
        .ps-rail-item.active .ps-rail-idx {
          color: rgba(255, 251, 243, 0.5);
        }
        .ps-rail-idx {
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-40);
          min-width: 14px;
        }
        .ps-rail-label {
          font-size: 13px;
          font-weight: 450;
        }
        .ps-rail-footer {
          margin-top: auto;
          padding-top: 20px;
          border-top: 1px solid var(--ps-ink-08);
        }
        .ps-rail-user {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ps-rail-avatar {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          background: var(--ps-accent-soft);
          color: var(--ps-accent);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--ps-serif);
          font-size: 13px;
          font-weight: 500;
          flex-shrink: 0;
        }
        .ps-rail-user-body {
          min-width: 0;
        }
        .ps-rail-user-name {
          font-size: 12px;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ps-rail-user-sub {
          font-family: var(--ps-mono);
          font-size: 10px;
          color: var(--ps-ink-50);
        }
        .ps-rail-signout {
          margin-top: 12px;
          width: 100%;
          appearance: none;
          border: 1px solid var(--ps-ink-15);
          background: transparent;
          padding: 6px 10px;
          border-radius: 6px;
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ps-ink-60);
          cursor: pointer;
        }
        .ps-rail-signout:hover {
          border-color: var(--ps-ink);
          color: var(--ps-ink);
        }

        /* Canvas */
        .ps-canvas {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }
        .ps-canvas-scroll {
          flex: 1;
          min-height: 100vh;
        }

        /* Mobile hamburger */
        .ps-mobile-menu {
          display: none;
          position: fixed;
          top: 12px;
          left: 12px;
          z-index: 40;
          width: 38px;
          height: 38px;
          border-radius: 8px;
          background: rgba(255, 251, 243, 0.92);
          border: 1px solid var(--ps-ink-10);
          padding: 0;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 4px;
          cursor: pointer;
        }
        .ps-mobile-menu span {
          display: block;
          width: 18px;
          height: 1.5px;
          background: var(--ps-ink);
        }
        .ps-rail-scrim {
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(26, 24, 20, 0.4);
          z-index: 50;
        }

        @media (max-width: 900px) {
          .ps-mobile-menu {
            display: flex;
          }
          .ps-rail-scrim {
            display: block;
          }
          .ps-rail {
            position: fixed;
            top: 0;
            left: 0;
            height: 100vh;
            z-index: 60;
            transform: translateX(-100%);
            transition: transform 240ms ease;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.08);
            background: rgba(255, 251, 243, 0.98);
          }
          .ps-rail.ps-rail--open {
            transform: translateX(0);
          }
          .ps-rail-scrim {
            z-index: 55;
          }
        }
      `}</style>
    </>
  );
}
