// One-shot: seed Boat long-form context + Mom/Dad life update memories
// from the 2026-05-12 Reorient interview dump.
// Run once via:
//   node --env-file=.env.local scripts/seed-life-context-may12.mjs

import { writeMemory } from "../lib/memories.js";

const USER_ID = "4635828b-46c0-4737-b1bb-1d3082864e33";
const BOAT_CATEGORY_ID = "6d0e75de-a545-484d-8f65-3dbfc52bd0be";
const MOM_DAD_CATEGORY_ID = "f92a032e-1c70-48fb-9a1b-26153e48d656";

const BOAT_NOTE_REF = "note:79d6cf96-9b98-4c2f-813a-39dbecc2ec26";
const MOM_DAD_NOTE_REF = "note:521d3633-ecf2-45eb-b6c4-dcb73bffb2f5";

const seeds = [
  // --- Family (person-scoped, cross-project) ---
  { scope_type: "person", scope_id: "lynn", kind: "relationship",
    content: "Lynn is Tom's wife and co-owner of Hawkswood since their joint purchase ~2008. Co-pilot for the original Mobile→Dry Tortugas→Bahamas voyage; was 6 months pregnant with Kai when the Perkins failed in the Bahamas. Vision-19 (sailing Atlantic to European waterways) is named explicitly with Lynn.",
    importance: 9, source: "user", source_ref: BOAT_NOTE_REF },
  { scope_type: "person", scope_id: "kai", kind: "relationship",
    content: "Kai is Tom's eldest son, age 15 (b. ~2010-2011). Born during the original ICW→Bahamas voyage. Lived in Ecuador / was homeschooled until 2024; his expressed interest in US schooling + friends his age is what anchored the family in Gainesville and put the boat back into long-term storage end of summer 2024.",
    importance: 8, source: "user", source_ref: BOAT_NOTE_REF },
  { scope_type: "person", scope_id: "aiden", kind: "relationship",
    content: "Aiden is Tom's middle son, age 12. One of the three sons who worked on Hawkswood through summer 2024 in the Green Cove Springs work yard.",
    importance: 6, source: "user", source_ref: BOAT_NOTE_REF },
  { scope_type: "person", scope_id: "rylan", kind: "relationship",
    content: "Rylan is Tom's youngest son, age 10. One of the three sons who worked on Hawkswood through summer 2024.",
    importance: 6, source: "user", source_ref: BOAT_NOTE_REF },

  // --- Boat scope ---
  { scope_type: "project", scope_id: BOAT_CATEGORY_ID, kind: "fact",
    content: "Hawkswood is currently in LONG-TERM storage at Green Cove Springs Marina, FL. GCS has two storage areas: long-term (limited work allowed) and a work yard (heavier fiberglass/grinding allowed, higher rates). Moves between the two should be intentional — work-yard time costs more.",
    importance: 9, source: "user", source_ref: BOAT_NOTE_REF },
  { scope_type: "project", scope_id: BOAT_CATEGORY_ID, kind: "constraint",
    content: "Storage runs ~$400/month and has been accruing for years. Every month off the hard saves $400 — this is a project-level driver, not background noise. The implied target is: get the boat out of long-term storage by a date Tom commits to.",
    importance: 10, source: "user", source_ref: BOAT_NOTE_REF },
  { scope_type: "project", scope_id: BOAT_CATEGORY_ID, kind: "fact",
    content: "Family base for Boat work is Gainesville, FL (~58 mi / ~1hr drive from Green Cove Springs). The Gainesville house has a shipping container on-property that stores boat systems being prepped for install: diesel generator, water maker, nav equipment, etc. Bench / electrical / prep work happens at home; install happens at the boat.",
    importance: 9, source: "user", source_ref: BOAT_NOTE_REF },
  { scope_type: "project", scope_id: BOAT_CATEGORY_ID, kind: "fact",
    content: "Hawkswood's voyage history: bought ~2008 in NC → shipped to Hammond IN (Tom worked at Field Museum Chicago) → inland river system (half the Great Loop) to Mobile AL → major gunwale rot repairs at Mobile → Gulf Coast → Dry Tortugas → Bahamas where Perkins failed (Lynn 6mo pregnant with Kai) → sailed up to St. Mary's River → towed by tow insurance to Green Cove Springs Marina.",
    importance: 7, source: "user", source_ref: BOAT_NOTE_REF },
  { scope_type: "project", scope_id: BOAT_CATEGORY_ID, kind: "fact",
    content: "Boat sat in storage ~14 years (~2010-2024) while family lived in Ecuador / traveled US in camper. Summer 2024 = first major work trip back: Tom + 3 sons did major overhaul (motor removal, rot repair) in GCS work yard. Photos: https://photos.app.goo.gl/2x5bzCiCQLULkNDa9",
    importance: 7, source: "user", source_ref: BOAT_NOTE_REF },
  { scope_type: "project", scope_id: BOAT_CATEGORY_ID, kind: "decision",
    content: "Pivoted from rebuilding the seized Perkins to a 96V LiFePO4 electric conversion. Original engine had water + sand in cylinders + seized pistons — beyond reasonable rebuild. Electric chosen because (a) huge battery doubles as house bank for on-anchor AC + electronics, (b) forces sailing-by-weather-window discipline rather than motoring, (c) Tom's Tesla-experience cross-trains.",
    importance: 9, source: "user", source_ref: BOAT_NOTE_REF },
  { scope_type: "project", scope_id: BOAT_CATEGORY_ID, kind: "decision",
    content: "Backup-charging plan: keep the 120 gal diesel tank + add a 4kW diesel generator on board. Range on generator alone: ~3-4 knots, plenty for emergencies and no-sun stretches. This removes the 'what if no sun' risk from the all-electric plan and is why the 120gal tank stays.",
    importance: 8, source: "user", source_ref: BOAT_NOTE_REF },
  { scope_type: "project", scope_id: BOAT_CATEGORY_ID, kind: "observation",
    content: "Tom describes Hawkswood as 'a strange teacher' — learned systems thinking from it, bonded with his sons through it, enjoyed it with Lynn, and even purchased the Gainesville house originally as a place to store the boat (which then appreciated and became the family home). The illogical thread is part of why it stays.",
    importance: 6, source: "user", source_ref: BOAT_NOTE_REF },
  { scope_type: "project", scope_id: BOAT_CATEGORY_ID, kind: "commitment",
    content: "Target end-state: Hawkswood on a mooring near Cape Canaveral, FL — floating rocket-launch-watching condo + adventure point of departure for family sailing/fishing/diving. This is the concrete v3 of the project that the conversion is working toward.",
    importance: 8, source: "user", source_ref: BOAT_NOTE_REF },

  // --- Mom & Dad scope ---
  { scope_type: "project", scope_id: MOM_DAD_CATEGORY_ID, kind: "fact",
    content: "Tom's mother passed away on 2026-02-26. The Mom & Dad project's center of gravity has shifted from joint care to Dad-focused care, asset coordination, and estate work.",
    importance: 10, source: "user", source_ref: MOM_DAD_NOTE_REF },
  { scope_type: "project", scope_id: MOM_DAD_CATEGORY_ID, kind: "fact",
    content: "Tom's dad now lives at Jasmine Point, the assisted living facility at The Village in Gainesville. Moved there from his home shortly after Mom's passing. The Village is also where Tom's in-laws live (independent living side).",
    importance: 9, source: "user", source_ref: MOM_DAD_NOTE_REF },
  { scope_type: "project", scope_id: MOM_DAD_CATEGORY_ID, kind: "fact",
    content: "Tom's dad has had three emergency room visits since the Jasmine Point transition. Currently being discharged from rehab on 2026-05-13 back to Jasmine Point — the medical situation is active, not stable yet.",
    importance: 10, source: "user", source_ref: MOM_DAD_NOTE_REF },
  { scope_type: "project", scope_id: MOM_DAD_CATEGORY_ID, kind: "commitment",
    content: "Tom is actively coordinating Dad's assets (financial / estate) and managing his medical situation. This is ongoing real work, not a discrete project — needs ongoing time + attention budget.",
    importance: 9, source: "user", source_ref: MOM_DAD_NOTE_REF },
  { scope_type: "person", scope_id: "tom-dad", kind: "relationship",
    content: "Tom's father. Recently widowed (Mom passed 2026-02-26). Now at Jasmine Point assisted living in The Village, Gainesville. Three recent ER visits, rehab discharge 2026-05-13. Tom is managing his medical care and asset coordination actively.",
    importance: 10, source: "user", source_ref: MOM_DAD_NOTE_REF },
  { scope_type: "person", scope_id: "tom-mom", kind: "relationship",
    content: "Tom's mother. Diagnosed with cancer (the diagnosis is partly what kept the family in Gainesville after 2024). Passed away 2026-02-26.",
    importance: 10, source: "user", source_ref: MOM_DAD_NOTE_REF },
  { scope_type: "person", scope_id: "in-laws", kind: "relationship",
    content: "Tom's in-laws moved from Texas to The Village at Gainesville (independent living side) to be closer to family. Same complex where Tom's dad now lives (Jasmine Point assisted-living side). Living independently, transitioning away from running their own home.",
    importance: 6, source: "user", source_ref: BOAT_NOTE_REF },
];

console.log(`Seeding ${seeds.length} memories from the 2026-05-12 interview...\n`);
let pass = 0;
let fail = 0;
for (const s of seeds) {
  try {
    const m = await writeMemory(USER_ID, s);
    pass += 1;
    console.log(
      `  ✓ ${m.id.slice(0, 8)} [${m.kind.padEnd(13)}] scope=${m.scope_type}:${(m.scope_id || "—").slice(0, 12).padEnd(13)} importance=${m.importance}  ${m.content.slice(0, 70)}…`
    );
  } catch (err) {
    fail += 1;
    console.log(`  ✗ failed:`, err.message, "—", s.content.slice(0, 50));
  }
}
console.log(`\nDone. ${pass} written, ${fail} failed.`);
