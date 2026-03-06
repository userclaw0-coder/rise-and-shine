import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { ingestProjectFolders } from "../../../lib/projectIngestion";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

function unauthorized(res) {
  return res.status(401).json({ error: "Unauthorized" });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.RISE_INGEST_TOKEN;
  if (token) {
    const auth = req.headers.authorization || "";
    const supplied = auth.startsWith("Bearer ") ? auth.slice(7) : req.headers["x-rise-ingest-token"];
    if (!supplied || supplied !== token) {
      return unauthorized(res);
    }
  }

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const TARGET_USER_ID = process.env.RISE_DEFAULT_USER_ID;
  const ROOT = process.env.RISE_PROJECT_ROOT || path.resolve(process.cwd(), "RiseAndShine");

  if (!SUPABASE_URL || !SERVICE_KEY || !TARGET_USER_ID) {
    return res.status(500).json({
      error: "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or RISE_DEFAULT_USER_ID",
    });
  }

  try {
    const dryRun = !!req.body?.dry_run;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const result = await ingestProjectFolders({
      supabase,
      userId: TARGET_USER_ID,
      root: ROOT,
      dryRun,
      moveProcessed: true,
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Ingestion failed" });
  }
}
