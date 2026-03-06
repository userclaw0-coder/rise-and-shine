#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

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

const categoryNameFromFolder = (folder) => {
  const map = {
    RentalHouse: "Rental House",
    MomandDad: "Mom and Dad",
  };
  return map[folder] || folder;
};

function extractTasksFromText(text) {
  const lines = text.split(/\r?\n/);
  const out = [];

  for (const line of lines) {
    const checkbox = line.match(/^\s*[-*]\s*\[\s\]\s+(.+?)\s*$/);
    if (checkbox) {
      out.push(checkbox[1].trim());
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.+?)\s*$/);
    if (bullet && bullet[1].length > 6) {
      out.push(bullet[1].trim());
    }
  }

  return Array.from(new Set(out)).filter((t) => t.length >= 4);
}

async function ensureCategory(userId, categoryName) {
  const { data: existing, error: findErr } = await supabase
    .from("categories")
    .select("id,name")
    .eq("user_id", userId)
    .ilike("name", categoryName)
    .limit(1)
    .maybeSingle();

  if (findErr) throw findErr;
  if (existing?.id) return existing.id;

  if (DRY_RUN) return null;

  const { data: inserted, error: insErr } = await supabase
    .from("categories")
    .insert({ user_id: userId, name: categoryName })
    .select("id")
    .single();
  if (insErr) throw insErr;
  return inserted.id;
}

async function taskExists(userId, categoryId, title) {
  let query = supabase
    .from("tasks")
    .select("id,title,status")
    .eq("user_id", userId)
    .ilike("title", title)
    .neq("status", "archived")
    .limit(1);

  if (categoryId) query = query.eq("category_id", categoryId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return !!data;
}

async function createTask(userId, categoryId, title, sourceFile) {
  if (DRY_RUN) return { id: null };
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id: userId,
      title,
      status: "todo",
      priority: "Medium",
      category_id: categoryId,
    })
    .select("id")
    .single();

  if (error) throw error;

  await supabase.from("task_events").insert({
    user_id: userId,
    task_id: data.id,
    event_type: "created",
    value: { source: "project-folder-ingestion", file: sourceFile },
  });

  return data;
}

async function ingestFile(userId, categoryFolder, filePath) {
  const categoryName = categoryNameFromFolder(categoryFolder);
  const categoryId = await ensureCategory(userId, categoryName);

  const text = await fs.readFile(filePath, "utf8");
  const tasks = extractTasksFromText(text);

  let created = 0;
  let skipped = 0;

  for (const title of tasks) {
    const exists = await taskExists(userId, categoryId, title);
    if (exists) {
      skipped += 1;
      continue;
    }
    await createTask(userId, categoryId, title, path.basename(filePath));
    created += 1;
  }

  return { created, skipped, discovered: tasks.length };
}

async function moveToProcessed(filePath, processedDir) {
  if (DRY_RUN) return;
  await fs.mkdir(processedDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(processedDir, `${stamp}-${path.basename(filePath)}`);
  await fs.rename(filePath, dest);
}

async function main() {
  const entries = await fs.readdir(ROOT, { withFileTypes: true });
  const categoryDirs = entries.filter((d) => d.isDirectory()).map((d) => d.name);

  const summary = [];

  for (const categoryFolder of categoryDirs) {
    const inboxDir = path.join(ROOT, categoryFolder, "inbox");
    const processedDir = path.join(ROOT, categoryFolder, "processed");

    let inboxFiles = [];
    try {
      const files = await fs.readdir(inboxDir, { withFileTypes: true });
      inboxFiles = files
        .filter((f) => f.isFile())
        .map((f) => f.name)
        .filter((name) => /\.(md|txt)$/i.test(name));
    } catch {
      continue;
    }

    for (const file of inboxFiles) {
      const fullPath = path.join(inboxDir, file);
      const result = await ingestFile(TARGET_USER_ID, categoryFolder, fullPath);
      summary.push({ categoryFolder, file, ...result });
      await moveToProcessed(fullPath, processedDir);
    }
  }

  console.log(JSON.stringify({ dryRun: DRY_RUN, root: ROOT, summary }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
