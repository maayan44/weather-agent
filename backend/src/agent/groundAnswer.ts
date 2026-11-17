import type { AgentAnswer } from "./schemas";

type Figure = AgentAnswer["figures"][number];
type RankingEntry = AgentAnswer["ranking"][number];

// Scores and measurements are rounded to 1-2 decimals, so allow for rounding and nothing more.
const TOLERANCE = 0.051;

export interface GroundingResult {
  answer: AgentAnswer;
  // What we silently repaired; recorded so evals and logs can see how often the model drifts.
  corrections: string[];
  // Figures that match no tool result. The agent gets one chance to fix them.
  ungroundedFigures: Figure[];
}

function collectNumbers(value: unknown, found: number[] = []): number[] {
  if (typeof value === "number") found.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectNumbers(item, found));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectNumbers(item, found));
  return found;
}

function hubOrder(entries: RankingEntry[]): string {
  return entries.map((entry) => entry.hub_id).join(",");
}

// The engine is the source of truth for scores: wrong ones are overwritten, and the order is rebuilt from them.
// A comparison across hazards lists each hub once per hazard, so entries are ranked within their own hazard.
function groundRanking(
  ranking: RankingEntry[],
  lookupScore: (hubId: string, metric: RankingEntry["metric"]) => number,
  corrections: string[],
): RankingEntry[] {
  const corrected = ranking.map((entry) => {
    const trueScore = lookupScore(entry.hub_id, entry.metric);
    if (Math.abs(trueScore - entry.score) < TOLERANCE) return { ...entry, score: trueScore };
    corrections.push(`${entry.hub_id} ${entry.metric} score changed from ${entry.score} to ${trueScore}`);
    return { ...entry, score: trueScore };
  });

  // Groups keep the order in which the model first mentioned each hazard.
  const metrics = [...new Set(corrected.map((entry) => entry.metric))];
  let orderWasWrong = false;

  const grouped = metrics.flatMap((metric) => {
    const given = corrected.filter((entry) => entry.metric === metric);
    const sorted = [...given].sort((a, b) => b.score - a.score);
    if (hubOrder(given) !== hubOrder(sorted)) orderWasWrong = true;
    return sorted.map((entry, index) => ({ ...entry, rank: index + 1 }));
  });

  if (orderWasWrong) corrections.push("ranking order was rebuilt from the true scores");
  return grouped;
}

export function groundAnswer(
  answer: AgentAnswer,
  toolOutputs: unknown[],
  lookupScore: (hubId: string, metric: RankingEntry["metric"]) => number,
): GroundingResult {
  const corrections: string[] = [];
  const knownNumbers = toolOutputs.flatMap((output) => collectNumbers(output));
  const isKnown = (value: number) => knownNumbers.some((known) => Math.abs(known - value) < TOLERANCE);

  return {
    answer: { ...answer, ranking: groundRanking(answer.ranking, lookupScore, corrections) },
    corrections,
    ungroundedFigures: answer.figures.filter((figure) => !isKnown(figure.value)),
  };
}
