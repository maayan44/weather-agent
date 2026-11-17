import { AGENT_CONFIG } from "../config/agent";
import { findProvenance } from "../scoring/provenance";
import type { AgentAnswer } from "./schemas";

type Figure = AgentAnswer["figures"][number];
type RankingEntry = AgentAnswer["ranking"][number];

// Scores and measurements are rounded to 1-2 decimals, so allow for rounding and nothing more.
const TOLERANCE = 0.051;
const ISO_DATE = /\d{4}-\d{2}-\d{2}/g;
// "February 28" or "Dec 1st": the day number is part of a date, not a data claim.
const WORD_DATE = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?\b/gi;
// "13 May": the same, day first. Capitalized months only, so "45 may rise" still counts as a number.
const DAY_FIRST_DATE = /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/g;
// A minus sign counts only when it does not join two numbers, so "0-100" reads as 0 and 100.
const NUMBER = /(?<![\w.])-?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?/g;

export interface GroundingResult {
  answer: AgentAnswer;
  // What we silently repaired; recorded so evals and logs can see how often the model drifts.
  corrections: string[];
  // Figures that match no tool result. The agent gets one chance to fix them.
  ungroundedFigures: Figure[];
  // Numbers in the answer text that no tool returned (often a difference the model worked out).
  unverifiedTextNumbers: number[];
}

// Numbers written in text, ignoring dates such as 2025-11-13, February 28 or 13 May.
export function extractNumbers(text: string): number[] {
  const withoutDates = text.replace(ISO_DATE, " ").replace(WORD_DATE, " ").replace(DAY_FIRST_DATE, " ");
  return (withoutDates.match(NUMBER) ?? []).map((token) => Number(token.replace(/,/g, ""))).filter(Number.isFinite);
}

// Every number a tool returned, including numbers inside text such as "Days at or above 95°F".
function collectNumbers(value: unknown, found: number[] = []): number[] {
  if (typeof value === "number") found.push(value);
  else if (typeof value === "string") found.push(...extractNumbers(value));
  else if (Array.isArray(value)) value.forEach((item) => collectNumbers(item, found));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectNumbers(item, found));
  return found;
}

// Small counts ("3 points", "2 hubs", "7th") and years are ordinary language, not data claims.
function isEverydayNumber(value: number): boolean {
  return (Number.isInteger(value) && value >= 0 && value <= 10) || (Number.isInteger(value) && value >= 1900 && value <= 2100);
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
  const seen = new Set<string>();
  const unique = ranking.filter((entry) => {
    const key = `${entry.hub_id}:${entry.metric}`;
    if (seen.has(key)) {
      corrections.push(`dropped duplicate ranking entry ${key}`);
      return false;
    }
    seen.add(key);
    return true;
  });

  const corrected = unique.map((entry) => {
    const trueScore = lookupScore(entry.hub_id, entry.metric);
    if (Math.abs(trueScore - entry.score) >= TOLERANCE) {
      corrections.push(`${entry.hub_id} ${entry.metric} score changed from ${entry.score} to ${trueScore}`);
    }
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

// Two neighbours within the tie margin mean the order shown is not certain.
function hasNearTie(ranking: RankingEntry[]): boolean {
  return ranking.some((entry, index) => {
    const next = ranking[index + 1];
    return next !== undefined && next.metric === entry.metric && entry.score - next.score <= AGENT_CONFIG.tiePoints;
  });
}

// True when value is exactly the gap between two numbers the answer itself states, e.g. 61.2 - 59.9 = 1.3.
// Exact arithmetic on stated numbers is checkable; a rounded "about 39 points" is not.
function isGapBetween(value: number, stated: number[]): boolean {
  return stated.some((a, i) => stated.some((b, j) => i !== j && Math.abs(Math.abs(a - b) - value) < TOLERANCE));
}

export function groundAnswer(
  answer: AgentAnswer,
  toolOutputs: unknown[],
  lookupScore: (hubId: string, metric: RankingEntry["metric"]) => number,
  // Facts the model was given directly, such as the hazard weights in the system prompt.
  referenceNumbers: number[] = [],
): GroundingResult {
  const corrections: string[] = [];
  const knownNumbers = [...toolOutputs.flatMap((output) => collectNumbers(output)), ...referenceNumbers];
  const isKnown = (value: number) => knownNumbers.some((known) => Math.abs(known - value) < TOLERANCE);

  const ranking = groundRanking(answer.ranking, lookupScore, corrections);

  // A figure labelled as a score that repeats a score already shown in the ranking only adds clutter.
  const rankingScores = ranking.map((entry) => entry.score);
  const distinctFigures = answer.figures.filter(
    (figure) => !(/score/i.test(figure.unit) && rankingScores.some((score) => Math.abs(score - figure.value) < TOLERANCE)),
  );
  if (distinctFigures.length < answer.figures.length) {
    corrections.push(`dropped ${answer.figures.length - distinctFigures.length} figure(s) that repeat ranking scores`);
  }

  // The model lists the most important numbers first, so the cut keeps those.
  // Source and period come from the tool result that holds the value; anything the model wrote there is replaced.
  const figures = distinctFigures.slice(0, AGENT_CONFIG.maxFigures).map(({ source: _source, data_period: _period, ...figure }) => {
    const provenance = findProvenance(figure.value, figure.unit, toolOutputs);
    return provenance ? { ...figure, ...provenance } : figure;
  });
  if (figures.length < distinctFigures.length) {
    corrections.push(`kept the first ${AGENT_CONFIG.maxFigures} figures, trimmed ${distinctFigures.length - figures.length}`);
  }

  let confidence = answer.confidence;
  if (confidence === "high" && hasNearTie(ranking)) {
    confidence = "medium";
    corrections.push("confidence lowered to medium: the ranking contains a near-tie");
  }

  const quoted = [...ranking.map((entry) => entry.score), ...figures.map((figure) => figure.value)];
  const isQuoted = (value: number) => quoted.some((number) => Math.abs(number - value) < TOLERANCE);
  const textNumbers = [...new Set(extractNumbers([answer.answer, ...answer.reasoning].join(" ")))];
  const statedAndBacked = [...quoted, ...textNumbers.filter(isKnown)];
  const unverifiedTextNumbers = textNumbers.filter(
    (value) => !isEverydayNumber(value) && !isKnown(value) && !isQuoted(value) && !isGapBetween(value, statedAndBacked),
  );

  return {
    answer: { ...answer, ranking, figures, confidence },
    corrections,
    ungroundedFigures: figures.filter((figure) => !isKnown(figure.value)),
    unverifiedTextNumbers,
  };
}
