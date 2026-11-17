import type Anthropic from "@anthropic-ai/sdk";

export interface ModelRequest {
  system: string;
  tools: Anthropic.Tool[];
  messages: Anthropic.MessageParam[];
}

// What we need back from one model call. Keeping it this small lets tests script the model.
export interface ModelTurn {
  content: Anthropic.ContentBlock[];
  stopReason: Anthropic.StopReason | null;
  parsedAnswer: unknown;
  inputTokens: number;
  outputTokens: number;
}

export type ModelCaller = (request: ModelRequest) => Promise<ModelTurn>;

// The agent could not produce a trustworthy answer; the API turns this into a clear error.
export class AgentError extends Error {}
