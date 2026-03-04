import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const path = router.pathname;

  const links = [
    { href: "/today", label: "Today" },
    { href: "/backlog", label: "Backlog" },
    { href: "/templates", label: "Templates" },
    { href: "/analytics", label: "Analytics" },
    { href: "/notes", label: "Notes" },
    { href: "/ideas", label: "Ideas" },
    { href: "/health", label: "Health" },
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
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
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
            </div>
          </div>
          <nav
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              alignItems: "center",
              justifyContent: "flex-end",
            }}
          >
            {links.map((link) => {
              const isActive = path === link.href;
              return (
                <button
                  key={link.href}
                  onClick={() => router.push(link.href)}
                  style={{
                    borderRadius: 999,
                    border: "1px solid",
                    borderColor: isActive ? "#111827" : "#e5e7eb",
                    padding: "6px 12px",
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
              onClick={handleSignOut}
              style={{
                marginLeft: 4,
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                padding: "6px 12px",
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
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "24px 20px 40px",
        }}
      >
        {children}
      </main>
    </div>
  );
}

