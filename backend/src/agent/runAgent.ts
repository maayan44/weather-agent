import type Anthropic from "@anthropic-ai/sdk";
import { requireHub } from "../config/hubs";
import { AGENT_CONFIG } from "../config/agent";
import { toIsoDate } from "../data/dateRange";
import { getHubRisk } from "../scoring/hubRiskService";
import { declinedAnswer } from "./answers";
import { groundAnswer } from "./groundAnswer";
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

export async function runAgent({ message, history = [], callModel, context, today = new Date() }: RunAgentOptions): Promise<AgentRunResult> {
  const system = buildSystemPrompt(toIsoDate(today));
  const messages: Anthropic.MessageParam[] = [...historyToMessages(history), { role: "user", content: message }];
  const toolCalls: ToolCallRecord[] = [];
  const usage = { inputTokens: 0, outputTokens: 0 };
  let toolRounds = 0;
  let groundingRetries = 0;

  const lookupScore = (hubId: string, metric: AgentAnswer["ranking"][number]["metric"]) => {
    const risk = getHubRisk(context.db, requireHub(hubId));
    return metric === "composite" ? risk.compositeScore : risk.subScores[metric].score;
  };

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
          const outcome = runTool(block.name, block.input, context);
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
    const grounding = groundAnswer(parsed.data, toolOutputs, lookupScore);

    if (grounding.ungroundedFigures.length > 0 && groundingRetries < AGENT_CONFIG.maxGroundingRetries) {
      groundingRetries++;
      messages.push({ role: "assistant", content: turn.content });
      messages.push({ role: "user", content: describeUngrounded(grounding.ungroundedFigures) });
      continue;
    }

    // Still ungrounded after the retry: drop those figures rather than show a number nothing backs up.
    const { answer, corrections, ungroundedFigures } = grounding;
    if (ungroundedFigures.length > 0) {
      answer.figures = answer.figures.filter((figure) => !ungroundedFigures.includes(figure));
      answer.data_gaps.push(`${ungroundedFigures.length} figure(s) were removed because no tool result backed them up.`);
      corrections.push(`removed ${ungroundedFigures.length} ungrounded figure(s)`);
    }
    return { answer, toolCalls, corrections, usage };
  }
}
