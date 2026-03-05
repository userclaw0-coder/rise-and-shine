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
    async function runBootstrapAndRedirect() {
      if (!user) return;
      setMsg("Bootstrapping…");
      await supabase.rpc("bootstrap_user_data");
      const laterKey = "rs-onboarding-later";
      const later =
        typeof window !== "undefined"
          ? window.localStorage.getItem(laterKey)
          : null;
      const { data: profileRow } = await supabase
        .from("user_profile")
        .select("profile")
        .eq("user_id", user.id)
        .maybeSingle();
      const hasIdentity =
        profileRow &&
        profileRow.profile &&
        Array.isArray(profileRow.profile.identity_attributes) &&
        profileRow.profile.identity_attributes.length > 0;
      if (!later && !hasIdentity) {
        window.location.href = "/onboarding";
      } else {
        window.location.href = "/today";
      }
    }
    runBootstrapAndRedirect();
  }, [user]);

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Rise & Shine</h1>
      <p>{msg}</p>
      {!user && <p>Redirecting to login…</p>}
    </div>
  );
}
