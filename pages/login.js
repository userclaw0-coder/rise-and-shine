import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

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
    <div style={{ maxWidth: 420, margin: "40px auto", fontFamily: "system-ui" }}>
      <h2>Rise & Shine — Login</h2>
      <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
        Log in to continue, or create a new account.
      </p>
      <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
        <input
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
        />
        <input
          placeholder="Password"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
        />
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <button
            type="submit"
            style={{
              flex: 1,
              padding: 10,
              borderRadius: 999,
              border: "none",
              background: "#111827",
              color: "#fff",
              fontWeight: 500,
            }}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={signUp}
            style={{
              flex: 1,
              padding: 10,
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: "#fff",
              color: "#111827",
            }}
          >
            Sign up
          </button>
        </div>
      </form>
      <div style={{ margin: "12px 0", textAlign: "center", fontSize: 12, color: "#9ca3af" }}>
        <span>or continue with</span>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => signInWithProvider("google")}
          style={{
            flex: 1,
            padding: 8,
            borderRadius: 999,
            border: "1px solid #e5e7eb",
            background: "#fff",
            fontSize: 13,
          }}
        >
          Google
        </button>
        <button
          type="button"
          onClick={() => signInWithProvider("apple")}
          style={{
            flex: 1,
            padding: 8,
            borderRadius: 999,
            border: "1px solid #e5e7eb",
            background: "#fff",
            fontSize: 13,
          }}
        >
          Apple
        </button>
      </div>
      <p style={{ color: "#666", fontSize: 12, marginTop: 8 }}>{msg}</p>
    </div>
  );
}
