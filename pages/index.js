import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { BrandMarkIcon } from "../components/BrandMark";

export default function Landing() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user || null);
    });
  }, []);

  const handlePrimaryCta = () => {
    window.location.href = "/login";
  };

  const handleGoToApp = () => {
    window.location.href = "/today";
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily: "system-ui",
        background: "radial-gradient(circle at top, #eff6ff 0, #f9fafb 55%, #ffffff 100%)",
        color: "#111827",
      }}
    >
      <header
        style={{
          maxWidth: 1040,
          margin: "0 auto",
          padding: "20px 16px 8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BrandMarkIcon size={40} alt="" />
          <span style={{ fontWeight: 600, letterSpacing: "-0.03em" }}>Rise &amp; Shine</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {user && (
            <button
              type="button"
              onClick={handleGoToApp}
              style={{
                fontSize: 13,
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
              }}
            >
              Go to app
            </button>
          )}
          <button
            type="button"
            onClick={handlePrimaryCta}
            style={{
              fontSize: 13,
              padding: "6px 14px",
              borderRadius: 999,
              border: "1px solid #111827",
              background: "#111827",
              color: "#ffffff",
            }}
          >
            Sign in
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1040, margin: "0 auto", padding: "32px 16px 60px" }}>
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2.4fr)",
            gap: 32,
            alignItems: "center",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 34,
                lineHeight: 1.1,
                letterSpacing: "-0.04em",
                margin: 0,
              }}
            >
              Your next 3 actions,
              <br />
              chosen for today.
            </h1>
            <p
              style={{
                margin: "14px 0 18px",
                fontSize: 15,
                color: "#4b5563",
                maxWidth: 520,
              }}
            >
              Rise &amp; Shine turns your life vision, backlog, and daily tasks into a clear Next&nbsp;3 you can act on
              right now — with AI that explains why each task matters.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
              <button
                type="button"
                onClick={handlePrimaryCta}
                style={{
                  padding: "10px 18px",
                  borderRadius: 999,
                  border: "none",
                  background: "#111827",
                  color: "#ffffff",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                Start free — get your Next 3
              </button>
              <button
                type="button"
                onClick={() => (window.location.href = "/onboarding")}
                style={{
                  padding: "10px 16px",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  fontSize: 13,
                }}
              >
                Try the full onboarding
              </button>
            </div>
            <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
              No credit card required. You can always export your tasks.
            </p>
          </div>

          <div
            style={{
              borderRadius: 20,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              padding: 16,
              boxShadow: "0 18px 40px rgba(15,23,42,0.08)",
              display: "grid",
              gap: 8,
            }}
          >
            <h3
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#6b7280",
                margin: "0 0 6px",
              }}
            >
              Choose your starting hook
            </h3>
            <button
              type="button"
              onClick={() => (window.location.href = "/onboarding?mode=quiz")}
              style={{
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <strong style={{ display: "block", fontSize: 13 }}>Take the focus quiz</strong>
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                A 3-minute quiz to surface your best starting outcomes.
              </span>
            </button>
            <button
              type="button"
              onClick={() => (window.location.href = "/vision")}
              style={{
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <strong style={{ display: "block", fontSize: 13 }}>Create your Vision Board</strong>
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                Write your vision, upload a photo, and generate an AI-powered board.
              </span>
            </button>
            <button
              type="button"
              onClick={() => (window.location.href = "/today")}
              style={{
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <strong style={{ display: "block", fontSize: 13 }}>Drop into Today</strong>
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                Start from your current backlog and let AI refine your Next&nbsp;3.
              </span>
            </button>
            <button
              type="button"
              onClick={() => (window.location.href = "/analytics")}
              style={{
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <strong style={{ display: "block", fontSize: 13 }}>Leverage AI to manage your life</strong>
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                See your momentum, daily routines, and AI-planned tasks in one place.
              </span>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
