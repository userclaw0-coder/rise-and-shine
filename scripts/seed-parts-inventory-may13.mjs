// Seed parts inventory memories from the 2026-05-13 garage walk-through.
// All parts are physically @home in Gainesville, ready for bench prep.
// Run once:
//   node --env-file=.env.local scripts/seed-parts-inventory-may13.mjs

import { writeMemory } from "../lib/memories.js";

const USER_ID = "4635828b-46c0-4737-b1bb-1d3082864e33";
const BOAT = "6d0e75de-a545-484d-8f65-3dbfc52bd0be";
const NOTE_REF = "note:631de7d6-33ff-4e28-ab7c-888628dd1891";

const seeds = [
  // --- LV architecture: separate parallel bank (NEW DECISION, not in earlier memories) ---
  {
    scope_type: "project", scope_id: BOAT, kind: "decision",
    content:
      "LV (12V) system uses a SEPARATE bank of 4× Valence U27-12XP wired in parallel — NOT a DC-DC tap off the 96V HV pack. Rationale: full electrical isolation between propulsion and house loads, simpler safety story, redundancy if HV pack is offline. Charging: Renogy 40A DC-DC charger from the diesel generator or alternator side. This supersedes any earlier assumption of single-bank 96V with step-down.",
    importance: 9, source: "user", source_ref: NOTE_REF,
  },

  // --- HV inventory confirmation (refines existing BMS memory with @home location) ---
  {
    scope_type: "project", scope_id: BOAT, kind: "fact",
    content:
      "All 8× Valence U27-12XP HV modules are physically @home in Gainesville (not at the boat). Pre-launch top-balance to 14.60V per module can happen on the bench at home before transporting the pack to GCS. This makes the 'one bench charger, multi-day balance' task an @home job, not @workyard.",
    importance: 8, source: "user", source_ref: NOTE_REF,
  },

  // --- Motor kit: assembled AND tested, big news ---
  {
    scope_type: "project", scope_id: BOAT, kind: "fact",
    content:
      "24kW Sevcon electric motor kit is assembled @home and bench-tested working: ME1616 motor + Sevcon G8055 controller + 827 display + cooling loop + EVCC-Basic + Curtis ET-134 foot throttle. This is a major de-risk — the propulsion subsystem is proven before install. Remaining motor-side work is install + integration, not 'will it run'.",
    importance: 9, source: "user", source_ref: NOTE_REF,
  },

  // --- Generator: CORRECTION (was 4kW, actual is 3.5kW Kohler 4EOZ) ---
  {
    scope_type: "project", scope_id: BOAT, kind: "fact",
    content:
      "Diesel generator on hand: Kohler 4EOZ, 3.5kW marine genset. CORRECTS earlier 'add a 4kW diesel generator' planning memory — the unit is already procured at 3.5kW. Pairs with 2× TSM2500 chargers (also on hand) for the HV pack and 100 gal diesel tank stays for ~3-4kt range on generator alone.",
    importance: 8, source: "user", source_ref: NOTE_REF,
  },

  // --- Solar primary array ---
  {
    scope_type: "project", scope_id: BOAT, kind: "fact",
    content:
      "Primary solar array @home: 6× Hyperion HY-DH108P8-400B bifacial panels, 400W each (2.4 kW nameplate). Paired with SOLAFANS SF9655A 55A MPPT charge controller. Bifacial picks up reflected light off water — well-matched to the on-water deployment.",
    importance: 8, source: "user", source_ref: NOTE_REF,
  },

  // --- Solar secondary (planned, not in hand) ---
  {
    scope_type: "project", scope_id: BOAT, kind: "decision",
    content:
      "Planned secondary solar: inflatable raft / floating array with 6× 150W flexible CIGS panels (~900W) and a matching MPPT. Deploys when anchored, packs away under way. Not yet purchased — this is a v2 addition after the boat is in the water, not gate:launch.",
    importance: 6, source: "user", source_ref: NOTE_REF,
  },

  // --- Inverter ---
  {
    scope_type: "project", scope_id: BOAT, kind: "fact",
    content:
      "10kW inverter on hand @home for AC house loads off the 12V house bank (via the 4× U27 parallel LV bank). Sized for galley appliances + power tools at anchor.",
    importance: 7, source: "user", source_ref: NOTE_REF,
  },

  // --- TSM2500 chargers already on hand ---
  {
    scope_type: "project", scope_id: BOAT, kind: "fact",
    content:
      "2× TSM2500 chargers on hand @home. These are the HV-side chargers that run off either shore power or the Kohler 4EOZ generator output to charge the 96V pack. No additional charging hardware needed for HV.",
    importance: 7, source: "user", source_ref: NOTE_REF,
  },

  // --- AC system pulled from donor boat ---
  {
    scope_type: "project", scope_id: BOAT, kind: "observation",
    content:
      "Marine AC system on hand @home — pulled from another boat. Status (refrigerant charge, compressor condition, evaporator condition) not yet verified. Plan to install if functional; otherwise it's a source of fittings and ductwork for a new unit.",
    importance: 6, source: "user", source_ref: NOTE_REF,
  },

  // --- Gear reduction ambiguity ---
  {
    scope_type: "project", scope_id: BOAT, kind: "observation",
    content:
      "Open question: gear reduction ratio is described as both '2:1' and '1.75:1 standard' in the inventory dump. Need to confirm the actual ratio of the on-hand reduction unit before propeller selection — this affects the prop pitch/diameter math. Bench measurement task: count input vs output revolutions.",
    importance: 5, source: "user", source_ref: NOTE_REF,
  },

  // --- The one missing part ---
  {
    scope_type: "project", scope_id: BOAT, kind: "constraint",
    content:
      "Only explicitly missing electrical part identified in the 2026-05-13 inventory walk: 96V→12V 15A DC-DC step-down converter. Needed to power any 12V loads directly off the HV pack when the separate LV bank is depleted (emergency / redundancy path). Not gate:launch but a real gap to close before extended cruising.",
    importance: 7, source: "user", source_ref: NOTE_REF,
  },

  // --- @home prep narrative anchor ---
  {
    scope_type: "project", scope_id: BOAT, kind: "fact",
    content:
      "ALL major electrical components are physically @home in Gainesville, not at the boat: 8× HV U27 modules, 4× LV U27 modules, U-BMS-HV, Sevcon motor kit (assembled+tested), Kohler 4EOZ generator, 2× TSM2500 chargers, 6× Hyperion solar + MPPT, 10kW inverter, Renogy DC-DC, AC system, gear reduction. Means bench prep / programming / dry-fit can happen on the home workbench. Only @workyard / @longterm work is the physical install on Hawkswood.",
    importance: 9, source: "user", source_ref: NOTE_REF,
  },
];

console.log(`Seeding ${seeds.length} parts inventory memories from 2026-05-13 garage walk...\n`);
let pass = 0, fail = 0;
for (const s of seeds) {
  try {
    const m = await writeMemory(USER_ID, s);
    pass++;
    console.log(`  ✓ ${m.id.slice(0,8)} [${m.kind.padEnd(11)}] imp=${m.importance} ${m.content.slice(0,70)}…`);
  } catch (err) {
    fail++;
    console.log(`  ✗ failed:`, err.message);
  }
}
console.log(`\nDone. ${pass}/${seeds.length} written.`);
