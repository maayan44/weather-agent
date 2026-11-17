import { ApiRequestError } from "@/api/client";

// Plain-language messages for every backend error code. The raw server text is never shown for server-side failures.
const MESSAGES: Record<string, string> = {
  network: "I can't reach the server. Check your connection and try again.",
  data_loading: "The weather data is still loading. Try again in a minute.",
  rate_limited: "That's a lot of questions in a minute. Please wait a moment and try again.",
  daily_limit_reached: "This demo has reached its daily question limit. Please try again tomorrow.",
  ai_busy: "The AI service is busy right now. Try again in a moment.",
  ai_unavailable: "The AI service is unavailable right now. Please try again later.",
  agent_failed: "I couldn't put together a reliable answer to that. Try rephrasing the question.",
  payload_too_large: "That question is too long. Please shorten it.",
  not_found: "That conversation is no longer available, so I started a new one. Please ask again.",
};

export function friendlyMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    // A bad request message names the field and is safe to show, e.g. "message: Too big...".
    if (error.code === "invalid_request") return "I couldn't use that message. Please shorten or rephrase it.";
    return MESSAGES[error.code] ?? "Something went wrong. Please try again.";
  }
  return "Something went wrong. Please try again.";
}

// Errors where trying the very same message again can succeed.
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) return true;
  return !["daily_limit_reached", "payload_too_large", "invalid_request"].includes(error.code);
}
