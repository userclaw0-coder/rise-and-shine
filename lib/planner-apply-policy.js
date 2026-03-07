export function parseBooleanEnv(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

export function isPlannerApplyRpcRequired(env = process.env) {
  const isProduction = env.NODE_ENV === "production";
  const explicit = parseBooleanEnv(env.PLANNER_APPLY_RPC_REQUIRED);

  // Never allow production to silently downgrade to rollback fallback writes.
  // Atomic RPC is mandatory in production regardless of explicit env overrides.
  if (isProduction) return true;

  if (explicit !== null) return explicit;
  return false;
}
