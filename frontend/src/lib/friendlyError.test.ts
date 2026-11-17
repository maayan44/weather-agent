import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/api/client";
import { friendlyMessage, isRetryable } from "./friendlyError";

const error = (code: string) => new ApiRequestError(code, "raw server text", 500);

describe("friendlyMessage", () => {
  it.each([
    ["network", /reach the server/i],
    ["data_loading", /still loading/i],
    ["rate_limited", /wait a moment/i],
    ["daily_limit_reached", /daily question limit/i],
    ["ai_busy", /busy/i],
    ["ai_unavailable", /unavailable/i],
    ["agent_failed", /rephras/i],
    ["payload_too_large", /too long/i],
    ["not_found", /started a new one/i],
  ])("explains %s in plain words", (code, expected) => {
    expect(friendlyMessage(error(code))).toMatch(expected);
  });

  it("never shows the raw server text", () => {
    expect(friendlyMessage(error("ai_unavailable"))).not.toContain("raw server text");
    expect(friendlyMessage(error("invalid_request"))).not.toContain("raw server text");
  });

  it("has a safe fallback for unknown codes and unknown errors", () => {
    expect(friendlyMessage(error("something_new"))).toMatch(/something went wrong/i);
    expect(friendlyMessage(new Error("boom"))).toMatch(/something went wrong/i);
  });
});

describe("isRetryable", () => {
  it("does not offer a retry when the same message can never work", () => {
    expect(isRetryable(error("daily_limit_reached"))).toBe(false);
    expect(isRetryable(error("payload_too_large"))).toBe(false);
    expect(isRetryable(error("invalid_request"))).toBe(false);
  });

  it("offers a retry for temporary problems", () => {
    expect(isRetryable(error("network"))).toBe(true);
    expect(isRetryable(error("ai_busy"))).toBe(true);
    expect(isRetryable(new Error("boom"))).toBe(true);
  });
});
