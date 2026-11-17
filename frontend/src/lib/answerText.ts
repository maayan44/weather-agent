import type { AgentAnswer, ScoreMetric } from "@/api/types";
import { formatScore, hubLabel, metricLabel } from "./hazards";

// Ranking entries arrive grouped by score; this keeps the groups in the order the model gave them.
export function groupRanking(ranking: AgentAnswer["ranking"]) {
  const groups = new Map<ScoreMetric, AgentAnswer["ranking"]>();
  for (const entry of ranking) groups.set(entry.metric, [...(groups.get(entry.metric) ?? []), entry]);
  return [...groups].map(([metric, entries]) => ({ metric, entries }));
}

type RankingGroup = ReturnType<typeof groupRanking>[number];

export interface HubProfile {
  hubId: string;
  entries: AgentAnswer["ranking"];
}

// A single hub shown for several scores (overall plus each hazard) is a profile, not several one-hub rankings.
// Overall comes first, then the hazards from most to least exposed.
export function asHubProfile(groups: RankingGroup[]): HubProfile | null {
  if (groups.length < 2 || groups.some((group) => group.entries.length !== 1)) return null;

  const entries = groups.map((group) => group.entries[0]);
  const hubId = entries[0].hub_id;
  if (entries.some((entry) => entry.hub_id !== hubId)) return null;

  const rest = entries.filter((entry) => entry.metric !== "composite").sort((a, b) => b.score - a.score);
  const overall = entries.filter((entry) => entry.metric === "composite");
  return { hubId, entries: [...overall, ...rest] };
}

function section(title: string, lines: string[]): string[] {
  return lines.length > 0 ? ["", `${title}:`, ...lines.map((line) => `- ${line}`)] : [];
}

// Plain text for pasting into an email or report.
export function formatAnswerAsText(answer: AgentAnswer): string {
  const groups = groupRanking(answer.ranking);
  const profile = asHubProfile(groups);
  const ranking = profile
    ? ["", `${hubLabel(profile.hubId)} scores:`, ...profile.entries.map((entry) => `- ${metricLabel(entry.metric)}: ${formatScore(entry.score)}`)]
    : groups.flatMap(({ metric, entries }) => [
        "",
        `${metricLabel(metric)} score:`,
        ...entries.map((entry) => `${entry.rank}. ${hubLabel(entry.hub_id)}: ${formatScore(entry.score)}`),
      ]);

  return [
    answer.answer,
    ...ranking,
    ...section("Key numbers", answer.figures.map((figure) => `${figure.label}: ${formatScore(figure.value)} ${figure.unit}`.trim())),
    ...section("Why", answer.reasoning),
    ...section("Assumptions", answer.assumptions),
    ...section("Data gaps and limits", answer.data_gaps),
    "",
    `Confidence: ${answer.confidence}`,
  ].join("\n");
}
