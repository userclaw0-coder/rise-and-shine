// Record Tom's 2026-05-14 launch-gate principle decision:
// "All electric motor + BMS work is gate:launch — full stop."
// Run once:
//   node --env-file=.env.local scripts/seed-launch-principle-may14.mjs

import { writeMemory } from "../lib/memories.js";

const USER_ID = "4635828b-46c0-4737-b1bb-1d3082864e33";
const BOAT = "6d0e75de-a545-484d-8f65-3dbfc52bd0be";

const m = await writeMemory(USER_ID, {
  scope_type: "project",
  scope_id: BOAT,
  kind: "decision",
  content:
    "LAUNCH-GATE PRINCIPLE for Hawkswood (Tom 2026-05-14): ALL electric motor + battery/BMS work is gate:launch. Reasoning: 'I can't put it in the water until the motor is working full stop, and it's not working without the battery system.' Practically: every open ws:EL task on the boat that contributes to motor operation OR HV/LV battery delivery is gate:launch by default. Borderline 'monitoring + telemetry' tasks (VRM portal config, Cerbo purchase, Thunderstruck CAN dongle, ESP32 fallback BMS controller, battery monitor dashboard) were also tagged gate:launch on Tom's instruction, but are candidates to untag if Tom decides remote-monitoring isn't a launch blocker. Implementation 2026-05-14: bulk-applied gate:launch to 24 previously-ungated ws:EL tasks; total ws:EL gate:launch count now 42/42. NOT gate:launch (by exclusion): ws:CH (chainplates done in 2024), ws:LR/HU/SR/CO unless individually flagged, ws:AI work entirely.",
  importance: 10,
  source: "user",
});
console.log("✓", m.id, "imp", m.importance);
