import { useMemo, useState } from "react";
import PSShell from "../components/PSShell";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabaseClient";

export default function AccountPage() {
  const { user, isCheckingAuth } = useAuth();
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const currentEmail = user?.email || "";
  const [newEmail, setNewEmail] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const canChangeEmail = useMemo(() => !!currentEmail, [currentEmail]);

  async function handleChangeEmail() {
    if (!user) return;
    const email = String(newEmail || "").trim();
    if (!email) return;
    setError("");
    setMsg("Updating email…");
    const { error: e } = await supabase.auth.updateUser({ email });
    if (e) {
      setMsg("");
      setError(e.message || "Failed to update email.");
      return;
    }
    setError("");
    setMsg("Email update requested. Check your inbox to confirm the change.");
    setNewEmail("");
  }

  async function handleChangePassword() {
    if (!user) return;
    if (!currentEmail) {
      setError("No email found for this account.");
      return;
    }
    if (!currentPassword || !newPassword) return;
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setError("");
    setMsg("Re-authenticating…");

    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: currentEmail,
      password: currentPassword,
    });
    if (reauthError) {
      setMsg("");
      setError(reauthError.message || "Current password is incorrect.");
      return;
    }

    setMsg("Updating password…");
    const { error: e } = await supabase.auth.updateUser({ password: newPassword });
    if (e) {
      setMsg("");
      setError(e.message || "Failed to update password.");
      return;
    }

    setError("");
    setMsg("Password updated.");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  const coachPayload = {
    has_email: !!currentEmail,
    note:
      "Account page — credentials only (login email + password). No planning data here.",
  };

  if (isCheckingAuth || !user) {
    return (
      <PSShell scope="account" title="Account" coachDisabled>
        <div className="ps-view">
          <div className="ps-eyebrow">— · Account</div>
          <h1 className="ps-title">Account.</h1>
          <p className="ps-sub">Loading…</p>
        </div>
      </PSShell>
    );
  }

  return (
    <PSShell
      scope="account"
      title="Account"
      coachPayload={coachPayload}
      coachPayloadReady
    >
      <div className="ps-view account-view">
        <div className="ps-eyebrow">— · Account</div>
        <h1 className="ps-title">Account.</h1>
        <p className="ps-sub">
          Your login email and password. Everything else — projects, outcomes,
          vision — lives on the other pages.
        </p>

        {(error || msg) && (
          <div className={"ac-banner " + (error ? "ac-banner--err" : "ac-banner--ok")}>
            {error || msg}
          </div>
        )}

        <section className="ac-card">
          <div className="ac-card-head">
            <h2>Login email</h2>
            <span className="ac-cap">The address you sign in with.</span>
          </div>
          <div className="ac-current">
            <span className="ac-current-lab">Current</span>
            <span className="ac-current-val">{currentEmail || "—"}</span>
          </div>
          <div className="ac-row">
            <input
              type="email"
              className="ac-input"
              placeholder="New email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              disabled={!canChangeEmail}
            />
            <button
              type="button"
              className="ac-btn"
              onClick={handleChangeEmail}
              disabled={!canChangeEmail || !String(newEmail || "").trim()}
            >
              Update email
            </button>
          </div>
          <p className="ac-hint">
            You may need to confirm this change from a link sent to your new
            address.
          </p>
        </section>

        <section className="ac-card">
          <div className="ac-card-head">
            <h2>Password</h2>
            <span className="ac-cap">
              We verify your current password before changing it.
            </span>
          </div>
          <div className="ac-stack">
            <input
              type="password"
              className="ac-input"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <input
              type="password"
              className="ac-input"
              placeholder="New password (min 8 chars)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <input
              type="password"
              className="ac-input"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <div>
              <button
                type="button"
                className="ac-btn"
                onClick={handleChangePassword}
                disabled={!currentPassword || !newPassword || !confirmPassword}
              >
                Update password
              </button>
            </div>
          </div>
          <p className="ac-hint">
            Changing your password will sign you out of other devices.
          </p>
        </section>
      </div>

      <style jsx global>{`
        .account-view {
          max-width: 640px;
        }
        .ac-banner {
          margin-top: 14px;
          padding: 10px 14px;
          border-radius: 10px;
          font-size: 13px;
          line-height: 1.45;
          border: 1px solid transparent;
        }
        .ac-banner--ok {
          background: rgba(100, 140, 90, 0.08);
          border-color: rgba(100, 140, 90, 0.25);
          color: var(--ps-sage, #3f6a3a);
        }
        .ac-banner--err {
          background: rgba(170, 70, 55, 0.08);
          border-color: rgba(170, 70, 55, 0.25);
          color: var(--ps-clay);
        }
        .ac-card {
          margin-top: 18px;
          padding: 22px 22px 20px;
          background: var(--ps-paper-soft);
          border: 1px solid var(--ps-ink-08);
          border-radius: 14px;
        }
        .ac-card-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }
        .ac-card-head h2 {
          font-family: var(--ps-serif);
          font-size: 20px;
          letter-spacing: -0.01em;
          color: var(--ps-ink);
          margin: 0;
        }
        .ac-cap {
          font-family: var(--ps-mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
        }
        .ac-current {
          display: flex;
          align-items: baseline;
          gap: 10px;
          margin-bottom: 12px;
          padding: 10px 12px;
          background: #fff;
          border: 1px dashed var(--ps-ink-10);
          border-radius: 8px;
          font-size: 13px;
        }
        .ac-current-lab {
          font-family: var(--ps-mono);
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ps-ink-50);
        }
        .ac-current-val {
          color: var(--ps-ink);
          font-size: 14px;
        }
        .ac-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }
        .ac-stack {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        .ac-input {
          flex: 1 1 220px;
          min-width: 0;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid var(--ps-ink-15);
          background: #fff;
          font-size: 14px;
          color: var(--ps-ink);
          font-family: inherit;
        }
        .ac-input:focus {
          outline: none;
          border-color: var(--ps-accent);
          box-shadow: 0 0 0 3px rgba(196, 100, 72, 0.12);
        }
        .ac-btn {
          padding: 10px 16px;
          border-radius: 999px;
          border: 1px solid var(--ps-ink);
          background: var(--ps-ink);
          color: var(--ps-paper);
          font-size: 13px;
          font-family: inherit;
          cursor: pointer;
          transition: opacity 120ms;
        }
        .ac-btn:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }
        .ac-btn:not(:disabled):hover {
          opacity: 0.88;
        }
        .ac-hint {
          margin: 10px 0 0;
          font-size: 12px;
          color: var(--ps-ink-60);
        }
      `}</style>
    </PSShell>
  );
}
