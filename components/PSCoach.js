import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const SCOPE_LABELS = {
  map: { scope: "System", title: "About this system" },
  vision: { scope: "Vision coach", title: "Alignment check" },
  today: { scope: "Daily coach", title: "Rise and plan" },
  hits: { scope: "Habits coach", title: "Daily Hits" },
  projects: { scope: "Project coach", title: "Project view" },
  project: { scope: "Project coach", title: "Project view" },
  review: { scope: "Weekly review", title: "Your draft" },
  fitness: { scope: "Training coach", title: "Body & Training" },
  ideas: { scope: "Ideas coach", title: "Sparks & shaping" },
  jarvis: { scope: "System view", title: "You are in Jarvis" },
  actions: { scope: "Backlog coach", title: "Action items" },
  notes: { scope: "Notes coach", title: "Capture & reflect" },
};

const FALLBACK_SUGGESTIONS = {
  map: ["Start today", "Walk me through the loops", "How do tags work?"],
  vision: ["Draft a gap-filler project", "What moved this week?", "Show alignment gaps"],
  today: ["Which should I start?", "Re-order top 3", "Add a Variety move"],
  hits: ["Which streaks are at risk?", "What would unlock Saturday?", "Why did I miss priming?"],
  projects: ["Break down the biggest task", "What's the smallest next step?", "Re-order the ladder"],
  project: ["Break down the biggest task", "What's the smallest next step?", "Re-order the ladder"],
  review: ["Draft my Wins for me", "Why is Variety low?", "Show 6-week pattern"],
  fitness: ["Am I overtraining?", "Should I add 2.5 lb?", "Shift row to Sat"],
  ideas: ["Which is closest to graduating?", "Merge duplicates?", "Score this one"],
  jarvis: ["What should I do first?", "Audit vision alignment", "Collapse this drawer"],
  actions: ["Demote stale P0s", "Pull top leverage to today", "Show Q2 only"],
  notes: ["Pin the important ones", "Show me all Ensenada notes", "What pattern am I repeating?"],
};

function ScopeMeta({ scope }) {
  return SCOPE_LABELS[scope] || SCOPE_LABELS.today;
}

export default function PSCoach({
  scope,
  scopeHint,
  payload,
  suggestions,
  collapsed,
  onToggle,
}) {
  const meta = ScopeMeta({ scope });
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const bodyRef = useRef(null);

  const effectiveSuggestions =
    suggestions && suggestions.length > 0
      ? suggestions
      : FALLBACK_SUGGESTIONS[scope] || [];

  const postCoach = useCallback(
    async ({ question } = {}) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const history = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/coach/page-note", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          scope,
          payload: payload || {},
          question: question || "",
          history,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Coach unavailable");
      }
      const data = await res.json();
      return (data.note || "").trim();
    },
    [scope, payload, messages]
  );

  const fetchInitial = useCallback(async () => {
    if (!scope || collapsed) return;
    setLoading(true);
    setError("");
    try {
      const text = await postCoach({});
      if (text) {
        setMessages([{ role: "assistant", content: text, at: Date.now() }]);
      }
      setBootstrapped(true);
    } catch (err) {
      setError(err.message || "Coach unavailable.");
    } finally {
      setLoading(false);
    }
  }, [scope, collapsed, postCoach]);

  // Only auto-load once per mount/scope change
  useEffect(() => {
    setMessages([]);
    setBootstrapped(false);
    setError("");
  }, [scope]);

  useEffect(() => {
    if (!collapsed && !bootstrapped && !loading && scope) {
      fetchInitial();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, bootstrapped, scope]);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSend(question) {
    const q = (question || input).trim();
    if (!q || sending) return;
    setInput("");
    setSending(true);
    setError("");
    setMessages((m) => [...m, { role: "user", content: q, at: Date.now() }]);
    try {
      const text = await postCoach({ question: q });
      if (text) {
        setMessages((m) => [...m, { role: "assistant", content: text, at: Date.now() }]);
      }
    } catch (err) {
      setError(err.message || "Coach unavailable.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <aside className={"ps-coach" + (collapsed ? " collapsed" : "")}>
      <div className="ps-coach-head">
        <button
          type="button"
          className="ps-coach-toggle"
          onClick={onToggle}
          aria-label={collapsed ? "Open coach" : "Collapse coach"}
        >
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path
              d={collapsed ? "M9 3l-4 4 4 4" : "M5 3l4 4-4 4"}
              stroke="currentColor"
              strokeWidth="1.4"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {!collapsed && (
          <div className="ps-coach-title-wrap">
            <div className="ps-coach-scope">
              {meta.scope} · context-aware
            </div>
            <div className="ps-coach-title">{scopeHint || meta.title}</div>
          </div>
        )}
      </div>
      {collapsed && (
        <div className="ps-coach-vertical">Coach · {meta.scope}</div>
      )}

      {!collapsed && (
        <>
          <div className="ps-coach-body" ref={bodyRef}>
            {messages.length === 0 && loading && (
              <div className="ps-coach-loading">Reading the page…</div>
            )}
            {messages.length === 0 && !loading && !error && (
              <div className="ps-coach-loading">Coach is listening…</div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={"ps-bubble " + (m.role === "user" ? "user" : "coach")}
              >
                {m.content}
              </div>
            ))}
            {sending && (
              <div className="ps-bubble coach ps-bubble-loading">…</div>
            )}
            {error && (
              <div className="ps-coach-error">{error}</div>
            )}
          </div>

          {effectiveSuggestions.length > 0 && messages.length < 3 && (
            <div className="ps-coach-suggestions">
              {effectiveSuggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  className={"ps-chip" + (i === 0 ? " primary" : "")}
                  onClick={() => handleSend(s)}
                  disabled={sending}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="ps-coach-input">
            <textarea
              rows={1}
              placeholder={
                scope === "review"
                  ? "Reflect on the week…"
                  : scope === "map"
                  ? "Ask how the system works…"
                  : scope === "project" || scope === "projects"
                  ? "Ask about this project…"
                  : "Tell your coach…"
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
            />
            <button
              type="button"
              className="ps-coach-send"
              onClick={() => handleSend()}
              disabled={!input.trim() || sending}
              aria-label="Send"
            >
              <svg width="14" height="14" viewBox="0 0 14 14">
                <path
                  d="M2 7l10-5-3 12-3-5-4-2z"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  fill="none"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </>
      )}

      <style jsx global>{`
        .ps-coach {
          width: 380px;
          flex-shrink: 0;
          border-left: 1px solid var(--ps-ink-10);
          background: var(--ps-paper);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transition: width 200ms ease;
          position: sticky;
          top: 0;
          height: 100vh;
        }
        .ps-coach.collapsed {
          width: 48px;
        }
        .ps-coach-head {
          padding: 16px 18px 14px;
          border-bottom: 1px solid var(--ps-ink-08);
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }
        .ps-coach.collapsed .ps-coach-head {
          padding: 16px 10px;
          justify-content: center;
          border-bottom: none;
        }
        .ps-coach-toggle {
          appearance: none;
          border: none;
          background: transparent;
          cursor: pointer;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--ps-ink-60);
        }
        .ps-coach-toggle:hover {
          background: var(--ps-ink-05);
          color: var(--ps-ink);
        }
        .ps-coach-title-wrap {
          flex: 1;
          min-width: 0;
        }
        .ps-coach-scope {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-accent);
        }
        .ps-coach-title {
          font-family: var(--ps-serif);
          font-size: 17px;
          letter-spacing: -0.01em;
          color: var(--ps-ink);
          margin-top: 2px;
        }
        .ps-coach-vertical {
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
          margin-top: 10px;
          padding: 8px 0;
          align-self: center;
        }
        .ps-coach-body {
          flex: 1;
          overflow-y: auto;
          padding: 6px 0 10px;
          display: flex;
          flex-direction: column;
        }
        .ps-coach-loading {
          padding: 20px;
          color: var(--ps-ink-50);
          font-size: 12.5px;
          font-style: italic;
          text-align: center;
        }
        .ps-coach-error {
          padding: 10px 14px;
          margin: 8px 14px;
          background: var(--ps-clay-soft);
          border: 1px solid rgba(184, 92, 62, 0.22);
          border-radius: 10px;
          color: var(--ps-clay);
          font-size: 12px;
        }
        .ps-bubble {
          padding: 10px 14px;
          margin: 6px 14px;
          border-radius: 14px;
          font-size: 13px;
          line-height: 1.55;
          max-width: 86%;
          white-space: pre-wrap;
        }
        .ps-bubble.coach {
          background: #fff;
          border: 1px solid var(--ps-ink-08);
          align-self: flex-start;
          border-bottom-left-radius: 4px;
        }
        .ps-bubble.user {
          background: var(--ps-ink);
          color: var(--ps-bg);
          align-self: flex-end;
          border-bottom-right-radius: 4px;
        }
        .ps-bubble-loading {
          color: var(--ps-ink-40);
          font-style: italic;
        }
        .ps-coach-suggestions {
          padding: 10px 14px;
          border-top: 1px solid var(--ps-ink-08);
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          flex-shrink: 0;
        }
        .ps-chip {
          appearance: none;
          border: 1px solid var(--ps-ink-15);
          background: #fff;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 11px;
          color: var(--ps-ink-70);
          cursor: pointer;
          transition: border-color 120ms, color 120ms;
          font-family: inherit;
        }
        .ps-chip:hover {
          border-color: var(--ps-accent);
          color: var(--ps-accent);
        }
        .ps-chip:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .ps-chip.primary {
          background: var(--ps-ink);
          color: var(--ps-bg);
          border-color: var(--ps-ink);
        }
        .ps-chip.primary:hover {
          background: #000;
          color: var(--ps-bg);
        }
        .ps-coach-input {
          padding: 12px 14px;
          border-top: 1px solid var(--ps-ink-08);
          flex-shrink: 0;
          display: flex;
          align-items: flex-end;
          gap: 8px;
          background: rgba(255, 251, 243, 0.6);
        }
        .ps-coach-input textarea {
          flex: 1;
          appearance: none;
          border: 1px solid var(--ps-ink-10);
          background: #fff;
          border-radius: 10px;
          padding: 9px 12px;
          font-size: 13px;
          resize: none;
          min-height: 36px;
          max-height: 100px;
          font-family: inherit;
          color: var(--ps-ink);
          outline: none;
        }
        .ps-coach-input textarea:focus {
          border-color: var(--ps-accent);
        }
        .ps-coach-send {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: var(--ps-ink);
          color: var(--ps-bg);
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .ps-coach-send:disabled {
          opacity: 0.4;
          cursor: default;
        }

        @media (max-width: 1200px) {
          .ps-coach {
            width: 320px;
          }
        }
        @media (max-width: 1000px) {
          .ps-coach {
            position: fixed;
            top: 0;
            right: 0;
            height: 100vh;
            z-index: 50;
            box-shadow: -10px 0 40px rgba(0, 0, 0, 0.06);
          }
          .ps-coach.collapsed {
            width: 40px;
          }
        }
        @media (max-width: 700px) {
          .ps-coach {
            width: 100%;
            max-width: 380px;
          }
          .ps-coach.collapsed {
            width: 40px;
            max-width: 40px;
          }
        }
      `}</style>
    </aside>
  );
}
