import { HAZARDS, type Hazard } from "../config/scoring";
import type { HubRisk } from "./types";

export interface HubRanks {
  out_of: number;
  // 1 = most exposed. Hubs with the same score share a rank, so a hazard where five hubs score 0 is not made to look like a race.
  composite: number;
  hazards: Record<Hazard, number>;
}

// Where one hub stands among all the hubs: the comparison an analyst needs when deciding where to invest.
export function computeHubRanks(hubId: string, allRisks: HubRisk[]): HubRanks {
  const own = allRisks.find((risk) => risk.hubId === hubId);
  if (!own) throw new Error(`Hub ${hubId} is not among the scored hubs`);

  const rankOf = (score: (risk: HubRisk) => number) => 1 + allRisks.filter((risk) => score(risk) > score(own)).length;

  return {
    out_of: allRisks.length,
    composite: rankOf((risk) => risk.compositeScore),
    hazards: Object.fromEntries(HAZARDS.map((hazard) => [hazard, rankOf((risk) => risk.subScores[hazard].score)])) as Record<Hazard, number>,
  };
}
