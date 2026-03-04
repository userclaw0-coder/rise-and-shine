import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * Centralized auth for dashboard pages. Redirects to /login when not authenticated.
 * @returns {{ user: import('@supabase/supabase-js').User | null, isCheckingAuth: boolean }}
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user ?? null;
      setUser(u);
      setIsCheckingAuth(false);
      if (!u) window.location.href = "/login";
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (!u) window.location.href = "/login";
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, isCheckingAuth };
}
