import Head from "next/head";
import { createClient } from "@supabase/supabase-js";

function UUID_RE() {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
}

export async function getServerSideProps({ params }) {
  const userId = String(params?.userId || "");
  if (!UUID_RE().test(userId)) {
    return { notFound: true };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: profileRow } = await supabase
    .from("user_profile")
    .select("profile, is_public")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profileRow || !profileRow.is_public) {
    return { notFound: true };
  }

  const profile = profileRow.profile || {};

  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const dateStr = `${y}-${m}-${d}`;

  const { data: planRow } = await supabase
    .from("daily_plans")
    .select("queue, mode")
    .eq("user_id", userId)
    .eq("date", dateStr)
    .maybeSingle();

  const taskIds = (planRow?.queue || [])
    .map((slot) => slot?.task_id)
    .filter(Boolean);

  let queueTasks = [];
  if (taskIds.length > 0) {
    const { data: taskRows } = await supabase
      .from("tasks")
      .select("id, title, status")
      .in("id", taskIds);
    const byId = new Map((taskRows || []).map((t) => [t.id, t]));
    queueTasks = (planRow?.queue || []).map((slot) => ({
      slot: slot.slot,
      type: slot.type,
      task: byId.get(slot.task_id) || null,
    }));
  }

  return {
    props: {
      userId,
      profile,
      date: dateStr,
      mode: planRow?.mode || null,
      queue: queueTasks,
    },
  };
}

function Section({ title, children }) {
  return (
    <section className="rs-share-section">
      <h2 className="rs-share-section__title">{title}</h2>
      {children}
    </section>
  );
}

function List({ items }) {
  const cleaned = (items || []).filter(Boolean);
  if (cleaned.length === 0) return <p className="rs-share-empty">—</p>;
  return (
    <ul className="rs-share-list">
      {cleaned.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default function SharePage({ profile, date, mode, queue }) {
  const identity = profile?.identity_attributes || [];
  const outcomes = (profile?.desired_outcomes || [])
    .map((o) => o?.title)
    .filter(Boolean);
  const leverage = profile?.leverage_focus || [];
  const quarter = profile?.quarter_focus || [];
  const immediate = profile?.immediate_step || "";
  const thrive = profile?.thrive_goals || [];
  const photoUrl = profile?.photo_url || "";

  const hasVision =
    identity.length ||
    outcomes.length ||
    leverage.length ||
    quarter.length ||
    immediate ||
    thrive.length;

  return (
    <>
      <Head>
        <title>Rise &amp; Shine — Public Share</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="rs-share-shell">
        <header className="rs-share-header">
          <div className="rs-share-brand">Rise &amp; Shine</div>
          <div className="rs-share-tagline">A shared view · read-only</div>
          {photoUrl && (
            <img
              src={photoUrl}
              alt=""
              className="rs-share-photo"
            />
          )}
        </header>

        <Section title={`Today · ${date}${mode ? ` · ${mode}` : ""}`}>
          {queue.length === 0 ? (
            <p className="rs-share-empty">No plan set for today.</p>
          ) : (
            <ol className="rs-share-queue">
              {queue.map((slot) => (
                <li key={slot.slot}>
                  <span className="rs-share-queue__type">{slot.type}</span>
                  <span className="rs-share-queue__title">
                    {slot.task?.title || "(task removed)"}
                  </span>
                  {slot.task?.status === "done" && (
                    <span className="rs-share-queue__done">✓</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Section>

        {hasVision ? (
          <>
            {identity.length > 0 && (
              <Section title="Identity">
                <p>{identity.join(" · ")}</p>
              </Section>
            )}
            {immediate && (
              <Section title="Immediate step">
                <p>{immediate}</p>
              </Section>
            )}
            {quarter.length > 0 && (
              <Section title="This quarter">
                <List items={quarter} />
              </Section>
            )}
            {outcomes.length > 0 && (
              <Section title="Desired outcomes">
                <List items={outcomes} />
              </Section>
            )}
            {leverage.length > 0 && (
              <Section title="Leverage focus">
                <List items={leverage} />
              </Section>
            )}
            {thrive.length > 0 && (
              <Section title="Goals to thrive">
                <List items={thrive} />
              </Section>
            )}
          </>
        ) : (
          <p className="rs-share-empty">No vision shared yet.</p>
        )}

        <footer className="rs-share-footer">
          Shared via Rise &amp; Shine · read-only
        </footer>
      </main>

      <style jsx global>{`
        body {
          margin: 0;
          background: #12110f;
          color: #e8e3d7;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui,
            sans-serif;
        }
        .rs-share-shell {
          max-width: 720px;
          margin: 0 auto;
          padding: 32px 20px 64px;
        }
        .rs-share-header {
          text-align: center;
          padding: 24px 0 32px;
          border-bottom: 1px solid rgba(186, 177, 159, 0.15);
          margin-bottom: 24px;
        }
        .rs-share-brand {
          font-size: 24px;
          font-weight: 700;
          letter-spacing: 0.02em;
        }
        .rs-share-tagline {
          font-size: 12px;
          color: #9c958a;
          margin-top: 4px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .rs-share-photo {
          width: 96px;
          height: 96px;
          border-radius: 50%;
          object-fit: cover;
          margin-top: 16px;
        }
        .rs-share-section {
          margin: 20px 0;
          padding: 16px;
          background: rgba(186, 177, 159, 0.05);
          border: 1px solid rgba(186, 177, 159, 0.12);
          border-radius: 12px;
        }
        .rs-share-section__title {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #9c958a;
          margin: 0 0 12px;
        }
        .rs-share-section p {
          margin: 0;
          line-height: 1.5;
        }
        .rs-share-list {
          margin: 0;
          padding-left: 20px;
          line-height: 1.6;
        }
        .rs-share-queue {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .rs-share-queue li {
          display: flex;
          align-items: baseline;
          gap: 12px;
          padding: 8px 0;
          border-bottom: 1px solid rgba(186, 177, 159, 0.08);
        }
        .rs-share-queue li:last-child {
          border-bottom: none;
        }
        .rs-share-queue__type {
          flex-shrink: 0;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #9c958a;
          min-width: 110px;
        }
        .rs-share-queue__title {
          flex: 1;
        }
        .rs-share-queue__done {
          color: #6aa84f;
          font-weight: 700;
        }
        .rs-share-empty {
          color: #9c958a;
          font-style: italic;
        }
        .rs-share-footer {
          margin-top: 48px;
          padding-top: 16px;
          border-top: 1px solid rgba(186, 177, 159, 0.15);
          text-align: center;
          font-size: 11px;
          color: #9c958a;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
      `}</style>
    </>
  );
}
