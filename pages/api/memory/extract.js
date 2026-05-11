// POST /api/memory/extract
//
// Runs the memory extractor for one user. Two auth modes:
//
//   1. Bearer JWT (user-initiated): user_id is derived from the JWT.
//      Used when the user manually triggers an extraction from the app.
//
//   2. CRON_SECRET (server-to-server, e.g. Vercel cron): body must include
//      user_id. The cron config in vercel.json scans every user we want to
//      extract for and POSTs once per user — or, if you prefer a single
//      tick, set user_id="ALL" and we iterate all enabled users here.
//
// Returns { window, signalCount, proposed, written, dropped, note,
//           providerUsed, modelUsed } on success.

import { createClient } from "@supabase/supabase-js";
import { extractMemoriesForUser } from "../../../lib/memory-extractor.js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CRON_SECRET = process.env.CRON_SECRET;

async function resolveUserIdFromAuth(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  // Cron path: bearer token equals CRON_SECRET → trust the user_id in body.
  if (CRON_SECRET && token === CRON_SECRET) {
    return { kind: "cron", userId: req.body?.user_id || null };
  }
  // User path: verify JWT against Supabase auth.
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return { kind: "user", userId: data.user.id };
}

async function listEligibleUserIds() {
  const { data } = await supabaseAdmin.from("user_profile").select("user_id");
  return (data || []).map((r) => r.user_id);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ctx = await resolveUserIdFromAuth(req);
  if (!ctx) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const dryRun = !!req.body?.dry_run;

  try {
    // Cron mode + user_id="ALL" iterates every known user (single-tenant for now).
    if (ctx.kind === "cron" && req.body?.user_id === "ALL") {
      const ids = await listEligibleUserIds();
      const results = [];
      for (const uid of ids) {
        try {
          results.push({
            user_id: uid,
            ...(await extractMemoriesForUser(uid, { dryRun })),
          });
        } catch (err) {
          results.push({ user_id: uid, error: err.message });
        }
      }
      return res.status(200).json({ ok: true, count: ids.length, results });
    }

    if (!ctx.userId) {
      return res.status(400).json({ error: "user_id required" });
    }
    const result = await extractMemoriesForUser(ctx.userId, { dryRun });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error("[memory/extract] failed:", err);
    return res.status(500).json({ error: err.message || "extraction failed" });
  }
}
