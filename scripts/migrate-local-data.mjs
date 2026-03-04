import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing env vars. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const DATA_DIR = path.join(process.cwd(), "data");
const TASKS_PATH = path.join(DATA_DIR, "tasks.json");
const LOGS_PATH = path.join(DATA_DIR, "log.jsonl");

function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

function readJsonl(p) {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf8")
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .map(JSON.parse);
}

function uniq(arr) {
  return [...new Set(arr)];
}

async function main() {
  const tasks = readJson(TASKS_PATH);
  const logs = readJsonl(LOGS_PATH);

  // 1) You must provide the user_id to import into.
  // We'll ask you to paste it into a file named data/target_user.json
  const targetPath = path.join(DATA_DIR, "target_user.json");
  if (!fs.existsSync(targetPath)) {
    console.error("Create data/target_user.json with {\"user_id\":\"...\"} (Supabase auth user id).");
    process.exit(1);
  }
  const { user_id } = readJson(targetPath);
  if (!user_id) throw new Error("target_user.json missing user_id");

  // 2) Ensure bootstrap has run (categories/tags/template exist)
  // categories
  const { data: cats, error: catErr } = await supabase
    .from("categories")
    .select("id,name")
    .eq("user_id", user_id);

  if (catErr) throw catErr;
  const catByName = Object.fromEntries(cats.map(c=>[c.name, c.id]));

  // If you used "Daily Repeat" locally, create a category for it
  async function ensureCategory(name, sort_order=0) {
    if (catByName[name]) return catByName[name];
    const { data, error } = await supabase.from("categories")
      .insert({ user_id, name, sort_order })
      .select("id,name")
      .single();
    if (error) throw error;
    catByName[data.name] = data.id;
    return data.id;
  }

  // Create "Daily Repeat" category if missing
  await ensureCategory("Daily Repeat", 1);

  // 3) Create tasks
  // Map local task_id -> db uuid
  const idMap = {};

  // First pass: create parents (non-subtasks)
  const parents = tasks.filter(t => !t.parent_id); // your local format
  for (const t of parents) {
    const categoryName = t.category || "Business";
    const catId = await ensureCategory(categoryName, 0);

    const row = {
      user_id,
      title: t.title,
      category_id: catId,
      priority: (t.priority || "Medium"),
      effort_hours: t.effort_hours ?? null,
      due_date: t.due_date ?? null,
      status: t.status || "todo",
      parent_task_id: null,
      archived_at: (t.status === "archived") ? new Date().toISOString() : null
    };

    const { data, error } = await supabase
      .from("tasks")
      .insert(row)
      .select("id")
      .single();

    if (error) throw error;
    idMap[t.id] = data.id;

    // tags: create tags if needed then link via task_tags
    const tags = t.tags || [];
    for (const tg of tags) {
      const { data: tagRow } = await supabase
        .from("tags")
        .select("id")
        .eq("user_id", user_id)
        .eq("name", tg)
        .maybeSingle();

      let tagId = tagRow?.id;
      if (!tagId) {
        const ins = await supabase.from("tags").insert({ user_id, name: tg }).select("id").single();
        if (ins.error) throw ins.error;
        tagId = ins.data.id;
      }
      const link = await supabase.from("task_tags").insert({ user_id, task_id: data.id, tag_id: tagId });
      if (link.error && link.error.code !== "23505") throw link.error;
    }
  }

  // Second pass: create subtasks if your local data supports it
  const subtasks = tasks.filter(t => t.parent_id);
  for (const st of subtasks) {
    const parentDbId = idMap[st.parent_id];
    if (!parentDbId) continue;

    const categoryName = st.category || "Business";
    const catId = await ensureCategory(categoryName, 0);

    const row = {
      user_id,
      title: st.title,
      category_id: catId,
      priority: (st.priority || "Medium"),
      effort_hours: st.effort_hours ?? null,
      due_date: st.due_date ?? null,
      status: st.status || "todo",
      parent_task_id: parentDbId,
      archived_at: (st.status === "archived") ? new Date().toISOString() : null
    };

    const { data, error } = await supabase.from("tasks").insert(row).select("id").single();
    if (error) throw error;
    idMap[st.id] = data.id;

    const tags = st.tags || [];
    for (const tg of tags) {
      const { data: tagRow } = await supabase
        .from("tags")
        .select("id")
        .eq("user_id", user_id)
        .eq("name", tg)
        .maybeSingle();

      let tagId = tagRow?.id;
      if (!tagId) {
        const ins = await supabase.from("tags").insert({ user_id, name: tg }).select("id").single();
        if (ins.error) throw ins.error;
        tagId = ins.data.id;
      }
      const link = await supabase.from("task_tags").insert({ user_id, task_id: data.id, tag_id: tagId });
      if (link.error && link.error.code !== "23505") throw link.error;
    }
  }

  // 4) Import task completion events from log.jsonl
  // We record completed/uncompleted with created_at = ts
  for (const e of logs) {
    const localId = e.task_id;
    const dbId = idMap[localId];
    if (!dbId) continue;

    const created_at = e.ts ? new Date(e.ts).toISOString() : new Date().toISOString();
    const event_type = e.done ? "completed" : "uncompleted";

    const ins = await supabase.from("task_events").insert({
      user_id,
      task_id: dbId,
      event_type,
      value: { imported: true },
      created_at
    });

    if (ins.error) throw ins.error;
  }

  // Save id map for safety/debug
  fs.writeFileSync(path.join(DATA_DIR, "id_map.json"), JSON.stringify(idMap, null, 2));

  console.log("✅ Migration complete.");
  console.log("Saved data/id_map.json mapping local->db ids.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
