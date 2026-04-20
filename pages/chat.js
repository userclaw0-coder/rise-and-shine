import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PSShell from "../components/PSShell";
import ChatPanel from "../components/ChatPanel";
import { useAuth } from "../hooks/useAuth";
import { getNotes } from "../lib/db";
import { supabase } from "../lib/supabaseClient";

const REFERENCES = [
  {
    id: "vision",
    label: "Vision & Manifestations",
    body: "Your 12-month manifestations + identity traits. Lives in user_profile.profile.",
    href: "/vision",
  },
  {
    id: "six-needs",
    label: "Six Human Needs",
    body: "Growth / Certainty / Variety / Connection / Contribution / Significance. Framework used in weekly review.",
  },
  {
    id: "occam",
    label: "Occam Protocol",
    body: "Minimum effective dose strength training. Yates row + barbell press (A) / Incline bench + squat (B). 5s up 5s down. 1×7+ to failure.",
    href: "/health",
  },
  {
    id: "daily-hits",
    label: "Daily Hits",
    body: "Daily non-negotiables that compound. Prefix title with [morning]/[midday]/[evening] to bucket.",
    href: "/templates",
  },
];

const STARTERS = [
  "Run a vision alignment audit across my 13 projects",
  "Which project should I be working on first today, and why?",
  "What ideas are ready to graduate into projects?",
  "Pattern match my last 4 weekly reviews — what keeps recurring?",
];

export default function ChatPage() {
  const { user, isCheckingAuth } = useAuth();
  const [context, setContext] = useState(null);
  const [memoryNotes, setMemoryNotes] = useState([]);
  const [rightTab, setRightTab] = useState("memory");

  const loadContext = useCallback(async () => {
    if (!user) return;
    const [cats, tasks, ideas, notesRes] = await Promise.all([
      supabase
        .from("categories")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("archived_at", null),
      supabase
        .from("ideas")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .neq("status", "archived"),
      getNotes(user.id, 50),
    ]);
    setContext({
      projects: cats.count ?? 0,
      tasks: tasks.count ?? 0,
      ideas: ideas.count ?? 0,
    });
    const all = (notesRes.data || []).map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      jarvisFeed: !!n.jarvis_feed,
      created_at: n.created_at,
    }));
    setMemoryNotes(all.filter((n) => n.jarvisFeed));
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadContext();
      void cancelled;
    })();
    return () => {
      cancelled = true;
    };
  }, [loadContext]);

  if (isCheckingAuth || !user) return null;

  return (
    <PSShell scope="jarvis" title="Jarvis" coachDisabled>
        <div className="jv-shell">
          <aside className="jv-rail jv-rail-left">
            <div className="jv-brand">
              <div className="jv-brand-mark">J</div>
              <div>
                <div className="jv-brand-title">Jarvis</div>
                <div className="jv-brand-sub">Full-context workspace</div>
              </div>
            </div>

            <div className="jv-section">
              <div className="jv-cap">Try asking</div>
              <div className="jv-starters">
                {STARTERS.map((s, i) => (
                  <div key={i} className="jv-starter">
                    {s}
                  </div>
                ))}
              </div>
            </div>

            <div className="jv-section">
              <div className="jv-cap">Navigate</div>
              <Link href="/today" className="jv-navlink">
                → Today
              </Link>
              <Link href="/backlog" className="jv-navlink">
                → Action items
              </Link>
              <Link href="/vision" className="jv-navlink">
                → Vision
              </Link>
              <Link href="/weekly-review" className="jv-navlink">
                → Weekly review
              </Link>
            </div>
          </aside>

          <main className="jv-center">
            <div className="ps-eyebrow">System-wide chat · cross-project</div>
            <h1 className="ps-title" style={{ fontSize: 28 }}>
              Jarvis.
            </h1>
            <p className="ps-sub">
              Ask strategic, integrative questions that span projects, goals,
              patterns. Jarvis sees your vision, projects, ideas, and the notes
              you&apos;ve flagged &quot;Feed Jarvis.&quot;
            </p>

            <div className="jv-chat">
              <ChatPanel isOverlay={false} isOpen />
            </div>

            {context && (
              <div className="jv-context-foot">
                {context.projects} projects · {context.tasks} active tasks ·{" "}
                {context.ideas} open ideas ·{" "}
                {memoryNotes.length} notes feeding Jarvis
              </div>
            )}
          </main>

          <aside className="jv-rail jv-rail-right">
            <div className="jv-tabs">
              {[
                ["memory", "Memory"],
                ["refs", "References"],
              ].map(([id, l]) => (
                <button
                  key={id}
                  className={"jv-tab" + (rightTab === id ? " active" : "")}
                  onClick={() => setRightTab(id)}
                >
                  {l}
                </button>
              ))}
            </div>
            {rightTab === "memory" ? (
              <>
                <div className="jv-cap" style={{ marginTop: 6 }}>
                  Notes feeding Jarvis ·{" "}
                  <Link href="/notes" style={{ color: "var(--ps-accent)" }}>
                    edit on Notes
                  </Link>
                </div>
                {memoryNotes.length === 0 ? (
                  <div className="jv-empty">
                    No notes yet. Toggle <strong>Feed Jarvis</strong> on a note
                    to make it available to the coach.
                  </div>
                ) : (
                  <div className="jv-memory">
                    {memoryNotes.map((m) => (
                      <div key={m.id} className="jv-memo">
                        {m.title && (
                          <div className="jv-memo-title">{m.title}</div>
                        )}
                        <div className="jv-memo-body">
                          {(m.body || "").slice(0, 180)}
                          {(m.body || "").length > 180 ? "…" : ""}
                        </div>
                        <div className="jv-memo-foot">
                          {new Date(m.created_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="jv-cap" style={{ marginTop: 6 }}>
                  Reference philosophies
                </div>
                <div className="jv-refs">
                  {REFERENCES.map((r) => (
                    <div key={r.id} className="jv-ref">
                      <div className="jv-ref-title">{r.label}</div>
                      <div className="jv-ref-body">{r.body}</div>
                      {r.href && (
                        <Link href={r.href} className="jv-ref-link">
                          Open →
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </aside>
        </div>

      <style jsx global>{`
        .jv-shell {
          display: grid;
          grid-template-columns: 240px 1fr 320px;
          gap: 24px;
          max-width: 1400px;
          margin: 0 auto;
          padding: 32px 24px 60px;
          min-height: calc(100vh - 120px);
        }
        .jv-rail {
          display: flex;
          flex-direction: column;
          gap: 20px;
          position: sticky;
          top: 24px;
          align-self: start;
          max-height: calc(100vh - 60px);
          overflow-y: auto;
        }
        .jv-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--ps-ink-08);
        }
        .jv-brand-mark {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          background: linear-gradient(135deg, var(--ps-accent), var(--ps-clay));
          color: #fff;
          font-family: var(--ps-serif);
          font-size: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .jv-brand-title {
          font-family: var(--ps-serif);
          font-size: 16px;
          letter-spacing: -0.01em;
        }
        .jv-brand-sub {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
          margin-top: 2px;
        }
        .jv-section {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .jv-cap {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
        }
        .jv-starters {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .jv-starter {
          padding: 8px 10px;
          background: var(--ps-paper);
          border: 1px solid var(--ps-ink-08);
          border-radius: 7px;
          font-size: 12.5px;
          color: var(--ps-ink-70);
          line-height: 1.4;
          cursor: default;
        }
        .jv-navlink {
          padding: 6px 8px;
          border-radius: 6px;
          font-size: 13px;
          color: var(--ps-ink-70);
          text-decoration: none;
        }
        .jv-navlink:hover {
          background: var(--ps-ink-05);
          color: var(--ps-ink);
        }
        .jv-center {
          min-width: 0;
          display: flex;
          flex-direction: column;
        }
        .jv-chat {
          margin-top: 16px;
          background: #fff;
          border: 1px solid var(--ps-ink-10);
          border-radius: 14px;
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 520px;
          overflow: hidden;
        }
        .jv-chat > * {
          flex: 1;
          min-height: 0;
        }
        .jv-context-foot {
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid var(--ps-ink-08);
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
          text-align: center;
        }
        .jv-tabs {
          display: flex;
          background: var(--ps-paper);
          border: 1px solid var(--ps-ink-08);
          border-radius: 8px;
          padding: 3px;
          gap: 2px;
        }
        .jv-tab {
          flex: 1;
          appearance: none;
          border: none;
          background: transparent;
          padding: 6px 10px;
          border-radius: 5px;
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ps-ink-60);
          cursor: pointer;
        }
        .jv-tab.active {
          background: var(--ps-ink);
          color: var(--ps-bg);
        }
        .jv-memory {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .jv-memo {
          background: #fff;
          border: 1px solid var(--ps-ink-08);
          border-radius: 10px;
          padding: 10px 12px;
        }
        .jv-memo-title {
          font-family: var(--ps-serif);
          font-size: 13px;
          letter-spacing: -0.01em;
          margin-bottom: 4px;
        }
        .jv-memo-body {
          font-size: 12px;
          color: var(--ps-ink-70);
          line-height: 1.5;
          white-space: pre-wrap;
        }
        .jv-memo-foot {
          font-family: var(--ps-mono);
          font-size: 9px;
          color: var(--ps-ink-50);
          letter-spacing: 0.04em;
          margin-top: 6px;
        }
        .jv-empty {
          padding: 14px;
          background: var(--ps-paper);
          border: 1px dashed var(--ps-ink-15);
          border-radius: 10px;
          font-size: 12.5px;
          color: var(--ps-ink-60);
          line-height: 1.5;
        }
        .jv-refs {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .jv-ref {
          background: #fff;
          border: 1px solid var(--ps-ink-08);
          border-radius: 10px;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .jv-ref-title {
          font-family: var(--ps-serif);
          font-size: 13px;
          letter-spacing: -0.01em;
        }
        .jv-ref-body {
          font-size: 11.5px;
          color: var(--ps-ink-70);
          line-height: 1.5;
        }
        .jv-ref-link {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ps-accent);
          text-decoration: none;
          align-self: flex-start;
        }
        @media (max-width: 1280px) {
          .jv-shell { grid-template-columns: 220px 1fr; }
          .jv-rail-right { display: none; }
        }
        @media (max-width: 900px) {
          .jv-shell { grid-template-columns: 1fr; padding: 16px; }
          .jv-rail-left { position: static; }
        }
      `}</style>
    </PSShell>
  );
}
