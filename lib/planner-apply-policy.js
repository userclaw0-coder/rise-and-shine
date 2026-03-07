export function parseBooleanEnv(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

export function isProductionLikeRuntime(env = process.env) {
  if (!env || typeof env !== "object") return false;

  const nodeEnv = String(env.NODE_ENV || "").toLowerCase();
  const vercelEnv = String(env.VERCEL_ENV || "").toLowerCase();

  if (nodeEnv === "production") return true;

  // Preview deployments are production-like runtimes where fallback writes
  // should also stay disabled.
  if (["production", "preview"].includes(vercelEnv)) return true;

  return false;
}

export function isPlannerApplyRpcRequired(env = process.env) {
  const productionLike = isProductionLikeRuntime(env);
  const explicit = parseBooleanEnv(env.PLANNER_APPLY_RPC_REQUIRED);

  // Never allow production-like runtimes to silently downgrade to rollback
  // fallback writes. Atomic RPC is mandatory regardless of explicit overrides.
  if (productionLike) return true;

  if (explicit !== null) return explicit;
  return false;
}
