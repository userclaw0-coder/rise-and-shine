// Seed 10 memories from the Grok 4.2 BMS programming conversation.
// Run once:
//   node --env-file=.env.local scripts/seed-bms-memories-may13.mjs

import { writeMemory } from "../lib/memories.js";

const USER_ID = "4635828b-46c0-4737-b1bb-1d3082864e33";
const BOAT = "6d0e75de-a545-484d-8f65-3dbfc52bd0be";
const NOTE_REF = "note:1fb7578a-854b-468c-b62a-66eb145e34cc";

const seeds = [
  {
    scope_type: "project", scope_id: BOAT, kind: "fact",
    content:
      "Pack: 8× Valence U27-12XP in 8S1P, ~138 Ah, ~14.1 kWh nominal, LiFeMgPO4 chemistry. Pack voltages: 96V nom / 102.4V rest / 116.8V max / 80V min. Each module has 4 cells (per-cell HVC 3.65V, LVC 2.50V).",
    importance: 10, source: "user", source_ref: NOTE_REF,
  },
  {
    scope_type: "project", scope_id: BOAT, kind: "fact",
    content:
      "BMS: Valence U-BMS-HV, part number 1004440. Programming interface: RS485 (or CAN), 115200 baud. Cogito44 reversed the RS485 frame structure (free.fr dropbox + GitHub); seb303/Arduino-XP-BMS is the open code reference. The official Valence Configuration & Monitoring Tool v12.12 path is not available to Tom (no software access).",
    importance: 9, source: "user", source_ref: NOTE_REF,
  },
  {
    scope_type: "project", scope_id: BOAT, kind: "fact",
    content:
      "Existing drivetrain hardware identified in the Grok conversation: Sevcon G8055 motor controller, ME1616 motor, TSM2500 chargers, 827 display (takes 0–5V analog SOC input from U-BMS Connector B pin 2).",
    importance: 8, source: "user", source_ref: NOTE_REF,
  },
  {
    scope_type: "project", scope_id: BOAT, kind: "decision",
    content:
      "Programming approach: custom ESP32-based BMS controller, NOT the official Valence software (no access to it). Rationale: ESP32 + Cogito44 RS485 frames + seb303/Arduino-XP-BMS reference is more flexible AND directly Cerbo/VRM-ready. U-BMS-HV stays in the loop as a hardware backup safety layer (still drives C3 on OV/UV/temp).",
    importance: 9, source: "user", source_ref: NOTE_REF,
  },
  {
    scope_type: "project", scope_id: BOAT, kind: "decision",
    content:
      "Integration target: Victron Cerbo GX as the system bus. ESP32 emulates Pylontech CAN frames 0x351/0x355/0x356 over BMS-CAN at 500 kbps (twisted pair + 120Ω terminator at Cerbo end). VRM portal handles phone/web remote monitoring via Starlink/4G. Cerbo not yet purchased (~$300–400). MQTT publish from ESP32 reserved for future custom AI behaviors / Grafana but not required for remote monitoring (Cerbo+VRM handles that natively).",
    importance: 9, source: "user", source_ref: NOTE_REF,
  },
  {
    scope_type: "project", scope_id: BOAT, kind: "decision",
    content:
      "Pack busbars + fuses sized for FUTURE 2P8S upgrade (16 modules at 96V). 1/0 AWG marine busbars with extra lugs, 400A Class-T fuse per string. ESP32 second RS485 UART reserved (UART1) for the second module chain. Path to doubling capacity = bolt second string + second fuse to existing busbars + uncomment 2-bank section in sketch. Zero rewiring at the BMS layer.",
    importance: 8, source: "user", source_ref: NOTE_REF,
  },
  {
    scope_type: "project", scope_id: BOAT, kind: "constraint",
    content:
      "Pre-launch prep step: top-balance each U27-12XP individually to 14.60V BEFORE series wiring. Required to avoid Module Lost alarms. Multi-day operation with one bench charger (one module at a time). This is gate:launch — pack won't operate reliably without it.",
    importance: 10, source: "user", source_ref: NOTE_REF,
  },
  {
    scope_type: "project", scope_id: BOAT, kind: "constraint",
    content:
      "Pre-charge circuit required for Sevcon G8055 inrush: 100Ω 100W wirewound resistor in series via NO relay, 2-second delay before main contactor closes. Sketch handles the sequence: pre-charge relay HIGH → 2000ms → main relay HIGH → 500ms → pre-charge relay LOW.",
    importance: 8, source: "user", source_ref: NOTE_REF,
  },
  {
    scope_type: "project", scope_id: BOAT, kind: "observation",
    content:
      "Grok's Arduino sketch has STUB CAN frame functions — sendCAN351, sendCAN355, sendCAN356 are empty `{ /* ... */ }`. Grok claimed the full versions are 'in the project folder' but no such folder exists in Tom's possession. Implementing the Pylontech-compatible CAN frames is ~half a day of work matching Victron's expected frame format, and is gate:launch (Cerbo won't display the pack without working CAN). Similarly, the Cogito44 wake frame bytes {0x00,0x00,0x01,0x01,0xC0,0x74,0x0D,0x0A} were cited but not verified against the specific U27 module firmware revision — first setup_ids run might require frame adjustment.",
    importance: 8, source: "user", source_ref: NOTE_REF,
  },
  {
    scope_type: "project", scope_id: BOAT, kind: "decision",
    content:
      "Workstream architecture note: BMS commissioning tasks are all tagged ws:EL for now (single-workstream coherence — get the boat moving electrically). However the Cerbo + VRM + MQTT + future AI behaviors slice of the work is conceptually closer to ws:AI (boat intelligence). When the AI workstream grows beyond stubs, the Cerbo/MQTT/Grafana pieces can be re-tagged or split out. A cleaner long-term split is: ws:EL = BMS hardware + safety control loop (must be reliable); ws:AI = Cerbo + VRM + MQTT + behavioral rules (can iterate without risking safety). For now, keeping it simple under ws:EL — revisit at the next Reorient.",
    importance: 6, source: "user", source_ref: NOTE_REF,
  },
];

console.log(`Seeding ${seeds.length} BMS memories from Grok 4.2 conversation...\n`);
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
