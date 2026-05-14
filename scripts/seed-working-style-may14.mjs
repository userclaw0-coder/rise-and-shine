// Record Tom's 2026-05-14 working-style trait: logistics-first momentum.
// Plus 10 boat-specific logistics quick-win tasks that put this trait to work.
// Run once:
//   node --env-file=.env.local scripts/seed-working-style-may14.mjs

import { writeMemory } from "../lib/memories.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const USER_ID = "4635828b-46c0-4737-b1bb-1d3082864e33";
const BOAT = "6d0e75de-a545-484d-8f65-3dbfc52bd0be";

// ─── Memory: the trait itself, global-scope ────────────────────────────
const trait = await writeMemory(USER_ID, {
  scope_type: "global",
  scope_id: null,
  kind: "preference",
  content:
    "WORKING-STYLE TRAIT (Tom 2026-05-14, self-described): innately disorganized; avoids projects when parts/pieces are scattered and he doesn't know where things are. SYSTEM RESPONSE: every project plan should include LOGISTICS-FIRST QUICK-WIN tasks before substantive work — 'gather all batteries near a plug + computer,' 'find and organize the following cables,' 'locate the gear reduction unit + bring to workbench.' These bite-sized 'where are the parts' tasks are not busywork; they unlock momentum in an otherwise overwhelmed world. When Jarvis (or any coach) proposes tasks for physical work, it should propose a gather/locate/organize precursor FIRST, not the doing-task. Mark these as 'quick-win' so they surface as Quick Wins on the Today queue.",
  importance: 10,
  source: "user",
});
console.log(`✓ trait memory ${trait.id} written at importance ${trait.importance}\n`);

// ─── Mirror it into user_profile so it rides every Jarvis turn ────────
const { data: profileRow } = await supabase
  .from("user_profile")
  .select("profile")
  .eq("user_id", USER_ID)
  .maybeSingle();
const profile = profileRow?.profile || {};
const nextProfile = {
  ...profile,
  working_style: {
    ...(profile.working_style || {}),
    traits: [
      ...((profile.working_style?.traits) || []).filter(
        (t) => t.label !== "logistics-first"
      ),
      {
        label: "logistics-first",
        description:
          "Innately disorganized; avoids projects when parts/pieces are scattered. Needs 'gather/locate/organize' quick-wins BEFORE substantive work to build momentum.",
        coach_rule:
          "When proposing tasks for any work involving physical parts, propose a gather/locate/organize precursor task FIRST. Use phrasing like 'Get all X in one place near a Y' or 'Find and organize the following…'. Tag as quick-win.",
        added_at: new Date().toISOString(),
      },
    ],
  },
};
const { error: upErr } = await supabase
  .from("user_profile")
  .upsert(
    { user_id: USER_ID, profile: nextProfile },
    { onConflict: "user_id" }
  );
if (upErr) {
  console.log("✗ profile upsert failed:", upErr.message);
} else {
  console.log(`✓ user_profile.working_style.traits updated\n`);
}

// ─── 10 logistics quick-wins on the Boat project ─────────────────────
const logisticsTasks = [
  {
    title:
      "GATHER: Move all 12 U27-12XP modules to a bench location with 120VAC outlet + WiFi + laptop access (for Valence software top-balance)",
    effort_hours: 1,
    phase: "this_week",
    priority: "Critical",
  },
  {
    title:
      "FIND: Locate the Valence USB comm cable + test it on one module to confirm the software still connects",
    effort_hours: 0.25,
    phase: "this_week",
    priority: "High",
  },
  {
    title:
      "GATHER: Bring TSM2500 chargers + their AC cords to the battery bench area",
    effort_hours: 0.25,
    phase: "this_week",
    priority: "High",
  },
  {
    title:
      "FIND: Locate the gear reduction unit + bring to bench to measure actual ratio (2:1 vs 1.75:1)",
    effort_hours: 0.5,
    phase: "this_week",
    priority: "Medium",
  },
  {
    title:
      "ORGANIZE: Inventory what cable you actually have on hand — pull all spools/lengths into one pile, label gauge + tinned-vs-bare",
    effort_hours: 1,
    phase: "this_week",
    priority: "High",
  },
  {
    title:
      "FIND: Locate (or buy if missing) the 100Ω 100W wirewound resistor + NO relay for the pre-charge circuit — bring to bench",
    effort_hours: 0.5,
    phase: "this_week",
    priority: "Medium",
  },
  {
    title:
      "GATHER: Motor kit components in one place at bench — ME1616 + G8055 + 827 display + EVCC + throttle + cooling loop — confirm bench-test wiring still intact",
    effort_hours: 0.5,
    phase: "this_week",
    priority: "Medium",
  },
  {
    title:
      "FIND: Pull SOLAFANS SF9655A MPPT + its manual to the bench area before configuring (equalize OFF, temp-comp OFF, CV 115.2V)",
    effort_hours: 0.25,
    phase: "this_week",
    priority: "Medium",
  },
  {
    title:
      "ORGANIZE: Print or pull on tablet the COGITO ELECTRICAL DIAGRAM.pdf + U-BMS-HV datasheet + U27-12XP datasheet — keep at bench for reference",
    effort_hours: 0.25,
    phase: "this_week",
    priority: "Medium",
  },
  {
    title:
      "GATHER: All electrical hardware in one staging area at home — quick visual audit confirms every Parts Inventory row is physically findable in 60s",
    effort_hours: 1,
    phase: "this_week",
    priority: "High",
  },
];

const { data: gateTag } = await supabase
  .from("tags")
  .select("id, name")
  .eq("user_id", USER_ID)
  .in("name", ["ws:EL", "@home", "gate:launch", "quick-win"]);
const tagIdByName = Object.fromEntries((gateTag || []).map((t) => [t.name, t.id]));

console.log(`Inserting ${logisticsTasks.length} logistics quick-wins…`);
for (const t of logisticsTasks) {
  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      user_id: USER_ID,
      category_id: BOAT,
      title: t.title,
      priority: t.priority,
      effort_hours: t.effort_hours,
      status: "todo",
      phase: t.phase,
    })
    .select("id, title")
    .single();
  if (error) {
    console.log(`  ✗ ${t.title.slice(0, 60)}: ${error.message}`);
    continue;
  }
  const tagInserts = ["ws:EL", "@home", "gate:launch", "quick-win"]
    .map((name) => tagIdByName[name])
    .filter(Boolean)
    .map((tagId) => ({
      task_id: task.id,
      tag_id: tagId,
      user_id: USER_ID,
    }));
  await supabase.from("task_tags").insert(tagInserts);
  console.log(`  ✓ ${task.id.slice(0, 8)} ${task.title.slice(0, 70)}…`);
}

console.log("\nDone.");
