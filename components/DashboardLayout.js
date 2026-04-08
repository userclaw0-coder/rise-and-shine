import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";
import { BrandMarkIcon, BrandMarkLockup } from "./BrandMark";
import OccamNotificationManager from "./OccamNotificationManager";
import ChatPanel from "./ChatPanel";

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
  { href: "/projects", label: "Projects", icon: "view_kanban" },
  { href: "/templates", label: "Daily Hits", icon: "checklist" },
  { href: "/analytics", label: "Analytics", icon: "bar_chart" },
  { href: "/notes", label: "Notes", icon: "sticky_note_2" },
  { href: "/ideas", label: "Ideas", icon: "lightbulb" },
  { href: "/health", label: "Occam Workout", icon: "fitness_center" },
  { href: "/vision", label: "Vision", icon: "visibility" },
  { href: "/weekly-review", label: "Weekly review", icon: "calendar_month" },
  { href: "/chat", label: "Jarvis", icon: "smart_toy" },
];

const ACCOUNT_LINK = { href: "/account", label: "Account", icon: "person" };

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const path = router.pathname;
  const { user } = useAuth();
  const localDateTime = useLocalDateTime();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [nudgeCount, setNudgeCount] = useState(0);

  // Check for nudges on mount
  useEffect(() => {
    if (!user) return;
    async function checkNudges() {
      try {
        let { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/chat/nudges", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setNudgeCount(data.nudges?.length || 0);
      } catch {
        // silent
      }
    }
    checkNudges();
  }, [user]);

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

        <div className="rs-sidebar-stack">
          <nav className="rs-sidebar-nav" aria-label="Sections">
            {NAV_LINKS.map((link) => {
              const isActive =
                link.href === "/projects"
                  ? path === "/projects" || path.startsWith("/category/")
                  : path === link.href;
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

          <div className="rs-sidebar-footer">
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
            <div className="rs-sidebar-status">
              <div className="rs-sidebar-status__label">
                {user ? "Signed in" : "Signed out"}
              </div>
              {user?.email && (
                <div className="rs-sidebar-status__email">
                  {user.email}
                </div>
              )}
              {localDateTime && (
                <div className="rs-sidebar-status__time">
                  {localDateTime}
                </div>
              )}
            </div>
            <button
              type="button"
              className={`rs-sidebar-link${path === ACCOUNT_LINK.href ? " rs-sidebar-link--active" : ""}`}
              onClick={() => {
                router.push(ACCOUNT_LINK.href);
                closeSidebar();
              }}
            >
              <span className="material-symbols-outlined" aria-hidden>
                {ACCOUNT_LINK.icon}
              </span>
              <span>{ACCOUNT_LINK.label}</span>
            </button>
            <button type="button" className="rs-sidebar-signout" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="rs-main-wrap">
        <main className="main-content rs-main-inner">{children}</main>
      </div>
      <OccamNotificationManager />

      {/* Jarvis FAB — hidden on /chat page */}
      {path !== "/chat" && (
        <button
          type="button"
          className="jarvis-fab"
          onClick={() => { setChatOpen(true); setNudgeCount(0); }}
          aria-label="Open Jarvis chat"
        >
          <span className="material-symbols-outlined">smart_toy</span>
          {nudgeCount > 0 && (
            <span className="jarvis-fab__badge">{nudgeCount > 9 ? "9+" : nudgeCount}</span>
          )}
        </button>
      )}

      {/* Jarvis overlay panel */}
      <ChatPanel
        isOverlay
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
      />
    </div>
  );
}
