import { HAZARDS } from "../config/scoring";
import { computeHubRanks } from "../scoring/hubRanks";
import type { HubRisk } from "../scoring/types";
import type { AgentAnswer } from "./schemas";

type Entry = AgentAnswer["ranking"][number];

// A profile is one hub shown for several different scores (overall, winter, wind...), one entry each.
// Two hubs under one score is a ranking; one score for one hub is a single lookup. Neither is a profile.
export function findProfileHub(ranking: Entry[]): string | null {
  if (ranking.length < 2) return null;
  const metrics = new Set(ranking.map((entry) => entry.metric));
  const hubs = new Set(ranking.map((entry) => entry.hub_id));
  return metrics.size === ranking.length && hubs.size === 1 ? ranking[0].hub_id : null;
}

export function ordinal(position: number): string {
  const lastTwoDigits = position % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) return `${position}th`;
  const suffix: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };
  return `${position}${suffix[position % 10] ?? "th"}`;
}

export interface CompletedProfile {
  ranking: Entry[];
  added: number;
}

// The model may show only some of a hub's scores and may forget how it compares with the others. Both are facts the
// scoring engine already knows, so the code fills the profile in: overall plus all five hazards, each with the hub's
// rank among all hubs. `rank` here is that position among all hubs, and `note` says it in words.
export function completeHubProfile(ranking: Entry[], allRisks: HubRisk[]): CompletedProfile | null {
  const hubId = findProfileHub(ranking);
  const risk = allRisks.find((candidate) => candidate.hubId === hubId);
  if (!hubId || !risk) return null;

  const ranks = computeHubRanks(hubId, allRisks);
  const entry = (metric: Entry["metric"], score: number, rank: number): Entry => ({
    rank,
    hub_id: hubId as Entry["hub_id"],
    metric,
    score,
    note: `${ordinal(rank)} of ${ranks.out_of} hubs`,
  });

  // Overall first, then the hazards from most to least exposed.
  const hazardsByScore = [...HAZARDS].sort((a, b) => risk.subScores[b].score - risk.subScores[a].score);
  const full = [
    entry("composite", risk.compositeScore, ranks.composite),
    ...hazardsByScore.map((hazard) => entry(hazard, risk.subScores[hazard].score, ranks.hazards[hazard])),
  ];
  return { ranking: full, added: Math.max(0, full.length - ranking.length) };
}
