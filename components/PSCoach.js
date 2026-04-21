import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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

// Parameterized scopes look like "project:<uuid>" — treat the prefix
// as the bucket for labels / suggestions.
function scopeBucket(scope) {
  if (!scope) return "today";
  if (SCOPE_LABELS[scope]) return scope;
  const colonIdx = scope.indexOf(":");
  if (colonIdx > 0) {
    const prefix = scope.slice(0, colonIdx);
    if (SCOPE_LABELS[prefix]) return prefix;
  }
  return "today";
}

function ScopeMeta({ scope }) {
  return SCOPE_LABELS[scopeBucket(scope)] || SCOPE_LABELS.today;
}

const MAX_STORED_MESSAGES = 30;

function storageKey(scope) {
  return `rs-coach-convo-${scope || "default"}`;
}

function loadCachedConvo(scope) {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m) => m && (m.role === "user" || m.role === "assistant"))
      .slice(-MAX_STORED_MESSAGES);
  } catch {
    return [];
  }
}

function cacheConvo(scope, messages) {
  if (typeof window === "undefined") return;
  try {
    const trimmed = messages.slice(-MAX_STORED_MESSAGES);
    localStorage.setItem(storageKey(scope), JSON.stringify(trimmed));
  } catch {
    // localStorage full or unavailable — silent
  }
}

async function fetchServerConvo(scope) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return null;
    const res = await fetch(
      `/api/coach/page-note?scope=${encodeURIComponent(scope)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.messages) ? data.messages : [];
  } catch {
    return null;
  }
}

async function deleteServerConvo(scope) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return;
    await fetch(
      `/api/coach/page-note?scope=${encodeURIComponent(scope)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }
    );
  } catch {
    // silent
  }
}

function isPayloadMeaningful(payload) {
  if (!payload || typeof payload !== "object") return false;
  for (const [k, v] of Object.entries(payload)) {
    if (k === "date") continue;
    if (Array.isArray(v) && v.length > 0) return true;
    if (typeof v === "number" && v !== 0) return true;
    if (typeof v === "string" && v.trim()) return true;
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      Object.keys(v).length > 0
    )
      return true;
  }
  return false;
}

export default function PSCoach({
  scope,
  scopeHint,
  payload,
  payloadReady = true,
  suggestions,
  collapsed,
  onToggle,
}) {
  const meta = ScopeMeta({ scope });
  const [messages, setMessages] = useState(() => loadCachedConvo(scope));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(
    () => loadCachedConvo(scope).length > 0
  );
  const [hydrated, setHydrated] = useState(false);
  const bodyRef = useRef(null);

  const effectiveSuggestions =
    suggestions && suggestions.length > 0
      ? suggestions
      : FALLBACK_SUGGESTIONS[scopeBucket(scope)] || [];

  const postCoach = useCallback(
    async ({ question } = {}) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
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
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Coach unavailable");
      }
      const data = await res.json();
      return {
        note: (data.note || "").trim(),
        toolCalls: Array.isArray(data.tool_calls) ? data.tool_calls : [],
      };
    },
    [scope, payload]
  );

  const fetchInitial = useCallback(async () => {
    if (!scope || collapsed) return;
    setLoading(true);
    setError("");
    try {
      const { note: text } = await postCoach({});
      if (text) {
        const next = [
          ...messages,
          { role: "assistant", content: text, at: Date.now() },
        ];
        setMessages(next);
        cacheConvo(scope, next);
      }
      setBootstrapped(true);
    } catch (err) {
      setError(err.message || "Coach unavailable.");
    } finally {
      setLoading(false);
    }
  }, [scope, collapsed, postCoach, messages]);

  // Show cached convo immediately on scope change (instant, no flash),
  // then hydrate from the server so cross-device memory wins. Falls
  // back to whatever cache had if the network fails.
  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    const cached = loadCachedConvo(scope);
    setMessages(cached);
    setBootstrapped(cached.length > 0);
    setError("");

    (async () => {
      const fromServer = await fetchServerConvo(scope);
      if (cancelled) return;
      if (fromServer && fromServer.length > 0) {
        setMessages(fromServer);
        setBootstrapped(true);
        cacheConvo(scope, fromServer);
      } else if (fromServer && fromServer.length === 0 && cached.length > 0) {
        // Server says this scope was cleared elsewhere — respect it.
        setMessages([]);
        setBootstrapped(false);
        cacheConvo(scope, []);
      }
      setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [scope]);

  // Auto-fetch initial coach note only after the page has data to
  // describe. payloadReady gates by the page's loading state, and
  // isPayloadMeaningful catches the case where the payload landed but
  // is empty (e.g. truly no tasks today).
  const payloadHasContent = isPayloadMeaningful(payload);
  useEffect(() => {
    if (collapsed || !scope || bootstrapped || loading) return;
    if (!hydrated) return; // wait until server hydration finishes
    if (!payloadReady) return;
    if (!payloadHasContent) {
      const t = setTimeout(() => {
        if (!bootstrapped && !loading) fetchInitial();
      }, 1500);
      return () => clearTimeout(t);
    }
    fetchInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, scope, bootstrapped, hydrated, payloadReady, payloadHasContent]);

  // Synchronous pin before paint.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, collapsed]);

  // Observe size + child-list changes and pin to bottom. MutationObserver
  // catches messages that arrive after the initial paint (which
  // ResizeObserver on a fixed-height container can miss).
  const userScrolledUpRef = useRef(false);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const pin = () => {
      if (!bodyRef.current || userScrolledUpRef.current) return;
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    };
    pin();
    const timers = [
      setTimeout(pin, 50),
      setTimeout(pin, 200),
      setTimeout(pin, 600),
      setTimeout(pin, 1200),
    ];
    const ro = new ResizeObserver(() => pin());
    ro.observe(el);
    const mo = new MutationObserver(() => {
      for (const child of el.children) ro.observe(child);
      pin();
    });
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    for (const child of el.children) ro.observe(child);
    const onScroll = () => {
      if (!bodyRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = bodyRef.current;
      const atBottom = scrollHeight - scrollTop - clientHeight < 40;
      userScrolledUpRef.current = !atBottom;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const onLoad = () => pin();
    window.addEventListener("load", onLoad);
    return () => {
      timers.forEach(clearTimeout);
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("load", onLoad);
    };
  }, [hydrated, collapsed]);

  async function handleSend(question) {
    const q = (question || input).trim();
    if (!q || sending) return;
    setInput("");
    setSending(true);
    setError("");
    const withUser = [
      ...messages,
      { role: "user", content: q, at: Date.now() },
    ];
    setMessages(withUser);
    cacheConvo(scope, withUser);
    try {
      const { note: text, toolCalls } = await postCoach({ question: q });
      if (text || (toolCalls && toolCalls.length > 0)) {
        const withAssistant = [
          ...withUser,
          {
            role: "assistant",
            content: text,
            toolCalls,
            at: Date.now(),
          },
        ];
        setMessages(withAssistant);
        cacheConvo(scope, withAssistant);
      }
    } catch (err) {
      setError(err.message || "Coach unavailable.");
    } finally {
      setSending(false);
    }
  }

  async function clearConversation() {
    setMessages([]);
    setBootstrapped(false);
    setError("");
    cacheConvo(scope, []);
    await deleteServerConvo(scope);
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
        {!collapsed && messages.length > 0 && (
          <button
            type="button"
            className="ps-coach-clear"
            onClick={clearConversation}
            title="Clear this scope's conversation and re-read the page"
          >
            ↻
          </button>
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
              <div key={i} className="ps-bubble-wrap">
                {m.toolCalls && m.toolCalls.length > 0 && (
                  <div className="ps-tool-list">
                    {m.toolCalls.map((tc, j) => (
                      <div
                        key={j}
                        className={
                          "ps-tool-chip" + (tc.ok === false ? " err" : "")
                        }
                        title={
                          tc.error || JSON.stringify(tc.args || {}, null, 2)
                        }
                      >
                        <span className="ps-tool-chip-mark">
                          {tc.ok === false ? "⚠" : "✓"}
                        </span>
                        <span className="ps-tool-chip-name">{tc.name}</span>
                        {tc.args?.title && (
                          <span className="ps-tool-chip-arg">
                            {String(tc.args.title).slice(0, 32)}
                          </span>
                        )}
                        {!tc.args?.title && tc.args?.name && (
                          <span className="ps-tool-chip-arg">
                            {String(tc.args.name).slice(0, 32)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {m.content && (
                  <div
                    className={
                      "ps-bubble " + (m.role === "user" ? "user" : "coach")
                    }
                  >
                    {m.content}
                  </div>
                )}
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
              placeholder={(() => {
                const b = scopeBucket(scope);
                if (b === "review") return "Reflect on the week…";
                if (b === "map") return "Ask how the system works…";
                if (b === "project" || b === "projects")
                  return "Ask about this project…";
                return "Tell your coach…";
              })()}
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
        .ps-coach-clear {
          appearance: none;
          border: 1px solid var(--ps-ink-10);
          background: transparent;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          color: var(--ps-ink-60);
          cursor: pointer;
          font-size: 14px;
          line-height: 1;
          flex-shrink: 0;
        }
        .ps-coach-clear:hover {
          border-color: var(--ps-accent);
          color: var(--ps-accent);
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
        .ps-bubble-wrap {
          display: flex;
          flex-direction: column;
        }
        .ps-tool-list {
          margin: 4px 14px 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
          align-self: flex-start;
          max-width: 86%;
        }
        .ps-tool-chip {
          background: var(--ps-sage-soft);
          color: var(--ps-sage);
          border: 1px solid rgba(107, 143, 113, 0.3);
          padding: 4px 8px;
          border-radius: 6px;
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.04em;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ps-tool-chip.err {
          background: var(--ps-clay-soft);
          color: var(--ps-clay);
          border-color: rgba(184, 92, 62, 0.28);
        }
        .ps-tool-chip-mark {
          font-size: 11px;
          font-weight: 700;
        }
        .ps-tool-chip-name {
          font-weight: 600;
        }
        .ps-tool-chip-arg {
          color: var(--ps-ink-60);
          overflow: hidden;
          text-overflow: ellipsis;
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
