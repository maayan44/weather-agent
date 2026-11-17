// HTTP API and background-refresh settings.

export const API_CONFIG = {
  maxMessageLength: 1000,
  // How many earlier question/answer pairs the agent sees; bounds cost and keeps focus on recent context.
  maxHistoryTurns: 10,
  // /chat spends real money per call, so each client is limited.
  chatRateLimitPerMinute: 10,
  // Data is refreshed on startup and then kept current in the background.
  refreshIntervalMs: 6 * 60 * 60 * 1000,
  refreshRetryMs: 60 * 1000,
};
