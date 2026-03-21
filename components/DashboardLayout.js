import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";

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
    return () => clearTimeout(id);
  }, []);
  return dateTime;
}

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const path = router.pathname;
  const { user } = useAuth();
  const localDateTime = useLocalDateTime();

  const links = [
    { href: "/today", label: "Today" },
    { href: "/backlog", label: "Action Items" },
    { href: "/templates", label: "Daily Hits" },
    { href: "/analytics", label: "Analytics" },
    { href: "/notes", label: "Notes" },
    { href: "/ideas", label: "Ideas" },
    { href: "/health", label: "Occam Workout" },
    { href: "/vision", label: "Vision" },
    { href: "/account", label: "Account" },
    { href: "/weekly-review", label: "Weekly review" },
  ];

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="rs-shell">
      <header className="rs-header">
        <div
          className="dashboard-header-inner"
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div className="rs-brand-mark">RS</div>
            <div>
              <div className="rs-brand-title">Rise &amp; Shine</div>
              <div className="rs-brand-tagline">Intentional daily planning</div>
              {user && (
                <>
                  <div className="rs-brand-meta" style={{ marginTop: 2 }}>
                    Signed in as {user.email}
                  </div>
                  {localDateTime && (
                    <div className="rs-brand-meta" style={{ marginTop: 1 }}>
                      {localDateTime}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <nav className="dashboard-nav">
            {links.map((link) => {
              const isActive = path === link.href;
              return (
                <button
                  key={link.href}
                  type="button"
                  className={`rs-nav-btn${isActive ? " rs-nav-btn--active" : ""}`}
                  onClick={() => router.push(link.href)}
                >
                  {link.label}
                </button>
              );
            })}
            <button
              type="button"
              className="rs-nav-btn rs-nav-btn--muted"
              onClick={handleSignOut}
              style={{ marginLeft: 4 }}
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <main
        className="main-content"
        style={{
          maxWidth: 1100,
          margin: "0 auto",
        }}
      >
        {children}
      </main>
    </div>
  );
}
