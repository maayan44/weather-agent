import type Anthropic from "@anthropic-ai/sdk";
import { AGENT_CONFIG } from "../config/agent";
import { toIsoDate } from "../data/dateRange";
import { HUBS } from "../config/hubs";
import { getAllHubRisks, getHubScore } from "../scoring/hubRiskService";
import { declinedAnswer } from "./answers";
import { extractNumbers, groundAnswer } from "./groundAnswer";
import { buildHubFacts, correctClaims, describeClaimProblems, explanationTexts, findClaimProblemsInTexts } from "./claimVerifier";
import { needsPartialPeriodNote, PARTIAL_PERIOD_NOTE } from "./periodWarning";
import { completeHubProfile, findProfileHub } from "./profileCompletion";
import { agentAnswerSchema, type AgentAnswer } from "./schemas";
import { buildSystemPrompt } from "./systemPrompt";
import { API_TOOLS, runTool, type ToolContext } from "./tools";
import { AgentError, type ModelCaller } from "./types";

// Only the question and the final answer are kept between turns; tool calls are cheap to repeat.
export interface ConversationTurn {
  userMessage: string;
  answer: AgentAnswer;
}

export interface ToolCallRecord {
  name: string;
  input: unknown;
  output?: unknown;
  error?: string;
}

export interface AgentRunResult {
  answer: AgentAnswer;
  toolCalls: ToolCallRecord[];
  corrections: string[];
  usage: { inputTokens: number; outputTokens: number };
}

interface RunAgentOptions {
  message: string;
  history?: ConversationTurn[];
  callModel: ModelCaller;
  context: ToolContext;
  today?: Date;
}

function historyToMessages(history: ConversationTurn[]): Anthropic.MessageParam[] {
  return history.flatMap((turn) => [
    { role: "user" as const, content: turn.userMessage },
    { role: "assistant" as const, content: JSON.stringify(turn.answer) },
  ]);
}

function describeUngrounded(figures: AgentAnswer["figures"]): string {
  const list = figures.map((figure) => `"${figure.label}" = ${figure.value}`).join("; ");
  return `These figures do not appear in any tool result: ${list}. Rewrite your answer using only numbers returned by tools (call a tool if you need one), or remove them.`;
}

// When every tool call was about one hub, an answer sentence that does not name a hub is about that hub.
function singleHubInToolCalls(toolCalls: ToolCallRecord[]): string | null {
  const hubs = new Set(toolCalls.map((call) => (call.input as { hub?: unknown } | null)?.hub).filter((hub): hub is string => typeof hub === "string"));
  return hubs.size === 1 ? [...hubs][0] : null;
}

export async function runAgent({ message, history = [], callModel, context, today = new Date() }: RunAgentOptions): Promise<AgentRunResult> {
  const system = buildSystemPrompt(toIsoDate(today));
  // Numbers the prompt states (weights, the tie margin, the 0-100 scale) are facts the model may repeat.
  const promptNumbers = extractNumbers(system);
  const messages: Anthropic.MessageParam[] = [...historyToMessages(history), { role: "user", content: message }];
  const toolCalls: ToolCallRecord[] = [];
  const usage = { inputTokens: 0, outputTokens: 0 };
  let toolRounds = 0;
  let groundingRetries = 0;

  const lookupScore = (hubId: string, metric: AgentAnswer["ranking"][number]["metric"]) => getHubScore(context.db, hubId, metric);

  for (;;) {
    const turn = await callModel({ system, tools: API_TOOLS, messages });
    usage.inputTokens += turn.inputTokens;
    usage.outputTokens += turn.outputTokens;

    if (turn.stopReason === "refusal") {
      const answer = declinedAnswer("I can't help with that request.", "The model declined to answer.");
      return { answer, toolCalls, corrections: [], usage };
    }
    if (turn.stopReason === "max_tokens") throw new AgentError("The answer was cut off before it finished.");

    if (turn.stopReason === "tool_use") {
      if (++toolRounds > AGENT_CONFIG.maxToolRounds) throw new AgentError("The agent used too many tool rounds.");

      messages.push({ role: "assistant", content: turn.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = turn.content
        .filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use")
        .map((block) => {
          const outcome = runTool(block.name, block.input, { ...context, today });
          toolCalls.push({ name: block.name, input: block.input, ...outcome });
          return outcome.error === undefined
            ? { type: "tool_result", tool_use_id: block.id, content: JSON.stringify(outcome.output) }
            : { type: "tool_result", tool_use_id: block.id, is_error: true, content: outcome.error };
        });
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    const parsed = agentAnswerSchema.safeParse(turn.parsedAnswer);
    if (!parsed.success) throw new AgentError("The model's answer did not match the required format.");

    const toolOutputs = toolCalls.flatMap((call) => (call.output === undefined ? [] : [call.output]));
    const grounding = groundAnswer(parsed.data, toolOutputs, lookupScore, promptNumbers);

    // Statements about how a hazard or hub ranks are checked against the engine too, not just the numbers.
    const allRisks = getAllHubRisks(context.db, HUBS);
    const mainHub = findProfileHub(grounding.answer.ranking) ?? singleHubInToolCalls(toolCalls);
    const claimProblems = findClaimProblemsInTexts(explanationTexts(grounding.answer), buildHubFacts(allRisks), mainHub);

    const feedback: string[] = [];
    if (grounding.ungroundedFigures.length > 0) feedback.push(describeUngrounded(grounding.ungroundedFigures));
    if (claimProblems.length > 0) feedback.push(describeClaimProblems(claimProblems));

    if (feedback.length > 0 && groundingRetries < AGENT_CONFIG.maxGroundingRetries) {
      groundingRetries++;
      messages.push({ role: "assistant", content: turn.content });
      messages.push({ role: "user", content: feedback.join("\n\n") });
      continue;
    }

    // Still ungrounded after the retry: drop those figures rather than show a number nothing backs up.
    const { answer, corrections, ungroundedFigures, unverifiedTextNumbers } = grounding;
    // A ranking claim the engine contradicts is never shown: the engine knows the true fact, so the code writes it in.
    if (claimProblems.length > 0) {
      const facts = buildHubFacts(allRisks);
      const fix = (text: string) => correctClaims(text, facts, mainHub).text;
      answer.answer = fix(answer.answer);
      answer.reasoning = answer.reasoning.map(fix).filter((text) => text.length > 0);
      answer.assumptions = answer.assumptions.map(fix).filter((text) => text.length > 0);
      answer.data_gaps = answer.data_gaps.map(fix).filter((text) => text.length > 0);
      corrections.push(`corrected a wrong ranking claim: ${claimProblems.join("; ")}`);
    }
    const dataGaps = [...answer.data_gaps];
    if (ungroundedFigures.length > 0) {
      answer.figures = answer.figures.filter((figure) => !ungroundedFigures.includes(figure));
      dataGaps.push(`${ungroundedFigures.length} figure(s) were removed because no tool result backed them up.`);
      corrections.push(`removed ${ungroundedFigures.length} ungrounded figure(s)`);
    }
    // Text cannot be edited safely, so a number no tool returned is flagged to the reader instead.
    if (unverifiedTextNumbers.length > 0) {
      dataGaps.push(`The explanation mentions ${unverifiedTextNumbers.join(", ")}, which is not a direct tool result; treat it as approximate.`);
      corrections.push(`unverified numbers in text: ${unverifiedTextNumbers.join(", ")}`);
    }
    let answerText = answer.answer;
    if (needsPartialPeriodNote(toolCalls, answerText)) {
      answerText = `${answerText} ${PARTIAL_PERIOD_NOTE}`;
      corrections.push("added a warning that the period leaves out seasons");
    }
    // A hub profile is completed from the engine: all six scores, each with the hub's rank among the hubs.
    let ranking = answer.ranking;
    if (findProfileHub(ranking)) {
      const completed = completeHubProfile(ranking, allRisks);
      if (completed) {
        ranking = completed.ranking;
        if (completed.added > 0) corrections.push(`completed the hub profile: added ${completed.added} score(s)`);
      }
    }
    return { answer: { ...answer, answer: answerText, ranking, data_gaps: dataGaps }, toolCalls, corrections, usage };
  }
}
