export function parseBooleanEnv(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

export function isPlannerApplyRpcRequired(env = process.env) {
  const explicit = parseBooleanEnv(env.PLANNER_APPLY_RPC_REQUIRED);
  if (explicit !== null) return explicit;

  return env.NODE_ENV === "production";
}
