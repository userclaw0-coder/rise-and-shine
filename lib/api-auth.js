import { createClient } from "@supabase/supabase-js";

const authClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function getBearerToken(req) {
  const authHeader = req.headers?.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim() || null;
}

export async function getAuthenticatedUserId(req) {
  const token = getBearerToken(req);
  if (!token) {
    const err = new Error("Authentication required");
    err.status = 401;
    throw err;
  }

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user?.id) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }

  return data.user.id;
}
