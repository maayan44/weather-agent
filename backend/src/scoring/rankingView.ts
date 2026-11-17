import { getHubsByRegion, HUBS, type Region } from "../config/hubs";
import { HAZARDS, type Hazard } from "../config/scoring";
import { scoreProvenance } from "./provenance";
import type { Db } from "../data/db";
import { getAllHubRisks } from "./hubRiskService";
import { rankHubs } from "./ranking";

// One ranking, used by both the agent's rank_hubs tool and the plain GET /ranking endpoint,
// so the overview screen and the chat can never disagree.
export function buildRankingView(db: Db, region?: Region, hazard?: Hazard) {
  const hubs = region ? getHubsByRegion(region) : HUBS;
  const rankingKey = hazard ?? "composite";
  const risks = getAllHubRisks(db, hubs);

  return {
    ranked_by: rankingKey,
    region: region ?? "all regions",
    data_window: risks.length > 0 ? `${risks[0].windowStart} to ${risks[0].windowEnd}` : null,
    ranking: rankHubs(risks, rankingKey).map(({ rank, score, risk }) => ({
      rank,
      hub_id: risk.hubId,
      hub: risk.hubName,
      region: risk.region,
      score,
      composite_score: risk.compositeScore,
      // Per hub, because one hub can have a shorter window than the others (e.g. a failed download).
      ...scoreProvenance(risk),
      dominant_hazard: risk.dominantHazard,
      hazard_scores: Object.fromEntries(HAZARDS.map((hazardName) => [hazardName, risk.subScores[hazardName].score])),
    })),
  };
}
