import { describe, expect, it, vi } from "vitest";
import { stubApi } from "@/test/fixtures";
import { ApiRequestError, fetchRanking, sendChat } from "./client";

describe("API client", () => {
  it("returns the parsed body on success", async () => {
    stubApi({ "/ranking": () => ({ body: { ranked_by: "composite", ranking: [] } }) });
    expect(await fetchRanking("composite")).toMatchObject({ ranked_by: "composite" });
  });

  it("asks the backend for one hazard only when one is chosen", async () => {
    const calls = stubApi({ "/ranking": () => ({ body: {} }) });
    await fetchRanking("composite");
    await fetchRanking("flood");
    expect(calls.map((call) => call.path)).toEqual(["/ranking", "/ranking?hazard=flood"]);
  });

  it("sends the conversation id only when there is one", async () => {
    const calls = stubApi({ "/chat": () => ({ body: { conversation_id: "x", answer: {} } }) });
    await sendChat("first question", null);
    await sendChat("second question", "11111111-2222-4333-8444-555555555555");
    expect(calls[0].body).toEqual({ message: "first question" });
    expect(calls[1].body).toEqual({ message: "second question", conversation_id: "11111111-2222-4333-8444-555555555555" });
  });

  it("carries the backend's error code and status", async () => {
    stubApi({ "/chat": () => ({ status: 429, body: { error: "Too many requests.", code: "rate_limited" } }) });
    await expect(sendChat("hi", null)).rejects.toMatchObject({ code: "rate_limited", status: 429 });
  });

  it("reports a network failure with its own code", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    const failure = await fetchRanking("composite").catch((error) => error);
    expect(failure).toBeInstanceOf(ApiRequestError);
    expect(failure.code).toBe("network");
  });

  it("copes with a reply that is not JSON", async () => {
    vi.stubGlobal("fetch", async () => new Response("<html>Bad gateway</html>", { status: 502 }));
    await expect(fetchRanking("composite")).rejects.toMatchObject({ code: "unknown", status: 502 });
  });
});
