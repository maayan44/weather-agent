// Agent settings. The model can be swapped by env var without touching code.

export const AGENT_CONFIG = {
  model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
  // Tool lookups are simple, so medium effort keeps replies fast without hurting quality.
  effort: "medium" as const,
  // Thinking counts toward this limit too, so it leaves room for long multi-hub answers.
  maxTokens: 16000,
  // One model call may not hang a request: 60 s each, retried once, so at most about 2 minutes.
  requestTimeoutMs: 60_000,
  maxRetries: 1,
  // Stops a confused model from looping on tools forever.
  maxToolRounds: 6,
  // How many times the agent may be asked to fix an answer that quotes numbers no tool returned.
  maxGroundingRetries: 1,
  // Too many numbers bury the decision on a phone screen: the prompt asks for this many, and code enforces it.
  maxFigures: 6,
  // Scores this close are a tie: used by the prompt, the answer check and the evals.
  tiePoints: 3,
};
