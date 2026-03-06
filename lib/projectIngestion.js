import fs from "fs/promises";
import path from "path";

const CATEGORY_NAME_MAP = {
  RentalHouse: "Rental House",
  MomandDad: "Mom and Dad",
};

function categoryNameFromFolder(folder) {
  return CATEGORY_NAME_MAP[folder] || folder;
}

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

async function ensureCategory(supabase, userId, categoryName, dryRun) {
  const { data: existing, error: findErr } = await supabase
    .from("categories")
    .select("id,name")
    .eq("user_id", userId)
    .ilike("name", categoryName)
    .limit(1)
    .maybeSingle();

  if (findErr) throw findErr;
  if (existing?.id) return existing.id;

  if (dryRun) return null;

  const { data: inserted, error: insErr } = await supabase
    .from("categories")
    .insert({ user_id: userId, name: categoryName })
    .select("id")
    .single();
  if (insErr) throw insErr;
  return inserted.id;
}

async function taskExists(supabase, userId, categoryId, title) {
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

async function createTask(supabase, userId, categoryId, title, sourceFile, dryRun) {
  if (dryRun) return { id: null };
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

async function ingestFile({ supabase, userId, categoryFolder, filePath, dryRun }) {
  const categoryName = categoryNameFromFolder(categoryFolder);
  const categoryId = await ensureCategory(supabase, userId, categoryName, dryRun);

  const text = await fs.readFile(filePath, "utf8");
  const tasks = extractTasksFromText(text);

  let created = 0;
  let skipped = 0;

  for (const title of tasks) {
    const exists = await taskExists(supabase, userId, categoryId, title);
    if (exists) {
      skipped += 1;
      continue;
    }
    await createTask(supabase, userId, categoryId, title, path.basename(filePath), dryRun);
    created += 1;
  }

  return { created, skipped, discovered: tasks.length };
}

async function moveToProcessed(filePath, processedDir, dryRun) {
  if (dryRun) return null;
  await fs.mkdir(processedDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(processedDir, `${stamp}-${path.basename(filePath)}`);
  await fs.rename(filePath, dest);
  return dest;
}

export async function ingestProjectFolders({
  supabase,
  userId,
  root,
  dryRun = false,
  moveProcessed = true,
}) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const categoryDirs = entries.filter((d) => d.isDirectory()).map((d) => d.name);

  const summary = [];

  for (const categoryFolder of categoryDirs) {
    const inboxDir = path.join(root, categoryFolder, "inbox");
    const processedDir = path.join(root, categoryFolder, "processed");

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
      const result = await ingestFile({
        supabase,
        userId,
        categoryFolder,
        filePath: fullPath,
        dryRun,
      });
      const processedPath =
        moveProcessed && !dryRun
          ? await moveToProcessed(fullPath, processedDir, dryRun)
          : null;
      summary.push({ categoryFolder, file, ...result, processedPath });
    }
  }

  return {
    dryRun,
    root,
    summary,
    totals: summary.reduce(
      (acc, row) => {
        acc.discovered += row.discovered || 0;
        acc.created += row.created || 0;
        acc.skipped += row.skipped || 0;
        return acc;
      },
      { discovered: 0, created: 0, skipped: 0 }
    ),
  };
}
