// Agent settings. The model can be swapped by env var without touching code.

export const AGENT_CONFIG = {
  model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
  // Tool lookups are simple, so medium effort keeps replies fast without hurting quality.
  effort: "medium" as const,
  maxTokens: 8000,
  // Stops a confused model from looping on tools forever.
  maxToolRounds: 6,
  // How many times the agent may be asked to fix an answer that quotes numbers no tool returned.
  maxGroundingRetries: 1,
};
