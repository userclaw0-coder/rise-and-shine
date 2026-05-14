// Seed corrective BMS memories from the 2026-05-14 ChatGPT conversation
// + Cogito44 wiring diagram (Drive file 1bMdUEKVpXt1y7K5s49nbICWh_0O8Mu_A).
// Plus supersede two outdated Grok-era memories.
//
// Run once:
//   node --env-file=.env.local scripts/seed-chatgpt-bms-may14.mjs

import { writeMemory } from "../lib/memories.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const USER_ID = "4635828b-46c0-4737-b1bb-1d3082864e33";
const BOAT = "6d0e75de-a545-484d-8f65-3dbfc52bd0be";
const NOTE_REF = "note:229201c8-516e-4134-b04e-93a8e742f823";

const seeds = [
  // 1. Cogito diagram = canonical topology
  {
    scope_type: "project", scope_id: BOAT, kind: "fact",
    content:
      "COGITO ELECTRICAL DIAGRAM.pdf (Drive file 1bMdUEKVpXt1y7K5s49nbICWh_0O8Mu_A, drawn by Alexis Bazin / Cogito44 Jan 2026) is the canonical wiring topology for Hawkswood. Specifies: HV 96V bus (8S1P pack + 2× TSM2500 + 6× HY-DH108P8-400B via MPPT), SEPARATE LV 12V bus (1S 4P 12V 552Ah = 4× U27 parallel) charged from HV via 96V→12V DC-DC, 10kW inverter from HV bus to 120VAC, U-BMS-HV speaks both CAN and RS485 Valence through safety contactor.",
    importance: 10, source: "user", source_ref: NOTE_REF,
  },

  // 2. Tom HAS the Valence software — CORRECTS the "no software access" memory
  {
    scope_type: "project", scope_id: BOAT, kind: "fact",
    content:
      "Tom HAS Valence Module Diagnostic Software Gen2 Rev 12.12 working on his machine. Screenshot (2026-05-14 ChatGPT conversation) proves it reads per-cell data on a U27-12XP module: cell voltages 3341-3342mV, 1mV spread, balance enabled, balance state inactive, no errors. The USB comm cable is correct, drivers work. CORRECTS earlier claim that 'official Valence software path is not available.' Module-level commissioning can happen via this software — NO need to invent a custom interface for that layer.",
    importance: 10, source: "user", source_ref: NOTE_REF,
  },

  // 3. U-BMS-HV role precision — modules self-balance
  {
    scope_type: "project", scope_id: BOAT, kind: "fact",
    content:
      "Cell balancing happens INSIDE each U27 module via per-module BMS, automatically at top-of-charge. Tom's screenshot showed 'Balance Status: Enabled, Balance State: Inactive' = working as designed. The U-BMS-HV is NOT for balancing — it's for pack-level OV/UV/temp protection, contactor + pre-charge control, and consolidated CAN telemetry. Don't 'program balancing' on the U-BMS-HV; that's the wrong layer.",
    importance: 9, source: "user", source_ref: NOTE_REF,
  },

  // 4. Programming path revision — primary = Valence sw → CAN sniff → dbus_ubms
  {
    scope_type: "project", scope_id: BOAT, kind: "decision",
    content:
      "REVISED BMS programming path (supersedes the Grok ESP32-first plan): (1) Module commissioning via Valence software Gen2 Rev 12.12 — works today. (2) USB-CAN sniffer on U-BMS-HV bus to capture frames before any 'programming' attempt. (3) Try dbus_ubms (Cogito44's VV250 adapter, an existing Victron Venus OS driver for Valence U-BMS) for Cerbo integration. (4) Custom ESP32 + Pylontech CAN emulation = FALLBACK only if dbus_ubms doesn't work for U-BMS-HV firmware revision. (5) ESP32 remains valuable for future ws:AI layer (MQTT, Grafana, sensors) but not gate:launch.",
    importance: 10, source: "user", source_ref: NOTE_REF,
  },

  // 5. Drivetrain math — 8S2P required for sustained full power
  {
    scope_type: "project", scope_id: BOAT, kind: "constraint",
    content:
      "24kW @ 96V = ~250A continuous propulsion draw. 8S1P U27-12XP pack = 150A continuous, 300A peak (30s). Full-power propulsion EXCEEDS 8S1P continuous rating. 8S2P upgrade (16 modules total) is REQUIRED before sustained full-power use. Until 8S2P is in place, BMS must enforce ≤150A continuous discharge limit. Reinforces existing 'size busbars + fuses for future 2P' decision.",
    importance: 9, source: "user", source_ref: NOTE_REF,
  },

  // 6. SOLAFANS root cause + fix
  {
    scope_type: "project", scope_id: BOAT, kind: "constraint",
    content:
      "Earlier 15V module observation (hurricane setup) was caused by SOLAFANS MPPT in equalize mode, NOT damaged cells. SOLAFANS SF9655A 55A MPPT must be configured: equalize OFF (critical), temp-comp OFF / 0 mV/°C, CV 115.2-116.0V. If the SOLAFANS won't truly disable equalize, avoid using it as the primary charger and rely on TSM2500s for bulk/absorb. The 1mV cell spread Tom saw on his screenshot confirms the cells are healthy.",
    importance: 9, source: "user", source_ref: NOTE_REF,
  },

  // 7. Conservative pre-launch charge settings
  {
    scope_type: "project", scope_id: BOAT, kind: "constraint",
    content:
      "Conservative initial charge settings for the 8S HV pack: Absorb/CV = 115.2-116.0V (gentler than 116.8V absolute max), Float OFF or 110-111V, Equalize OFF, Temp-comp OFF / 0 mV/°C. Use TSM2500 as trusted bulk charger for first controlled charge test — NOT SOLAFANS. After 8S string is proven stable, then configure SOLAFANS with the same settings.",
    importance: 8, source: "user", source_ref: NOTE_REF,
  },

  // 8. Cable gauge + multi-tap warning
  {
    scope_type: "project", scope_id: BOAT, kind: "constraint",
    content:
      "Cable spec for the HV pack: 2/0 AWG marine tinned copper (105°C insulation) for short module-to-module series jumpers (<12-18 in). 4/0 AWG marine tinned for main pack +/- runs to Class-T fuse / contactor / inverter. SINGLE positive and SINGLE negative takeoff at the pack ends — NO multi-point taps in a series string. Multi-point taps create dangerous bypass paths around modules, unequal current sharing, and weird fault modes. Current is identical through every module in series; 'back-up' prevention is by module top-balance, not by wiring tricks. (When eventually going 8S2P with parallel strings, use a proper combiner busbar with equal-length feeders, each string fused.)",
    importance: 9, source: "user", source_ref: NOTE_REF,
  },

  // 9. Module top-balance procedure detail
  {
    scope_type: "project", scope_id: BOAT, kind: "constraint",
    content:
      "Module top-balance procedure (gate:launch): For each U27 module individually, charge to 14.4-14.6V CV with TSM2500 (or trusted bench charger), rest 1-2 hours, then use Valence software to confirm cell spread <10mV, no high-voltage flags, balance enabled. Record per-module V, SOC, cell-spread, alarms. Repeat for all 8 HV + all 4 LV modules. Assign Module IDs (Tom confirms he'll have to set IDs manually — module-level RS485 with manual assignment, not auto-enumeration over CAN). After all 12 modules pass, assemble 8S HV string + 1S4P LV bank and verify daisy-chained comm cable enumerates all modules.",
    importance: 10, source: "user", source_ref: NOTE_REF,
  },

  // 10. 96V→12V DC-DC is PRIMARY charge path, not redundancy
  {
    scope_type: "project", scope_id: BOAT, kind: "constraint",
    content:
      "The 96V→12V DC-DC step-down converter is the PRIMARY charge path for the LV 12V bank per the Cogito diagram, NOT an emergency redundancy as previously framed. Promote to gate:launch — order now, not next_30d. Renogy 40A DC-DC charger on hand is the alternator-side path (separate); still need the HV→LV step-down (15A target).",
    importance: 9, source: "user", source_ref: NOTE_REF,
  },

  // 11. Cogito44 = Alexis Bazin, this is HIS diagram for Hawkswood
  {
    scope_type: "project", scope_id: BOAT, kind: "fact",
    content:
      "Cogito44 = Alexis Bazin (cogito44.free.fr). He drew the canonical electrical diagram for Hawkswood in Jan 2026. He also built the VV250 adapter that bridges Valence U-BMS to Victron GX — referenced by the Victron community and the dbus_ubms project. This makes him a high-trust reference for both wiring AND BMS integration; his free.fr dropbox + GitHub are worth validating as the primary information source, not just one of several.",
    importance: 8, source: "user", source_ref: NOTE_REF,
  },
];

console.log(`Seeding ${seeds.length} ChatGPT-derived BMS memories...\n`);
let pass = 0, fail = 0;
const writtenIds = {};
for (const [i, s] of seeds.entries()) {
  try {
    const m = await writeMemory(USER_ID, s);
    pass++;
    writtenIds[i] = m.id;
    console.log(`  ✓ ${m.id.slice(0,8)} [${m.kind.padEnd(11)}] imp=${m.importance} ${m.content.slice(0,70)}…`);
  } catch (err) {
    fail++;
    console.log(`  ✗ failed:`, err.message);
  }
}
console.log(`\n${pass}/${seeds.length} memories written.\n`);

// ─────────────────────────────────────────────────────────────────
// Supersede outdated Grok-era memories.
// ─────────────────────────────────────────────────────────────────
async function findOldMemoryByContent(snippet) {
  const { data } = await supabase
    .from("memories")
    .select("id, content")
    .eq("user_id", USER_ID)
    .eq("scope_type", "project")
    .eq("scope_id", BOAT)
    .ilike("content", `%${snippet}%`)
    .is("archived_at", null)
    .is("superseded_by", null)
    .limit(2);
  return data || [];
}

async function supersede(oldId, newId) {
  const { error } = await supabase
    .from("memories")
    .update({ superseded_by: newId })
    .eq("id", oldId)
    .eq("user_id", USER_ID);
  if (error) throw error;
}

console.log("Superseding outdated Grok-era memories...");
const supersessions = [
  // The "no Valence software access" claim → superseded by new fact #2 (writtenIds[1])
  { snippet: "Valence Configuration & Monitoring Tool v12.12 path is not available to Tom", newIdx: 1 },
  // The "ESP32 + Cogito44 RS485 frames is the primary programming approach" → superseded by new decision #4 (writtenIds[3])
  { snippet: "Programming approach: custom ESP32-based BMS controller, NOT the official Valence software", newIdx: 3 },
  // The "Pylontech CAN emulation is gate:launch" framing → superseded by decision #4 (writtenIds[3])
  { snippet: "Integration target: Victron Cerbo GX as the system bus. ESP32 emulates Pylontech CAN", newIdx: 3 },
];

for (const ss of supersessions) {
  const hits = await findOldMemoryByContent(ss.snippet);
  if (hits.length === 0) {
    console.log(`  ⓘ no match for: ${ss.snippet.slice(0, 60)}…`);
    continue;
  }
  for (const h of hits) {
    try {
      await supersede(h.id, writtenIds[ss.newIdx]);
      console.log(`  ⇄ ${h.id.slice(0, 8)} superseded by ${writtenIds[ss.newIdx]?.slice(0, 8)}`);
    } catch (err) {
      console.log(`  ✗ failed to supersede ${h.id.slice(0, 8)}: ${err.message}`);
    }
  }
}

console.log(`\nDone.`);
