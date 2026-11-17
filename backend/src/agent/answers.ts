import type { AgentAnswer } from "./schemas";

// Used when the model declines or cannot help, so callers always receive the same answer shape.
export function declinedAnswer(message: string, dataGap: string): AgentAnswer {
  return {
    in_scope: false,
    answer: message,
    ranking: [],
    figures: [],
    reasoning: [],
    assumptions: [],
    confidence: "low",
    data_gaps: [dataGap],
  };
}
