import type Anthropic from "@anthropic-ai/sdk";
import type { AgentAnswer } from "../../src/agent/schemas";
import type { ModelRequest, ModelTurn } from "../../src/agent/types";

export function makeAnswer(overrides: Partial<AgentAnswer> = {}): AgentAnswer {
  return {
    in_scope: true,
    answer: "Minneapolis is most exposed to winter.",
    ranking: [],
    figures: [],
    reasoning: [],
    assumptions: [],
    confidence: "high",
    data_gaps: [],
    ...overrides,
  };
}

export function toolUseTurn(calls: { id: string; name: string; input: unknown }[]): ModelTurn {
  const content = calls.map((call) => ({ type: "tool_use", ...call })) as unknown as Anthropic.ContentBlock[];
  return { content, stopReason: "tool_use", parsedAnswer: null, inputTokens: 100, outputTokens: 10 };
}

export function answerTurn(answer: unknown, stopReason: ModelTurn["stopReason"] = "end_turn"): ModelTurn {
  const content = [{ type: "text", text: JSON.stringify(answer) }] as unknown as Anthropic.ContentBlock[];
  return { content, stopReason, parsedAnswer: answer, inputTokens: 100, outputTokens: 50 };
}

// A scripted stand-in for Claude: returns the prepared turns in order and records every request.
export function scriptedModel(turns: ModelTurn[]) {
  const requests: ModelRequest[] = [];
  const callModel = async (request: ModelRequest) => {
    requests.push({ ...request, messages: [...request.messages] });
    const next = turns.shift();
    if (!next) throw new Error("script ran out of turns");
    return next;
  };
  return { callModel, requests };
}
