import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Home() {
  const [user, setUser] = useState(null);
  const [msg, setMsg] = useState("Loading...");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user || null;
      setUser(u);
      if (!u) window.location.href = "/login";
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user || null;
      setUser(u);
      if (!u) window.location.href = "/login";
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    async function runBootstrap() {
      if (!user) return;
      setMsg("Bootstrapping categories/tags/templates...");
      const { error } = await supabase.rpc("bootstrap_user_data");
      setMsg(error ? `Bootstrap error: ${error.message}` : "Bootstrap OK. Ready.");
    }
    runBootstrap();
  }, [user]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Rise & Shine</h1>
      <p>{msg}</p>
      <button onClick={signOut} style={{ padding: 10 }}>Sign out</button>
      <hr />
      <p>Next: add UI pages (Today / Backlog / Analytics) after migration.</p>
    </div>
  );
}
