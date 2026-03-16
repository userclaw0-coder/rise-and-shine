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
    return () => clearInterval(id);
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
    { href: "/weekly-review", label: "Weekly review" },
  ];

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f5f5",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <header
        style={{
          borderBottom: "1px solid #e5e5e5",
          background: "#ffffff",
        }}
      >
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
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                background: "#111827",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              RS
            </div>
            <div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 16,
                  letterSpacing: "-0.01em",
                }}
              >
                Rise &amp; Shine
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Intentional daily planning
              </div>
              {user && (
                <>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                    Signed in as {user.email}
                  </div>
                  {localDateTime && (
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>
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
                  onClick={() => router.push(link.href)}
                  style={{
                    borderRadius: 999,
                    border: "1px solid",
                    borderColor: isActive ? "#111827" : "#e5e7eb",
                    fontSize: 13,
                    background: isActive ? "#111827" : "#ffffff",
                    color: isActive ? "#ffffff" : "#111827",
                    cursor: "pointer",
                  }}
                >
                  {link.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={handleSignOut}
              style={{
                marginLeft: 4,
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                fontSize: 13,
                background: "#f9fafb",
                color: "#374151",
                cursor: "pointer",
              }}
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

