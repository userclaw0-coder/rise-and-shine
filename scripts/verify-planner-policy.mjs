import assert from "node:assert/strict";
import {
  isPlannerApplyRpcRequired,
  isProductionLikeRuntime,
  parseBooleanEnv,
} from "../lib/planner-apply-policy.js";

assert.equal(parseBooleanEnv("true"), true);
assert.equal(parseBooleanEnv("0"), false);
assert.equal(parseBooleanEnv("maybe"), null);

assert.equal(isProductionLikeRuntime({ NODE_ENV: "production" }), true);
assert.equal(isProductionLikeRuntime({ VERCEL_ENV: "production" }), true);
assert.equal(isProductionLikeRuntime({ VERCEL_ENV: "preview" }), true);
assert.equal(isProductionLikeRuntime({ NODE_ENV: "development", VERCEL_ENV: "development" }), false);

assert.equal(isPlannerApplyRpcRequired({ NODE_ENV: "production" }), true);
assert.equal(isPlannerApplyRpcRequired({ VERCEL_ENV: "preview" }), true);
assert.equal(isPlannerApplyRpcRequired({ NODE_ENV: "development" }), false);
assert.equal(
  isPlannerApplyRpcRequired({ NODE_ENV: "development", PLANNER_APPLY_RPC_REQUIRED: "true" }),
  true
);
assert.equal(
  isPlannerApplyRpcRequired({ NODE_ENV: "production", PLANNER_APPLY_RPC_REQUIRED: "false" }),
  true
);
assert.equal(
  isPlannerApplyRpcRequired({ VERCEL_ENV: "preview", PLANNER_APPLY_RPC_REQUIRED: "false" }),
  true
);

console.log("verify-planner-policy: OK");
