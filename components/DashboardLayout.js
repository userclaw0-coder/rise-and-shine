import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";
import { BrandMarkIcon, BrandMarkLockup } from "./BrandMark";

function useLocalDateTime() {
  const [dateTime, setDateTime] = useState("");
  useEffect(() => {
    function update() {
      const now = new Date();
      setDateTime(
        now.toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      );
    }
    update();
    const id = setInterval(update, 60 * 1000);
    return () => clearInterval(id);
  }, []);
  return dateTime;
}

const NAV_LINKS = [
  { href: "/today", label: "Today", icon: "wb_sunny" },
  { href: "/backlog", label: "Action Items", icon: "assignment" },
  { href: "/templates", label: "Daily Hits", icon: "checklist" },
  { href: "/analytics", label: "Analytics", icon: "bar_chart" },
  { href: "/notes", label: "Notes", icon: "sticky_note_2" },
  { href: "/ideas", label: "Ideas", icon: "lightbulb" },
  { href: "/health", label: "Occam Workout", icon: "fitness_center" },
  { href: "/vision", label: "Vision", icon: "visibility" },
  { href: "/account", label: "Account", icon: "person" },
  { href: "/weekly-review", label: "Weekly review", icon: "calendar_month" },
];

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const path = router.pathname;
  const { user } = useAuth();
  const localDateTime = useLocalDateTime();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);

  useEffect(() => {
    closeSidebar();
  }, [path, closeSidebar]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeSidebar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen, closeSidebar]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (sidebarOpen) {
      document.body.classList.add("rs-drawer-open");
    } else {
      document.body.classList.remove("rs-drawer-open");
    }
    return () => document.body.classList.remove("rs-drawer-open");
  }, [sidebarOpen]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="rs-shell rs-app-layout">
      <header className="rs-mobile-topbar" aria-label="App bar">
        <button
          type="button"
          className="rs-menu-btn"
          onClick={openSidebar}
          aria-expanded={sidebarOpen}
          aria-controls="rs-app-sidebar"
          aria-label="Open menu"
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
        <div className="rs-mobile-brand">
          <BrandMarkIcon size={40} alt="" />
          <div className="rs-sidebar-brand__text" style={{ minWidth: 0 }}>
            <div className="rs-brand-title" style={{ fontSize: "1rem" }}>
              Rise &amp; Shine
            </div>
            <div className="rs-sidebar-tagline" style={{ marginTop: 0 }}>
              The mindful curator
            </div>
          </div>
        </div>
      </header>

      <div
        className={`rs-sidebar-scrim${sidebarOpen ? " rs-sidebar-scrim--visible" : ""}`}
        aria-hidden={!sidebarOpen}
        onClick={closeSidebar}
      />

      <aside
        id="rs-app-sidebar"
        className={`rs-sidebar${sidebarOpen ? " rs-sidebar--open" : ""}`}
        aria-label="Main navigation"
      >
        <div className="rs-sidebar-brand rs-sidebar-brand--lockup">
          <BrandMarkLockup maxHeight={88} />
          <p className="rs-sidebar-tagline" style={{ margin: 0 }}>
            The mindful curator
          </p>
        </div>

        <nav className="rs-sidebar-nav" aria-label="Sections">
          {NAV_LINKS.map((link) => {
            const isActive = path === link.href;
            return (
              <button
                key={link.href}
                type="button"
                className={`rs-sidebar-link${isActive ? " rs-sidebar-link--active" : ""}`}
                onClick={() => {
                  router.push(link.href);
                  closeSidebar();
                }}
              >
                <span className="material-symbols-outlined" aria-hidden>
                  {link.icon}
                </span>
                <span>{link.label}</span>
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          className="rs-sidebar-cta"
          onClick={() => {
            router.push("/today");
            closeSidebar();
          }}
        >
          Start on Today
        </button>

        <div className="rs-sidebar-footer">
          {user && (
            <>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--rs-on-surface-variant)",
                  padding: "0 4px 6px",
                  wordBreak: "break-word",
                }}
              >
                {user.email}
              </div>
              {localDateTime && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--rs-on-surface-variant)",
                    opacity: 0.9,
                    padding: "0 4px 8px",
                  }}
                >
                  {localDateTime}
                </div>
              )}
            </>
          )}
          <button type="button" className="rs-sidebar-signout" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="rs-main-wrap">
        <main className="main-content rs-main-inner">{children}</main>
      </div>
    </div>
  );
}
