import Head from "next/head";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";

function MapCard({ eyebrow, title, body, variant, span = 3 }) {
  return (
    <div className={`psmap-card${variant ? " psmap-card--" + variant : ""}`} style={{ gridColumn: `span ${span}` }}>
      <div className="psmap-card__eyebrow">{eyebrow}</div>
      <div className="psmap-card__title">{title}</div>
      <div className="psmap-card__body">{body}</div>
    </div>
  );
}

function LoopRow({ name, cadence, desc, artifact }) {
  return (
    <div className="psmap-loop">
      <div>
        <div className="psmap-loop__name">{name}</div>
        <div className="psmap-loop__cadence">{cadence}</div>
      </div>
      <div className="psmap-loop__desc">{desc}</div>
      <div className="psmap-loop__artifact">{artifact}</div>
    </div>
  );
}

function DnaTile({ label, value, example }) {
  return (
    <div className="psmap-dna">
      <div className="psmap-dna__label">{label}</div>
      <div className="psmap-dna__value">{value}</div>
      <div className="psmap-dna__example">{example}</div>
    </div>
  );
}

export default function SystemPage() {
  useAuth();

  return (
    <DashboardLayout>
      <Head>
        <title>System Map · Rise &amp; Shine</title>
      </Head>
      <div className="psmap-page">
        <div className="psmap-view">
          <div className="psmap-eyebrow">Part 01 · How the system works</div>
          <h1 className="psmap-title">
            A curator&apos;s operating system.
            <br />
            <em className="psmap-title__em">
              Vision pulls, tasks deliver, coach keeps the thread taut.
            </em>
          </h1>
          <p className="psmap-sub">
            Rise &amp; Shine treats your life as a portfolio of projects pulling against a single
            vision. The AI coach runs three loops at three cadences — daily execution, project-level
            structure, and weekly strategy — all sharing one memory and one voice. You confirm every
            AI decision until the system earns your trust.
          </p>

          <div className="psmap-section-title">Three loops, one coach</div>
          <div className="psmap-section-sub">
            Same coach. Different scope badge. Separate chat histories so context survives.
          </div>
          <div className="psmap-loops">
            <LoopRow
              name="Daily loop"
              cadence="Each morning · 5 min"
              desc={
                <>
                  Coach surfaces the <strong>single smallest next action per project</strong>, each
                  ≤30 min. You pick a top 3. Evening: quick reflection tags what moved.
                </>
              }
              artifact="Today page"
            />
            <LoopRow
              name="Project loop"
              cadence="Weekly · 15 min per project"
              desc={
                <>
                  Coach helps <strong>develop the task list, order it, and break down anything over
                  30 min</strong>. You confirm the breakdown. Every task gets tagged with its
                  outcome &amp; human need.
                </>
              }
              artifact="Project page"
            />
            <LoopRow
              name="Strategic loop"
              cadence="Sunday · 30 min"
              desc={
                <>
                  Coach sees <strong>the whole portfolio</strong>. Flags projects that haven&apos;t
                  moved, needs that are starving, and patterns across weeks. Proposes next
                  week&apos;s theme.
                </>
              }
              artifact="Weekly Review"
            />
          </div>

          <div className="psmap-section-title">Task DNA</div>
          <div className="psmap-section-sub">
            Every task the AI proposes or you capture gets four tags. You confirm until trust is
            built, then the AI auto-tags silently.
          </div>
          <div className="psmap-dna-grid">
            <DnaTile
              label="Project"
              value="Which of 13 projects"
              example="BeachLife · Ensenada · Mom & Dad · …"
            />
            <DnaTile
              label="Outcome"
              value="Which outcome it serves"
              example="Ship v1 positioning · Lock Q2 rental plan"
            />
            <DnaTile
              label="Human Need"
              value="Which need it feeds"
              example="Growth · Certainty · Connection · …"
            />
            <DnaTile
              label="Size & Type"
              value="≤30 min · Win / Leverage / Progress"
              example="If > 30 min, coach proposes a breakdown"
            />
          </div>

          <div className="psmap-section-title">How a project becomes today&apos;s work</div>
          <div className="psmap-section-sub">
            The pipeline from vision to the single next thing you do.
          </div>
          <div className="psmap-grid">
            <MapCard
              eyebrow="01 · Vision"
              title="Who you are becoming"
              body="Identity traits, outcomes, and the 6 human needs in balance. Rarely edited."
            />
            <MapCard
              variant="accent"
              eyebrow="02 · Projects"
              title="13 active threads"
              body="Each carries outcomes, a task ladder, and a coach that knows it. You open one, you work on it."
            />
            <MapCard
              eyebrow="03 · Tasks"
              title="Broken down, tagged, ordered"
              body="Coach pushes each task under 30 min and tags its DNA. You confirm."
            />
            <MapCard
              variant="solid"
              eyebrow="04 · Today"
              title="One next action per project"
              body="You pick 3. You execute. Reflection at day's end feeds the loop back up."
            />
          </div>

          <div className="psmap-section-title">Where the coach lives</div>
          <div className="psmap-section-sub">
            Instead of scattered AI entry points, one drawer follows you across the app. It changes
            what it knows based on which page you&apos;re on.
          </div>
          <div className="psmap-grid">
            <MapCard
              span={4}
              eyebrow="Daily scope"
              title="Rise & plan"
              body="Knows your top 3, energy, calendar, the day's next-actions. Optimizes for momentum."
            />
            <MapCard
              span={4}
              eyebrow="Project scope"
              title="Develop the ladder"
              body="Knows this project's vision, outcomes, task history, and blockers. Optimizes for structure."
            />
            <MapCard
              span={4}
              eyebrow="Strategic scope"
              title="Whole-context review"
              body="Knows the whole portfolio, 6-week trends, need balance, and your vision. Optimizes for alignment."
            />
          </div>

          <div className="psmap-section-title">Trust, not autopilot</div>
          <div className="psmap-section-sub">
            You control how much the AI does unconfirmed. Starts at &quot;propose everything, commit
            nothing.&quot; Graduates as it learns your patterns.
          </div>
          <div className="psmap-grid">
            <MapCard
              span={6}
              eyebrow="Today"
              title="Level 1 · Suggest & confirm"
              body="Coach proposes tags, breakdowns, and priorities. You approve every change."
            />
            <MapCard
              span={6}
              eyebrow="Later"
              title="Level 3 · Auto-draft, you audit"
              body="Coach tags, breaks down, and orders automatically. You audit weekly during review."
            />
          </div>
        </div>
      </div>

      <style jsx global>{`
        .psmap-page {
          --psmap-bg: #faf7f2;
          --psmap-paper: #f3eee5;
          --psmap-ink: #1a1814;
          --psmap-ink-70: rgba(26, 24, 20, 0.7);
          --psmap-ink-60: rgba(26, 24, 20, 0.6);
          --psmap-ink-50: rgba(26, 24, 20, 0.5);
          --psmap-ink-40: rgba(26, 24, 20, 0.4);
          --psmap-ink-10: rgba(26, 24, 20, 0.1);
          --psmap-ink-08: rgba(26, 24, 20, 0.08);
          --psmap-ink-05: rgba(26, 24, 20, 0.05);
          --psmap-accent: #b97316;
          --psmap-accent-soft: #f5e9d6;
          --psmap-serif: "Fraunces", Georgia, "Times New Roman", serif;
          --psmap-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

          background:
            radial-gradient(1400px 800px at 15% -10%, #f5e7cf 0%, transparent 55%),
            radial-gradient(1000px 600px at 90% 110%, #efdcc8 0%, transparent 55%),
            #ece6da;
          color: var(--psmap-ink);
          min-height: 100%;
          margin: -16px;
          padding: 16px;
        }
        @supports (color: oklch(50% 0.1 50)) {
          .psmap-page {
            --psmap-accent: oklch(62% 0.14 55);
            --psmap-accent-soft: oklch(92% 0.035 55);
          }
        }
        .psmap-view {
          max-width: 1100px;
          margin: 0 auto;
          padding: 32px 24px 80px;
          font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", system-ui,
            sans-serif;
        }
        .psmap-eyebrow {
          font-family: var(--psmap-mono);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--psmap-ink-50);
          margin-bottom: 10px;
        }
        .psmap-title {
          font-family: var(--psmap-serif);
          font-size: 40px;
          font-weight: 400;
          letter-spacing: -0.02em;
          line-height: 1.05;
          margin: 0 0 12px;
          color: var(--psmap-ink);
        }
        .psmap-title__em {
          font-style: italic;
          color: var(--psmap-accent);
        }
        .psmap-sub {
          font-size: 14px;
          color: var(--psmap-ink-60);
          line-height: 1.55;
          max-width: 680px;
          margin: 0;
        }
        .psmap-section-title {
          font-family: var(--psmap-serif);
          font-size: 20px;
          letter-spacing: -0.01em;
          margin: 36px 0 6px;
        }
        .psmap-section-sub {
          font-size: 12px;
          color: var(--psmap-ink-60);
          margin-bottom: 14px;
        }
        .psmap-grid {
          display: grid;
          gap: 16px;
          grid-template-columns: repeat(12, 1fr);
          margin-top: 12px;
        }
        .psmap-card {
          background: rgba(255, 251, 243, 0.78);
          border: 1px solid var(--psmap-ink-10);
          border-radius: 14px;
          padding: 20px;
          position: relative;
        }
        .psmap-card--solid {
          background: var(--psmap-ink);
          color: var(--psmap-bg);
          border-color: var(--psmap-ink);
        }
        .psmap-card--accent {
          background: var(--psmap-accent-soft);
          border-color: rgba(185, 115, 22, 0.25);
        }
        .psmap-card__eyebrow {
          font-family: var(--psmap-mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--psmap-ink-50);
          margin-bottom: 6px;
        }
        .psmap-card--solid .psmap-card__eyebrow {
          color: rgba(250, 247, 242, 0.55);
        }
        .psmap-card--accent .psmap-card__eyebrow {
          color: var(--psmap-accent);
        }
        .psmap-card__title {
          font-family: var(--psmap-serif);
          font-size: 20px;
          letter-spacing: -0.01em;
          margin-bottom: 6px;
        }
        .psmap-card__body {
          font-size: 13px;
          color: var(--psmap-ink-70);
          line-height: 1.5;
        }
        .psmap-card--solid .psmap-card__body {
          color: rgba(250, 247, 242, 0.78);
        }
        .psmap-loops {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 14px;
        }
        .psmap-loop {
          display: grid;
          grid-template-columns: 160px 1fr auto;
          gap: 14px;
          align-items: start;
          padding: 14px 16px;
          background: var(--psmap-paper);
          border: 1px solid var(--psmap-ink-08);
          border-radius: 10px;
        }
        .psmap-loop__name {
          font-family: var(--psmap-serif);
          font-size: 16px;
          letter-spacing: -0.01em;
        }
        .psmap-loop__cadence {
          font-family: var(--psmap-mono);
          font-size: 10px;
          color: var(--psmap-ink-50);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-top: 4px;
        }
        .psmap-loop__desc {
          font-size: 13px;
          color: var(--psmap-ink-70);
          line-height: 1.5;
        }
        .psmap-loop__artifact {
          font-family: var(--psmap-mono);
          font-size: 10px;
          padding: 4px 10px;
          border-radius: 999px;
          background: var(--psmap-ink);
          color: var(--psmap-bg);
          white-space: nowrap;
          letter-spacing: 0.04em;
        }
        .psmap-dna-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-top: 14px;
        }
        .psmap-dna {
          background: var(--psmap-paper);
          border: 1px solid var(--psmap-ink-08);
          border-radius: 10px;
          padding: 14px;
        }
        .psmap-dna__label {
          font-family: var(--psmap-mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--psmap-ink-50);
          margin-bottom: 6px;
        }
        .psmap-dna__value {
          font-family: var(--psmap-serif);
          font-size: 15px;
          color: var(--psmap-ink);
        }
        .psmap-dna__example {
          margin-top: 8px;
          font-size: 11px;
          color: var(--psmap-ink-60);
          font-family: var(--psmap-mono);
          line-height: 1.5;
        }
        @media (max-width: 880px) {
          .psmap-title { font-size: 30px; }
          .psmap-loop { grid-template-columns: 1fr; }
          .psmap-loop__artifact { justify-self: start; }
          .psmap-dna-grid { grid-template-columns: 1fr 1fr; }
          .psmap-card { grid-column: span 12 !important; }
        }
      `}</style>
    </DashboardLayout>
  );
}
