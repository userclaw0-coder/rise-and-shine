import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { BrandMarkLockup } from "../components/BrandMark";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");

  async function signUp() {
    setMsg("Working...");
    const { error } = await supabase.auth.signUp({ email, password: pw });
    setMsg(error ? error.message : "Signed up. Now log in.");
  }

  async function signIn() {
    setMsg("Working...");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setMsg(error ? error.message : "Logged in.");
    if (!error) window.location.href = "/today";
  }

  async function signInWithProvider(provider) {
    setMsg("Redirecting to provider...");
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: typeof window !== "undefined" ? `${window.location.origin}/` : undefined,
      },
    });
    if (error) setMsg(error.message);
  }

  function handleSubmit(e) {
    e.preventDefault();
    signIn();
  }

  return (
    <div
      className="rs-shell"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        className="rs-section-card"
        style={{ maxWidth: 420, width: "100%", marginBottom: 0 }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <BrandMarkLockup maxHeight={100} />
        </div>
        <h1
          className="rs-section-card__title"
          style={{ fontSize: "1.35rem", marginBottom: 6, textAlign: "center" }}
        >
          Welcome back
        </h1>
        <p className="rs-section-card__subtitle" style={{ marginTop: 0, marginBottom: 16, textAlign: "center" }}>
          Log in to continue, or create a new account.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            className="rs-input"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ marginBottom: 10 }}
          />
          <input
            className="rs-input"
            placeholder="Password"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <button type="submit" className="rs-btn-primary" style={{ flex: 1 }}>
              Log in
            </button>
            <button type="button" className="rs-btn-ghost" style={{ flex: 1 }} onClick={signUp}>
              Sign up
            </button>
          </div>
        </form>
        <div
          style={{
            margin: "12px 0",
            textAlign: "center",
            fontSize: 12,
            color: "var(--rs-on-surface-variant)",
          }}
        >
          <span>or continue with</span>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button
            type="button"
            onClick={() => signInWithProvider("google")}
            className="rs-nav-btn"
            style={{ flex: 1, justifyContent: "center" }}
          >
            Google
          </button>
          <button
            type="button"
            onClick={() => signInWithProvider("apple")}
            className="rs-nav-btn"
            style={{ flex: 1, justifyContent: "center" }}
          >
            Apple
          </button>
        </div>
        <p style={{ color: "var(--rs-on-surface-variant)", fontSize: 12, marginTop: 8, marginBottom: 0 }}>
          {msg}
        </p>
      </div>
    </div>
  );
}
