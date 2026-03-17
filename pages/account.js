import { useMemo, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
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

    // Re-authenticate to ensure the user truly knows the current password
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

  if (isCheckingAuth || !user) {
    return (
      <DashboardLayout>
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading…</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: "-0.02em" }}>
          Account
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6b7280" }}>
          Manage your login email (“username”) and password.
        </p>

        {(error || msg) && (
          <p style={{ marginTop: 10, fontSize: 13, color: error ? "#b91c1c" : "#059669" }}>
            {error || msg}
          </p>
        )}

        <section
          style={{
            marginTop: 18,
            padding: 16,
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 10px" }}>
            Change login email
          </h2>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px" }}>
            Current: <span style={{ color: "#111827" }}>{currentEmail || "—"}</span>
          </p>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="email"
              placeholder="New email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              disabled={!canChangeEmail}
              style={{
                flex: "1 1 220px",
                minWidth: 0,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
              }}
            />
            <button
              type="button"
              onClick={handleChangeEmail}
              disabled={!canChangeEmail || !String(newEmail || "").trim()}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: "1px solid #111827",
                background: "#111827",
                color: "#fff",
                fontSize: 13,
                cursor: canChangeEmail && String(newEmail || "").trim() ? "pointer" : "not-allowed",
                opacity: canChangeEmail && String(newEmail || "").trim() ? 1 : 0.7,
              }}
            >
              Update email
            </button>
          </div>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "10px 0 0" }}>
            You may need to confirm this change via email depending on your Supabase auth settings.
          </p>
        </section>

        <section
          style={{
            marginTop: 18,
            padding: 16,
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 10px" }}>
            Change password
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            <input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <input
              type="password"
              placeholder="New password (min 8 chars)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <div>
              <button
                type="button"
                onClick={handleChangePassword}
                disabled={!currentPassword || !newPassword || !confirmPassword}
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  border: "1px solid #111827",
                  background: "#111827",
                  color: "#fff",
                  fontSize: 13,
                  cursor: currentPassword && newPassword && confirmPassword ? "pointer" : "not-allowed",
                  opacity: currentPassword && newPassword && confirmPassword ? 1 : 0.7,
                }}
              >
                Update password
              </button>
            </div>
            <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
              For safety, we first verify your current password before updating.
            </p>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}

