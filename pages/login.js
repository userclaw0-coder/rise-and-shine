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
    if (!error) window.location.href = "/";
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", fontFamily: "system-ui" }}>
      <h2>Rise & Shine — Login</h2>
      <input placeholder="email" value={email} onChange={e=>setEmail(e.target.value)}
        style={{ width:"100%", padding:10, marginBottom:10 }} />
      <input placeholder="password" type="password" value={pw} onChange={e=>setPw(e.target.value)}
        style={{ width:"100%", padding:10, marginBottom:10 }} />
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={signIn} style={{ padding:10 }}>Log in</button>
        <button onClick={signUp} style={{ padding:10 }}>Sign up</button>
      </div>
      <p style={{ color:"#666" }}>{msg}</p>
    </div>
  );
}
