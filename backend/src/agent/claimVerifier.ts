import { HAZARDS, type Hazard } from "../config/scoring";
import type { HubRanks } from "../scoring/hubRanks";
import { computeHubRanks } from "../scoring/hubRanks";
import type { HubRisk } from "../scoring/types";
import { ordinal } from "./profileCompletion";
import type { AgentAnswer } from "./schemas";

// What the scoring engine knows about one hub: the facts a sentence about rankings can be checked against.
export interface HubFacts {
  hubId: string;
  hubName: string;
  // This hub's hazards from most to least exposed (ties keep the fixed hazard order).
  hazardOrder: Hazard[];
  ranks: HubRanks;
  compositeIsHighest: boolean;
  compositeIsLowest: boolean;
}

export function buildHubFacts(allRisks: HubRisk[]): HubFacts[] {
  const composites = allRisks.map((risk) => risk.compositeScore);
  return allRisks.map((risk) => ({
    hubId: risk.hubId,
    hubName: risk.hubName,
    hazardOrder: [...HAZARDS].sort((a, b) => risk.subScores[b].score - risk.subScores[a].score),
    ranks: computeHubRanks(risk.hubId, allRisks),
    compositeIsHighest: composites.every((score) => score <= risk.compositeScore),
    compositeIsLowest: composites.every((score) => score >= risk.compositeScore),
  }));
}

const ORDINAL_WORDS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };

function ordinalValue(token: string): number | null {
  const lower = token.toLowerCase();
  if (lower in ORDINAL_WORDS) return ORDINAL_WORDS[lower];
  const digits = lower.match(/^(\d+)(?:st|nd|rd|th)$/);
  return digits ? Number(digits[1]) : null;
}

function ordinalWord(position: number): string {
  return ["", "highest", "second-highest", "third-highest", "fourth-highest", "fifth-highest"][position] ?? `#${position}`;
}

const HAZARD = "winter|flood|hurricane|heat|wind";
const HAZARD_WORD = new RegExp(`\\b(${HAZARD})\\b`, "gi");

// "winter, its third-ranked hazard" / "Chicago's second-highest hazard": a hazard's place among ONE hub's hazards.
const POSITION_AMONG_HAZARDS =
  /\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)[- ](?:ranked|highest|largest|biggest|strongest|greatest|top)(?:[- ]?scoring)?\s+(?:hazard|risk|exposure)\b/gi;

// "wind (79.2, 1st of 10 hubs)" / "winter at 59.9 (3rd of 10)": a hub's place among all hubs for one hazard.
const HAZARD_RANK = new RegExp(`\\b(${HAZARD})\\b([^;()]{0,25})\\(\\s*(?:[\\d.]+\\s*,\\s*)?(\\d+)(?:st|nd|rd|th)\\s+of\\s+(\\d+)(?:\\s+hubs)?\\s*\\)`, "gi");

// "composite 36.3 (1st of 10 hubs)" and "ranks 1st of 10 hubs overall".
const OVERALL_RANK_PARENS = /\b(?:composite|overall)\b[^;()]{0,25}\(\s*(?:[\d.]+\s*,\s*)?(\d+)(?:st|nd|rd|th)\s+of\s+(\d+)(?:\s+hubs)?(?:\s+overall)?\s*\)/gi;
const OVERALL_RANK_WORDS = /\b(?:ranks?|ranking|ranked)\s+(\d+)(?:st|nd|rd|th)\s+of\s+(\d+)(?:\s+hubs)?\s+overall\b/gi;

// "Chicago has the highest composite risk of the 10 hubs".
const SUPERLATIVE = /\bthe\s+(highest|lowest)\s+(?:composite|overall)\s+(?:risk|score|exposure)?[^.]{0,25}?(?:of|among)\s+(?:the\s+)?(\d+)\s+hubs\b/gi;

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/);
}

// The single hub a sentence is about: the one it names, else the answer's main hub. Two hubs in one sentence is too ambiguous to judge.
function hubForSentence(sentence: string, facts: HubFacts[], fallbackHubId: string | null): HubFacts | null {
  const named = facts.filter((hub) => new RegExp(`\\b${hub.hubName}\\b`, "i").test(sentence));
  if (named.length > 1) return null;
  if (named.length === 1) return named[0];
  return facts.find((hub) => hub.hubId === fallbackHubId) ?? null;
}

function distinctHazards(text: string): Hazard[] {
  return [...new Set([...text.matchAll(HAZARD_WORD)].map((match) => match[1].toLowerCase() as Hazard))];
}

// A statement the engine contradicts: the wrong words as written, and the same words with the true fact.
// `right` is null when there is no clean rewrite, so the whole sentence goes.
export interface ClaimIssue {
  message: string;
  sentence: string;
  wrong: string;
  right: string | null;
}

const rankPhrase = /\d+(?:st|nd|rd|th)\s+of\s+\d+/i;

// Finds statements about ordering and rank that contradict the engine. It only judges phrasings it can read with
// confidence, and stays silent about anything ambiguous: a missed error is better than a false alarm.
export function findClaimIssues(text: string, facts: HubFacts[], fallbackHubId: string | null = null): ClaimIssue[] {
  const issues: ClaimIssue[] = [];

  for (const sentence of splitSentences(text)) {
    const hub = hubForSentence(sentence, facts, fallbackHubId);
    if (!hub) continue;

    const hazardsInSentence = distinctHazards(sentence);
    for (const match of sentence.matchAll(POSITION_AMONG_HAZARDS)) {
      const claimed = ordinalValue(match[1]);
      if (hazardsInSentence.length !== 1 || claimed === null) continue; // which hazard is meant is unclear
      const actual = hub.hazardOrder.indexOf(hazardsInSentence[0]) + 1;
      if (actual !== claimed) {
        issues.push({ message: `${hub.hubName}'s ${hazardsInSentence[0]} is its ${ordinalWord(actual)} hazard, not its ${ordinalWord(claimed)}`, sentence, wrong: match[0], right: `${ordinalWord(actual)} hazard` });
      }
    }

    for (const match of sentence.matchAll(HAZARD_RANK)) {
      const [, hazardName, gap, claimedText, outOfText] = match;
      if (distinctHazards(gap).length > 0) continue; // another hazard name in between: unclear which one the rank belongs to
      const hazard = hazardName.toLowerCase() as Hazard;
      const claimed = Number(claimedText);
      const actual = hub.ranks.hazards[hazard];
      if (claimed !== actual || Number(outOfText) !== hub.ranks.out_of) {
        const message = `${hub.hubName} ranks ${actual} of ${hub.ranks.out_of} hubs for ${hazard}, not ${claimed} of ${outOfText}`;
        issues.push({ message, sentence, wrong: match[0], right: match[0].replace(rankPhrase, `${ordinal(actual)} of ${hub.ranks.out_of}`) });
      }
    }

    for (const pattern of [OVERALL_RANK_PARENS, OVERALL_RANK_WORDS]) {
      for (const match of sentence.matchAll(pattern)) {
        if (Number(match[1]) !== hub.ranks.composite || Number(match[2]) !== hub.ranks.out_of) {
          const message = `${hub.hubName} ranks ${hub.ranks.composite} of ${hub.ranks.out_of} hubs overall, not ${match[1]} of ${match[2]}`;
          issues.push({ message, sentence, wrong: match[0], right: match[0].replace(rankPhrase, `${ordinal(hub.ranks.composite)} of ${hub.ranks.out_of}`) });
        }
      }
    }

    for (const match of sentence.matchAll(SUPERLATIVE)) {
      const isTrue = match[1].toLowerCase() === "highest" ? hub.compositeIsHighest : hub.compositeIsLowest;
      if (!isTrue || Number(match[2]) !== hub.ranks.out_of) {
        issues.push({ message: `${hub.hubName} does not have the ${match[1].toLowerCase()} overall score of the ${match[2]} hubs`, sentence, wrong: match[0], right: null });
      }
    }
  }

  return issues;
}

// Same check, as plain messages.
export function findClaimProblems(text: string, facts: HubFacts[], fallbackHubId: string | null = null): string[] {
  return [...new Set(findClaimIssues(text, facts, fallbackHubId).map((issue) => issue.message))];
}

// The sentences the reader sees; each is checked on its own so a claim never spills across two bullets.
export function explanationTexts(answer: AgentAnswer): string[] {
  return [answer.answer, ...answer.reasoning, ...answer.assumptions, ...answer.data_gaps];
}

// Checks each text on its own (so a claim never spills from one bullet into the next) and reports each problem once.
export function findClaimProblemsInTexts(texts: string[], facts: HubFacts[], fallbackHubId: string | null = null): string[] {
  return [...new Set(texts.flatMap((text) => findClaimProblems(text, facts, fallbackHubId)))];
}

// Rewrites every contradicted statement with the engine's true fact; a statement with no clean rewrite loses its sentence.
export function correctClaims(text: string, facts: HubFacts[], fallbackHubId: string | null = null): { text: string; messages: string[] } {
  const issues = findClaimIssues(text, facts, fallbackHubId);
  let corrected = text;
  for (const issue of issues) {
    corrected = issue.right === null ? corrected.replace(issue.sentence, "") : corrected.replace(issue.wrong, issue.right);
  }
  return { text: corrected.replace(/\s{2,}/g, " ").trim(), messages: [...new Set(issues.map((issue) => issue.message))] };
}

export function describeClaimProblems(problems: string[]): string {
  return `These statements contradict the scoring engine: ${problems.join("; ")}. Rewrite your answer fixing them. A hub's place among all hubs is in rank_among_hubs; the order of one hub's own hazards follows its hazard scores (highest score first). Do not describe a hazard by an ordinal position unless it is exactly right.`;
}
