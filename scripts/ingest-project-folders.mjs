#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { ingestProjectFolders } from "../lib/projectIngestion.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const ROOT = process.env.RISE_PROJECT_ROOT || path.resolve(process.cwd(), "RiseAndShine");
const DRY_RUN = process.argv.includes("--dry-run");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
let TARGET_USER_ID = process.env.RISE_DEFAULT_USER_ID;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
if (!TARGET_USER_ID) {
  // Fallback for local setups: data/target_user.json generated during bootstrap
  try {
    const targetUserPath = path.resolve(process.cwd(), "data/target_user.json");
    const raw = await fs.readFile(targetUserPath, "utf8");
    const parsed = JSON.parse(raw);
    TARGET_USER_ID = parsed?.id || parsed?.user_id || null;
  } catch {
    // ignore
  }
}

if (!TARGET_USER_ID) {
  console.error("Missing RISE_DEFAULT_USER_ID in .env.local (or data/target_user.json)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  const result = await ingestProjectFolders({
    supabase,
    userId: TARGET_USER_ID,
    root: ROOT,
    dryRun: DRY_RUN,
    moveProcessed: true,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
