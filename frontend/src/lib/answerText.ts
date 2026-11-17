import type { AgentAnswer, ScoreMetric } from "@/api/types";
import { formatScore, hubLabel, metricLabel } from "./hazards";

// Ranking entries arrive grouped by score; this keeps the groups in the order the model gave them.
export function groupRanking(ranking: AgentAnswer["ranking"]) {
  const groups = new Map<ScoreMetric, AgentAnswer["ranking"]>();
  for (const entry of ranking) groups.set(entry.metric, [...(groups.get(entry.metric) ?? []), entry]);
  return [...groups].map(([metric, entries]) => ({ metric, entries }));
}

function section(title: string, lines: string[]): string[] {
  return lines.length > 0 ? ["", `${title}:`, ...lines.map((line) => `- ${line}`)] : [];
}

// Plain text for pasting into an email or report.
export function formatAnswerAsText(answer: AgentAnswer): string {
  const ranking = groupRanking(answer.ranking).flatMap(({ metric, entries }) => [
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
