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

// The engine is the source of truth for scores: wrong ones are overwritten, and the order is rebuilt from them.
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

  const sorted = [...corrected].sort((a, b) => b.score - a.score).map((entry, index) => ({ ...entry, rank: index + 1 }));
  if (sorted.some((entry, index) => entry.hub_id !== corrected[index].hub_id)) {
    corrections.push("ranking order was rebuilt from the true scores");
  }
  return sorted;
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
