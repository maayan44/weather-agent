import type { HubRisk, RankedHub, RankingKey } from "./types";

function getScore(risk: HubRisk, key: RankingKey): number {
  return key === "composite" ? risk.compositeScore : risk.subScores[key].score;
}

// Highest risk first. Ties are broken by name so the order never changes between runs.
export function rankHubs(risks: HubRisk[], key: RankingKey = "composite"): RankedHub[] {
  return [...risks]
    .sort((a, b) => getScore(b, key) - getScore(a, key) || a.hubName.localeCompare(b.hubName))
    .map((risk, index) => ({ rank: index + 1, score: getScore(risk, key), risk }));
}
