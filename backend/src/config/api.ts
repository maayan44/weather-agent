// HTTP API and background-refresh settings.

export const API_CONFIG = {
  maxMessageLength: 1000,
  // How many earlier question/answer pairs the agent sees; bounds cost and keeps focus on recent context.
  maxHistoryTurns: 10,
  // /chat spends real money per call, so each client is limited.
  chatRateLimitPerMinute: 10,
  // Ceiling across all clients: about $0.50 a day on Haiku, about $15 on Opus at ~10k tokens per chat.
  chatDailyLimit: 300,
  // Data is refreshed on startup and then kept current in the background.
  refreshIntervalMs: 6 * 60 * 60 * 1000,
  refreshRetryMs: 60 * 1000,
};
