// One-shot: seed Hawkswood memories from the 2008 yacht survey + USCG docs
// into the warm-tier memory store. Run once via:
//   node --env-file=.env.local scripts/seed-boat-memories.mjs

import { writeMemory } from "../lib/memories.js";

const USER_ID = "4635828b-46c0-4737-b1bb-1d3082864e33";
const BOAT_CATEGORY_ID = "6d0e75de-a545-484d-8f65-3dbfc52bd0be";

const seeds = [
  {
    scope_type: "person",
    scope_id: "thomas-broadfoot",
    kind: "relationship",
    content:
      "Thomas Broadfoot of Middle Sound, Wilmington NC was the previous owner of S/V Hawkswood; sold the boat around 2008.",
    importance: 5,
    confidence: 0.95,
    source: "document",
    source_ref: "drive:Survey-Hawkswood.pdf",
  },
  {
    scope_type: "person",
    scope_id: "john-kelly-nams",
    kind: "relationship",
    content:
      "John P. Kelly NAMS-CMS at 1435 Villa Place East, Wilmington NC 28409, phone (910) 543-0047, www.AYachtsurveyor.com — performed the 2008 buyer's survey on Hawkswood; useful contact if a re-survey is ever needed.",
    importance: 4,
    confidence: 0.95,
    source: "document",
    source_ref: "drive:Survey-Hawkswood.pdf",
  },
  {
    scope_type: "project",
    scope_id: BOAT_CATEGORY_ID,
    kind: "fact",
    content:
      "Hawkswood is a 42-ft one-off auxiliary sailing ketch, built 1975 by True Boatyard (Amesbury MA), hull MSZG00100175, USCG Doc # 565272 (NET 16 tons). Honduran mahogany planking on white oak ribs, multi-layer epoxy + fiberglass sheathing.",
    importance: 8,
    confidence: 1.0,
    source: "document",
    source_ref: "drive:Survey-Hawkswood.pdf",
  },
  {
    scope_type: "project",
    scope_id: BOAT_CATEGORY_ID,
    kind: "fact",
    content:
      "Original propulsion being replaced by the 96V electric conversion: Perkins 4-236, 72hp diesel, S/N 4707313, with Paragon 200 2:1 transmission and 19-inch 3-blade bronze prop on a 1-3/8 inch stainless shaft. The Perkins-era survey recommendations 7-11, 17, 20 (battery hold-downs, AC wire connectors, cooling elbow, raw water filter, tachometer) are largely superseded by the conversion.",
    importance: 7,
    confidence: 0.95,
    source: "document",
    source_ref: "drive:Survey-Hawkswood.pdf",
  },
  {
    scope_type: "project",
    scope_id: BOAT_CATEGORY_ID,
    kind: "constraint",
    content:
      "The 2008 survey flagged the cutlass bearing for replacement at next haulout — same item still appears as an open task in 2026, 18 years later. Worth prioritizing while the boat is on the hard.",
    importance: 8,
    confidence: 0.9,
    source: "document",
    source_ref: "drive:Survey-Hawkswood.pdf",
  },
  {
    scope_type: "project",
    scope_id: BOAT_CATEGORY_ID,
    kind: "constraint",
    content:
      "Forward head is non-conforming for overboard discharge per the 2008 survey (rec A); needs either permanent block of MSD discharge OR install a holding tank with Y-valve, lockable seacock, and deck pump-out before commissioning offshore.",
    importance: 7,
    confidence: 0.95,
    source: "document",
    source_ref: "drive:Survey-Hawkswood.pdf",
  },
  {
    scope_type: "project",
    scope_id: BOAT_CATEGORY_ID,
    kind: "constraint",
    content:
      "Aft starboard chainplate shackle on the mizzen is unsafetied per 2008 survey rec #13 — a small but real rigging safety item. Verify status before next sailing.",
    importance: 6,
    confidence: 0.9,
    source: "document",
    source_ref: "drive:Survey-Hawkswood.pdf",
  },
  {
    scope_type: "project",
    scope_id: BOAT_CATEGORY_ID,
    kind: "observation",
    content:
      "2008 NAMS-CMS survey valued Hawkswood at $45,500 market / $186,875 replacement and classed 'above average condition' (BUC International). Useful baseline for insurance discussions and any future re-survey.",
    importance: 5,
    confidence: 0.9,
    source: "document",
    source_ref: "drive:Survey-Hawkswood.pdf",
  },
];

console.log(`Seeding ${seeds.length} Hawkswood memories...`);
const results = [];
for (const s of seeds) {
  try {
    const m = await writeMemory(USER_ID, s);
    results.push(m);
    console.log(`  ✓ ${m.id.slice(0, 8)}  [${m.kind}, importance ${m.importance}]  ${m.content.slice(0, 70)}…`);
  } catch (err) {
    console.log(`  ✗ failed:`, err.message);
  }
}
console.log(`\nDone. Wrote ${results.length}/${seeds.length}.`);
