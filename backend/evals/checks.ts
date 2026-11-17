import type { AgentRunResult } from "../src/agent/runAgent";
import type { AgentAnswer } from "../src/agent/schemas";
import type { Db } from "../src/data/db";
import { buildHubFacts, explanationTexts, findClaimProblemsInTexts } from "../src/agent/claimVerifier";
import { AGENT_CONFIG } from "../src/config/agent";
import { HUBS } from "../src/config/hubs";
import { getAllHubRisks, getHubScore } from "../src/scoring/hubRiskService";
import type { Check } from "./questions";

export interface CheckResult {
  description: string;
  passed: boolean;
  detail: string;
  // The check's precondition did not hold (e.g. the data no longer shows a tie), so it tested nothing.
  skipped?: boolean;
}

const SCORE_TOLERANCE = AGENT_CONFIG.numberTolerance;
const TIE_WORDS = ["tie", "tied", "close", "similar", "roughly equal", "virtually", "effectively", "nearly"];

type Field = Extract<Check, { kind: "mentions" }>["in"];

function textOf(answer: AgentAnswer, field: Field): string {
  const parts: Record<Field, string[]> = {
    summary: [answer.answer],
    answer: [answer.answer, ...answer.reasoning],
    assumptions: answer.assumptions,
    data_gaps: answer.data_gaps,
    anywhere: [answer.answer, ...answer.reasoning, ...answer.assumptions, ...answer.data_gaps],
  };
  return parts[field].join(" ").toLowerCase();
}

function mentionsAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word.toLowerCase()));
}

function toolNames(tool: string | string[]): string {
  return Array.isArray(tool) ? tool.join(" or ") : tool;
}

// Every key the check names must match; keys it does not name are ignored.
function inputMatches(actual: unknown, expected: Record<string, string>): boolean {
  const input = (actual ?? {}) as Record<string, unknown>;
  return Object.entries(expected).every(([key, value]) => input[key] === value);
}

export function describeCheck(check: Check): string {
  switch (check.kind) {
    case "calls_tool":
      return check.input ? `calls ${toolNames(check.tool)} with ${JSON.stringify(check.input)}` : `calls ${toolNames(check.tool)}`;
    case "in_scope":
      return `in_scope is ${check.value}`;
    case "no_false_claims":
      return "no ranking or ordering claim contradicts the scoring engine";
    case "ranking_has_scores":
      return `ranking shows ${check.hub} for: ${check.metrics.join(", ")}`;
    case "ranking_hubs":
      return `ranking covers exactly ${check.hubs.join(", ")}`;
    case "empty":
      return `${check.field} is empty`;
    case "all_figures_grounded":
      return "every figure comes from a tool result";
    case "quotes_engine_score":
      return `quotes the engine's ${check.metric} score for ${check.hub}`;
    case "mentions":
      return `${check.in} mentions one of: ${check.anyOf.join(", ")}`;
    case "confidence":
      return check.is ? `confidence is ${check.is}` : `confidence is not ${check.not}`;
    case "tie_acknowledged":
      return `calls ${check.hubs.join(" vs ")} a tie when ${check.metric} scores are within ${check.withinPoints} points`;
  }
}

function runCheck(check: Check, run: AgentRunResult, db: Db): { passed: boolean; detail: string; skipped?: boolean } {
  const { answer } = run;

  switch (check.kind) {
    case "calls_tool": {
      const allowed = Array.isArray(check.tool) ? check.tool : [check.tool];
      const passed = run.toolCalls.some((call) => allowed.includes(call.name) && (!check.input || inputMatches(call.input, check.input)));
      return { passed, detail: `tools called: ${run.toolCalls.map((call) => `${call.name}${JSON.stringify(call.input)}`).join(", ") || "none"}` };
    }
    case "in_scope":
      return { passed: answer.in_scope === check.value, detail: `in_scope was ${answer.in_scope}` };
    case "no_false_claims": {
      const problems = findClaimProblemsInTexts(explanationTexts(answer), buildHubFacts(getAllHubRisks(db, HUBS)), check.hub ?? null);
      return { passed: problems.length === 0, detail: problems.length === 0 ? "every ranking claim matches the engine" : problems.join("; ") };
    }
    case "ranking_has_scores": {
      const shown = answer.ranking.filter((entry) => entry.hub_id === check.hub).map((entry) => entry.metric);
      const missing = check.metrics.filter((metric) => !shown.includes(metric));
      return { passed: missing.length === 0, detail: missing.length === 0 ? `all ${check.metrics.length} scores shown` : `missing: ${missing.join(", ")}` };
    }
    case "ranking_hubs": {
      // A hub may appear once per hazard, so compare the distinct hubs.
      const actual = [...new Set(answer.ranking.map((entry) => entry.hub_id))].sort();
      const expected = [...check.hubs].sort();
      return { passed: JSON.stringify(actual) === JSON.stringify(expected), detail: `ranking had ${actual.join(", ") || "nothing"}` };
    }
    case "empty":
      return { passed: answer[check.field].length === 0, detail: `${check.field} had ${answer[check.field].length} item(s)` };
    case "all_figures_grounded": {
      const removed = run.corrections.filter((correction) => correction.includes("ungrounded figure"));
      return { passed: removed.length === 0, detail: removed.length === 0 ? "none removed" : removed.join("; ") };
    }
    case "quotes_engine_score": {
      const trueScore = getHubScore(db, check.hub, check.metric);
      const quoted = [...answer.ranking.map((entry) => entry.score), ...answer.figures.map((figure) => figure.value)];
      return { passed: quoted.some((value) => Math.abs(value - trueScore) < SCORE_TOLERANCE), detail: `engine says ${trueScore}; answer quoted ${quoted.join(", ") || "no numbers"}` };
    }
    case "mentions": {
      const passed = mentionsAny(textOf(answer, check.in), check.anyOf);
      return { passed, detail: passed ? "found" : `not found in: ${textOf(answer, check.in).slice(0, 160)}` };
    }
    case "confidence": {
      const passed = check.is ? answer.confidence === check.is : answer.confidence !== check.not;
      return { passed, detail: `confidence was ${answer.confidence}` };
    }
    case "tie_acknowledged": {
      const [hubA, hubB] = check.hubs;
      const gap = Math.abs(getHubScore(db, hubA, check.metric) - getHubScore(db, hubB, check.metric));
      if (gap > check.withinPoints) return { passed: true, skipped: true, detail: `scores are now ${gap.toFixed(1)} apart, so there is no tie to test` };
      return { passed: mentionsAny(textOf(answer, "answer"), TIE_WORDS), detail: `scores are ${gap.toFixed(1)} apart; answer must call it a tie` };
    }
  }
}

export function evaluateCheck(check: Check, run: AgentRunResult, db: Db): CheckResult {
  return { description: describeCheck(check), ...runCheck(check, run, db) };
}
