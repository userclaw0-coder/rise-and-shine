import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function CoachNote({ scope, payload, autoLoad = false }) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadedOnce, setLoadedOnce] = useState(false);

  async function fetchNote() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch("/api/coach/page-note", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ scope, payload }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed");
      }
      const data = await res.json();
      setNote(data.note || "");
      setLoadedOnce(true);
    } catch (err) {
      setError(err.message || "Coach unavailable.");
    } finally {
      setLoading(false);
    }
  }

  if (!loadedOnce && !loading && !note && !autoLoad) {
    return (
      <div className="coach-note coach-note--idle">
        <div className="coach-note-head">
          <span className="coach-note-cap">Coach</span>
        </div>
        <button
          type="button"
          className="ps-btn"
          onClick={fetchNote}
          disabled={loading}
        >
          Ask for a read
        </button>
      </div>
    );
  }

  return (
    <div className="coach-note">
      <div className="coach-note-head">
        <span className="coach-note-cap">Coach</span>
        <button
          type="button"
          className="coach-note-refresh"
          onClick={fetchNote}
          disabled={loading}
          aria-label="Refresh"
        >
          {loading ? "…" : "↻"}
        </button>
      </div>
      {error ? (
        <div className="coach-note-error">{error}</div>
      ) : loading ? (
        <div className="coach-note-body coach-note-body--loading">
          Reading the page…
        </div>
      ) : note ? (
        <div className="coach-note-body">{note}</div>
      ) : null}

      <style jsx global>{`
        .coach-note {
          background: var(--ps-accent-soft);
          border: 1px solid rgba(185, 115, 22, 0.25);
          border-radius: 12px;
          padding: 14px 16px;
          margin-top: 20px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .coach-note--idle {
          background: var(--ps-paper);
          border-style: dashed;
          border-color: var(--ps-ink-15);
        }
        .coach-note-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .coach-note-cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-accent);
        }
        .coach-note--idle .coach-note-cap {
          color: var(--ps-ink-50);
        }
        .coach-note-refresh {
          appearance: none;
          border: none;
          background: transparent;
          color: var(--ps-ink-60);
          font-size: 14px;
          cursor: pointer;
          padding: 2px 6px;
          line-height: 1;
        }
        .coach-note-refresh:hover {
          color: var(--ps-ink);
        }
        .coach-note-body {
          font-size: 13px;
          color: var(--ps-ink-80);
          line-height: 1.55;
          white-space: pre-wrap;
        }
        .coach-note-body--loading {
          color: var(--ps-ink-50);
          font-style: italic;
        }
        .coach-note-error {
          font-size: 12px;
          color: var(--ps-clay);
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}
