import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AGENT_CONFIG } from "../config/agent";
import { agentAnswerSchema } from "./schemas";
import type { ModelCaller } from "./types";

// The only file that talks to Claude. The client is created on first use so tests and
// scoring work without an API key.
export function createModelCaller(): ModelCaller {
  let client: Anthropic | undefined;

  return async ({ system, tools, messages }) => {
    client ??= new Anthropic();

    const response = await client.messages.parse({
      model: AGENT_CONFIG.model,
      max_tokens: AGENT_CONFIG.maxTokens,
      system,
      tools,
      messages,
      // The JSON schema makes the final answer machine-readable; tools stay available until then.
      output_config: { effort: AGENT_CONFIG.effort, format: zodOutputFormat(agentAnswerSchema) },
    });

    return {
      content: response.content,
      stopReason: response.stop_reason,
      parsedAnswer: response.parsed_output,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  };
}
