/**
 * Golden-boot / top-scorer goals only.
 * Own goals update the match score but never count for a player's goal tally.
 */
export function isTopScorerGoal(type) {
  const t = String(type || "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, "_");
  // Exact match only — never OWN_GOAL, OWN GOAL, etc.
  return t === "GOAL";
}
