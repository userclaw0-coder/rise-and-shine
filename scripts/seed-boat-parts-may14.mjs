// Seed Hawkswood parts inventory from the 2026-05-13 garage walk.
// Source note: 631de7d6-33ff-4e28-ab7c-888628dd1891
// Run once:
//   node --env-file=.env.local scripts/seed-boat-parts-may14.mjs

import { addPart } from "../lib/projectParts.js";

const USER_ID = "4635828b-46c0-4737-b1bb-1d3082864e33";
const BOAT = "6d0e75de-a545-484d-8f65-3dbfc52bd0be";
const NOTE_REF = "note:631de7d6-33ff-4e28-ab7c-888628dd1891";

const seeds = [
  // --- HV battery pack ---
  {
    name: "Valence U27-12XP (HV pack module)",
    part_number: "U27-12XP",
    manufacturer: "Valence Technology",
    qty: 8,
    status: "on_hand",
    location: "@home",
    workstream: "EL",
    spec: {
      nominal_v: 12,
      capacity_ah: 138,
      chemistry: "LiFeMgPO4",
      cells_per_module: 4,
      hvc_per_cell_v: 3.65,
      lvc_per_cell_v: 2.5,
      role: "HV pack 8S1P @ ~96V nominal, ~14.1 kWh",
    },
    notes:
      "Pre-launch: top-balance each module individually to 14.60V before series wiring. Avoids Module Lost alarms.",
    source_ref: NOTE_REF,
  },
  {
    name: "Valence U-BMS-HV",
    part_number: "1004440",
    manufacturer: "Valence Technology",
    qty: 1,
    status: "on_hand",
    location: "@home",
    workstream: "EL",
    spec: {
      interface: ["RS485", "CAN"],
      baud: 115200,
      role: "HV pack BMS — hardware safety layer (drives contactor on OV/UV/temp)",
      programming_path:
        "Custom ESP32 + Cogito44 RS485 frames (no Valence software access)",
    },
    notes:
      "Cogito44 reversed RS485 frames; seb303/Arduino-XP-BMS is the open code ref.",
    source_ref: NOTE_REF,
  },

  // --- LV bank (separate parallel) ---
  {
    name: "Valence U27-12XP (LV house bank module)",
    part_number: "U27-12XP",
    manufacturer: "Valence Technology",
    qty: 4,
    status: "on_hand",
    location: "@home",
    workstream: "EL",
    spec: {
      nominal_v: 12,
      capacity_ah: 138,
      chemistry: "LiFeMgPO4",
      role: "LV house bank 4P @ 12V, separate from HV propulsion pack",
    },
    notes:
      "Wired in parallel for 12V house loads. Full electrical isolation from HV pack.",
    source_ref: NOTE_REF,
  },
  {
    name: "Renogy 40A DC-DC charger",
    manufacturer: "Renogy",
    qty: 1,
    status: "on_hand",
    location: "@home",
    workstream: "EL",
    spec: { amps: 40, role: "Charges 12V LV bank from alternator/generator side" },
    source_ref: NOTE_REF,
  },
  {
    name: "96V→12V 15A DC-DC step-down (TO BUY)",
    qty: 0,
    status: "planned",
    location: "@home",
    workstream: "EL",
    spec: { input_v: 96, output_v: 12, amps: 15 },
    notes:
      "Emergency path: powers 12V loads from HV pack if LV bank is depleted. Linked task: 68588e72-5b2e-4f18-b66c-b6b27eec9661.",
    source_ref: NOTE_REF,
  },

  // --- Motor kit (assembled + tested) ---
  {
    name: "ME1616 PMAC motor",
    manufacturer: "Motenergy",
    qty: 1,
    status: "on_hand",
    location: "@home",
    workstream: "EL",
    spec: { kw_continuous: 24, type: "PMAC", role: "Propulsion motor" },
    notes:
      "Part of the 24kW Sevcon electric drive kit. Bench-assembled and proven working.",
    source_ref: NOTE_REF,
  },
  {
    name: "Sevcon G8055 motor controller",
    part_number: "G8055",
    manufacturer: "Sevcon",
    qty: 1,
    status: "on_hand",
    location: "@home",
    workstream: "EL",
    spec: { role: "PMAC motor controller", inrush_handling: "Requires pre-charge resistor" },
    notes: "Pre-charge: 100Ω 100W wirewound + NO relay + 2s delay before main contactor.",
    source_ref: NOTE_REF,
  },
  {
    name: "Sevcon 827 display",
    part_number: "827",
    manufacturer: "Sevcon",
    qty: 1,
    status: "on_hand",
    location: "@home",
    workstream: "EL",
    spec: { soc_input: "0-5V analog from U-BMS Connector B pin 2" },
    source_ref: NOTE_REF,
  },
  {
    name: "EVCC-Basic interface",
    manufacturer: "Thunderstruck Motors",
    qty: 1,
    status: "on_hand",
    location: "@home",
    workstream: "EL",
    spec: { role: "EV charge controller / interface board" },
    source_ref: NOTE_REF,
  },
  {
    name: "Curtis ET-134 foot throttle",
    part_number: "ET-134",
    manufacturer: "Curtis",
    qty: 1,
    status: "on_hand",
    location: "@home",
    workstream: "EL",
    spec: { type: "foot pedal throttle, hall-effect" },
    source_ref: NOTE_REF,
  },

  // --- Charging ---
  {
    name: "TSM2500 HV charger",
    part_number: "TSM2500",
    qty: 2,
    status: "on_hand",
    location: "@home",
    workstream: "EL",
    spec: { role: "HV pack charger off shore power or generator AC output" },
    source_ref: NOTE_REF,
  },

  // --- Generator ---
  {
    name: "Kohler 4EOZ marine genset",
    part_number: "4EOZ",
    manufacturer: "Kohler",
    qty: 1,
    status: "on_hand",
    location: "@home",
    workstream: "EL",
    spec: {
      kw: 3.5,
      fuel: "diesel",
      role: "Backup charging + emergency propulsion @ ~3-4kt on generator alone",
      fuel_tank_gal: 100,
    },
    notes: "Corrects earlier '4kW' planning memory.",
    source_ref: NOTE_REF,
  },

  // --- Solar primary ---
  {
    name: "Hyperion HY-DH108P8-400B (bifacial)",
    part_number: "HY-DH108P8-400B",
    manufacturer: "Hyperion",
    qty: 6,
    status: "on_hand",
    location: "@home",
    workstream: "EL",
    spec: { wattage_w: 400, type: "bifacial", array_w_total: 2400 },
    notes: "Bifacial picks up reflected light off water — well-matched to on-water deployment.",
    source_ref: NOTE_REF,
  },
  {
    name: "SOLAFANS SF9655A MPPT controller",
    part_number: "SF9655A",
    manufacturer: "SOLAFANS",
    qty: 1,
    status: "on_hand",
    location: "@home",
    workstream: "EL",
    spec: { amps: 55, type: "MPPT" },
    source_ref: NOTE_REF,
  },

  // --- Solar secondary (planned) ---
  {
    name: "Inflatable raft solar array (planned)",
    qty: 6,
    status: "planned",
    location: "@home",
    workstream: "EL",
    spec: {
      panel_w: 150,
      panel_type: "CIGS flexible",
      array_w_total: 900,
      deployment: "inflatable raft / floating, packs away under way",
    },
    notes: "v2 addition after boat is in the water. Not gate:launch.",
    source_ref: NOTE_REF,
  },

  // --- Inverter ---
  {
    name: "10kW inverter",
    qty: 1,
    status: "on_hand",
    location: "@home",
    workstream: "EL",
    spec: { kw: 10, role: "AC house loads off 12V LV bank" },
    source_ref: NOTE_REF,
  },

  // --- AC (unknown status) ---
  {
    name: "Marine AC system (pulled from another boat)",
    qty: 1,
    status: "on_hand",
    location: "@home",
    workstream: "CO",
    spec: { condition: "unverified — refrigerant/compressor/evaporator status unknown" },
    notes: "Plan to install if functional; otherwise harvest fittings + ductwork.",
    source_ref: NOTE_REF,
  },

  // --- Gear reduction ---
  {
    name: "Gear reduction unit",
    qty: 1,
    status: "on_hand",
    location: "@home",
    workstream: "EL",
    spec: { ratio_open: "2:1 vs 1.75:1 — needs bench confirmation" },
    notes:
      "Open question: inventory dump describes both ratios. Confirm by counting input vs output revs before prop selection.",
    source_ref: NOTE_REF,
  },
];

console.log(`Seeding ${seeds.length} boat parts from 2026-05-13 garage walk...\n`);
let pass = 0;
let fail = 0;
for (const p of seeds) {
  try {
    const row = await addPart(USER_ID, { category_id: BOAT, ...p });
    pass++;
    console.log(
      `  ✓ ${row.id.slice(0, 8)} [${row.status.padEnd(9)}] ${row.qty}× ${row.name.slice(0, 50)}`
    );
  } catch (err) {
    fail++;
    console.log(`  ✗ failed:`, err.message, "—", p.name);
  }
}
console.log(`\nDone. ${pass}/${seeds.length} parts logged.`);
