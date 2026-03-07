import assert from "node:assert/strict";
import { isPlannerApplyRpcRequired, parseBooleanEnv } from "../lib/planner-apply-policy.js";

assert.equal(parseBooleanEnv("true"), true);
assert.equal(parseBooleanEnv("0"), false);
assert.equal(parseBooleanEnv("maybe"), null);

assert.equal(isPlannerApplyRpcRequired({ NODE_ENV: "production" }), true);
assert.equal(isPlannerApplyRpcRequired({ NODE_ENV: "development" }), false);
assert.equal(
  isPlannerApplyRpcRequired({ NODE_ENV: "development", PLANNER_APPLY_RPC_REQUIRED: "true" }),
  true
);
assert.equal(
  isPlannerApplyRpcRequired({ NODE_ENV: "production", PLANNER_APPLY_RPC_REQUIRED: "false" }),
  true
);

console.log("verify-planner-policy: OK");
