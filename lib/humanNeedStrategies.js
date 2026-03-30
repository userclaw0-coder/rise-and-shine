export const HUMAN_NEED_STRATEGY_KEYS = [
  "business",
  "finances",
  "health",
  "relationships",
  "lifestyle",
  "growth",
];

// Keep legacy storage keys stable so existing task/domain links and tile content remain attached.
export const HUMAN_NEED_STRATEGY_CONFIG = [
  { key: "business", label: "Certainty", icon: "verified_user" },
  { key: "finances", label: "Variety", icon: "shuffle" },
  { key: "health", label: "Connection", icon: "favorite" },
  { key: "relationships", label: "Growth", icon: "trending_up" },
  { key: "lifestyle", label: "Contribution", icon: "volunteer_activism" },
  { key: "growth", label: "Significance", icon: "workspace_premium" },
];

export const HUMAN_NEED_STRATEGY_LABELS = Object.fromEntries(
  HUMAN_NEED_STRATEGY_CONFIG.map(({ key, label }) => [key, label])
);

export const HUMAN_NEED_STRATEGY_EXAMPLES = {
  business: "Predictable daily planning rhythms and clear commitments",
  finances: "Novelty, exploration, and healthy variety built into the week",
  health: "Regular intimacy, friendship, and emotionally present relationships",
  relationships: "Visible progress, learning, and challenge that stretches me",
  lifestyle: "Useful service, generosity, and contribution beyond myself",
  growth: "Meaningful wins, mastery, and evidence that I matter",
};

export function getHumanNeedStrategyLabel(key) {
  if (!key) return "";
  return HUMAN_NEED_STRATEGY_LABELS[key] || key;
}

export function getHumanNeedStrategiesState(profile = {}) {
  const lifeDomains = profile.life_domains || {};
  return {
    business: lifeDomains.business || "",
    finances: lifeDomains.finances || "",
    health: lifeDomains.health || "",
    relationships: lifeDomains.relationships || "",
    lifestyle: lifeDomains.lifestyle || "",
    growth: lifeDomains.growth || "",
  };
}
