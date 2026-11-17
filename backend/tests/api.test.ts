import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createModelCaller } from "../src/agent/llmClient";
import { createApp } from "../src/app";
import { openDatabase } from "../src/data/db";
import { AgentError, type ModelCaller, type ModelTurn } from "../src/agent/types";
import { createSeededDb } from "./helpers/seedDatabase";
import { answerTurn, makeAnswer, scriptedModel, toolUseTurn } from "./helpers/scriptedModel";
import { getJson, postJson, startTestServer } from "./helpers/testServer";

const UNKNOWN_ID = "6f1c2b9a-1d2e-4f3a-9b8c-7d6e5f4a3b2c";

let closeServer: (() => Promise<void>) | undefined;
afterEach(async () => {
  await closeServer?.();
  closeServer = undefined;
});

interface StartOptions {
  turns?: ModelTurn[];
  callModel?: ModelCaller;
  emptyDb?: boolean;
  rateLimit?: number;
  dailyLimit?: number;
}

async function start(options: StartOptions = {}) {
  const model = scriptedModel(options.turns ?? []);
  const db = options.emptyDb ? openDatabase(":memory:") : createSeededDb();
  const app = createApp({
    db,
    callModel: options.callModel ?? model.callModel,
    chatRateLimitPerMinute: options.rateLimit ?? 1000,
    chatDailyLimit: options.dailyLimit ?? 1000,
  });
  const server = await startTestServer(app);
  closeServer = server.close;
  return { ...server, ...model };
}

describe("GET /health", () => {
  it("is ok and reports that data is ready", async () => {
    const { baseUrl } = await start();
    expect((await getJson(`${baseUrl}/health`)).body).toEqual({ status: "ok", data_ready: true });
  });

  it("stays ok but reports data_ready false while the first download runs", async () => {
    const { baseUrl } = await start({ emptyDb: true });
    expect((await getJson(`${baseUrl}/health`)).body).toEqual({ status: "ok", data_ready: false });
  });
});

describe("POST /chat", () => {
  it("returns the structured answer, a new conversation id and what the agent did", async () => {
    const { baseUrl } = await start({
      turns: [toolUseTurn([{ id: "t1", name: "rank_hubs", input: { region: "Midwest", hazard: "winter" } }]), answerTurn(makeAnswer())],
    });
    const { status, body } = await postJson(`${baseUrl}/chat`, { message: "Midwest winter?" });

    expect(status).toBe(200);
    expect(body.conversation_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.answer.in_scope).toBe(true);
    expect(body.meta.tools_used).toEqual(["rank_hubs"]);
    expect(body.meta.usage.inputTokens).toBe(200);
  });

  it("remembers the conversation: the second message sees the first answer", async () => {
    const { baseUrl, requests } = await start({
      turns: [answerTurn(makeAnswer({ answer: "First answer" })), answerTurn(makeAnswer({ answer: "Second answer" }))],
    });
    const first = await postJson(`${baseUrl}/chat`, { message: "First question" });
    await postJson(`${baseUrl}/chat`, { message: "Second question", conversation_id: first.body.conversation_id });

    const secondRequest = requests[1].messages;
    expect(secondRequest.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(secondRequest[0].content).toBe("First question");
    expect(secondRequest[1].content).toContain("First answer");
  });

  it("starts a separate conversation for each message sent without an id", async () => {
    const { baseUrl, requests } = await start({ turns: [answerTurn(makeAnswer()), answerTurn(makeAnswer())] });
    const first = await postJson(`${baseUrl}/chat`, { message: "A" });
    const second = await postJson(`${baseUrl}/chat`, { message: "B" });
    expect(first.body.conversation_id).not.toBe(second.body.conversation_id);
    expect(requests[1].messages).toHaveLength(1);
  });

  it("refuses an id this server never issued, without spending money", async () => {
    const { baseUrl, requests } = await start();
    const { status, body } = await postJson(`${baseUrl}/chat`, { message: "hi", conversation_id: UNKNOWN_ID });
    expect(status).toBe(404);
    expect(body.code).toBe("not_found");
    expect(requests).toHaveLength(0);
  });

  it("rejects bad requests with a 400 and a readable message", async () => {
    const { baseUrl } = await start();
    const empty = await postJson(`${baseUrl}/chat`, { message: "   " });
    const tooLong = await postJson(`${baseUrl}/chat`, { message: "x".repeat(1001) });
    const badId = await postJson(`${baseUrl}/chat`, { message: "hi", conversation_id: "my-own-id" });
    const missing = await postJson(`${baseUrl}/chat`, {});

    for (const response of [empty, tooLong, badId, missing]) {
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("invalid_request");
      expect(response.body.error).not.toMatch(/[✖→]/);
    }
    expect(missing.body.error).toContain("message:");
  });

  it("rejects a body that is not JSON", async () => {
    const { baseUrl } = await start();
    const response = await fetch(`${baseUrl}/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: "{oops" });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("invalid_request");
  });

  it("answers 413, not 500, for a body over 10 KB", async () => {
    const { baseUrl } = await start();
    const { status, body } = await postJson(`${baseUrl}/chat`, { message: "x".repeat(20_000) });
    expect(status).toBe(413);
    expect(body.code).toBe("payload_too_large");
  });

  it("answers 503 while data is still loading instead of failing in the agent", async () => {
    const { baseUrl, requests } = await start({ emptyDb: true });
    const { status, body } = await postJson(`${baseUrl}/chat`, { message: "hi" });
    expect(status).toBe(503);
    expect(body.code).toBe("data_loading");
    expect(requests).toHaveLength(0); // no money spent
  });

  it("does not save a turn when the agent fails", async () => {
    const { baseUrl } = await start({ turns: [answerTurn(makeAnswer()), answerTurn({ answer: "wrong shape" })] });
    const first = await postJson(`${baseUrl}/chat`, { message: "Q1" });
    const failed = await postJson(`${baseUrl}/chat`, { message: "Q2", conversation_id: first.body.conversation_id });
    expect(failed.status).toBe(502);
    expect(failed.body.code).toBe("agent_failed");
    expect((await getJson(`${baseUrl}/conversations/${first.body.conversation_id}`)).body.turns).toHaveLength(1);
  });

  it("handles two messages sent at once in one conversation one after the other", async () => {
    const { callModel: scripted, requests } = scriptedModel([answerTurn(makeAnswer()), answerTurn(makeAnswer()), answerTurn(makeAnswer())]);
    // A slow model makes the two requests overlap.
    const slowModel: ModelCaller = async (request) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return scripted(request);
    };
    const { baseUrl } = await start({ callModel: slowModel });
    const first = await postJson(`${baseUrl}/chat`, { message: "Q1" });
    const id = first.body.conversation_id;

    await Promise.all([
      postJson(`${baseUrl}/chat`, { message: "Q2", conversation_id: id }),
      postJson(`${baseUrl}/chat`, { message: "Q3", conversation_id: id }),
    ]);

    // The third call saw both earlier turns, so the second one finished before it started.
    expect(requests[2].messages).toHaveLength(5);
    expect((await getJson(`${baseUrl}/conversations/${id}`)).body.turns).toHaveLength(3);
  });

  it("limits how often one client can call it", async () => {
    const { baseUrl } = await start({ rateLimit: 2, turns: [answerTurn(makeAnswer()), answerTurn(makeAnswer())] });
    await postJson(`${baseUrl}/chat`, { message: "1" });
    await postJson(`${baseUrl}/chat`, { message: "2" });
    const third = await postJson(`${baseUrl}/chat`, { message: "3" });
    expect(third.status).toBe(429);
    expect(third.body.code).toBe("rate_limited");
  });

  it("stops all chat for the day once the daily budget is used", async () => {
    const { baseUrl } = await start({ dailyLimit: 1, turns: [answerTurn(makeAnswer())] });
    await postJson(`${baseUrl}/chat`, { message: "1" });
    const second = await postJson(`${baseUrl}/chat`, { message: "2" });
    expect(second.status).toBe(429);
    expect(second.body.code).toBe("daily_limit_reached");
  });
});

describe("errors from the AI service", () => {
  async function startWithFailingModel(error: Error) {
    return start({
      callModel: async () => {
        throw error;
      },
    });
  }

  it("hides provider details from the client", async () => {
    const { baseUrl } = await startWithFailingModel(
      new Anthropic.APIError(400, { error: { message: "credit balance is too low" } }, "credit balance is too low", new Headers()),
    );
    const { status, body } = await postJson(`${baseUrl}/chat`, { message: "hi" });
    expect(status).toBe(502);
    expect(body.code).toBe("ai_unavailable");
    expect(JSON.stringify(body)).not.toContain("credit");
  });

  // Uses the real Claude client, because the SDK's own missing-key error is a plain Error.
  it("treats a missing API key as the AI service being unavailable, not a crash", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    try {
      const { baseUrl } = await start({ callModel: createModelCaller() });
      const { status, body } = await postJson(`${baseUrl}/chat`, { message: "hi" });
      expect(status).toBe(502);
      expect(body.code).toBe("ai_unavailable");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("also covers the SDK's own error classes", async () => {
    const { baseUrl } = await startWithFailingModel(new Anthropic.AnthropicError("connection failed"));
    expect((await postJson(`${baseUrl}/chat`, { message: "hi" })).body.code).toBe("ai_unavailable");
  });

  it("tells the client to retry when the provider is rate limited", async () => {
    const { baseUrl } = await startWithFailingModel(new Anthropic.RateLimitError(429, { error: { message: "slow down" } }, "slow down", new Headers()));
    const { status, body } = await postJson(`${baseUrl}/chat`, { message: "hi" });
    expect(status).toBe(503);
    expect(body.code).toBe("ai_busy");
  });

  it("exposes agent errors with a stable code", async () => {
    const { baseUrl } = await startWithFailingModel(new AgentError("too many tool rounds"));
    expect((await postJson(`${baseUrl}/chat`, { message: "hi" })).body.code).toBe("agent_failed");
  });
});

describe("GET /conversations/:id", () => {
  it("returns the saved turns in order", async () => {
    const { baseUrl } = await start({ turns: [answerTurn(makeAnswer({ answer: "One" })), answerTurn(makeAnswer({ answer: "Two" }))] });
    const first = await postJson(`${baseUrl}/chat`, { message: "Q1" });
    await postJson(`${baseUrl}/chat`, { message: "Q2", conversation_id: first.body.conversation_id });

    const { status, body } = await getJson(`${baseUrl}/conversations/${first.body.conversation_id}`);
    expect(status).toBe(200);
    expect(body.turns.map((turn: any) => turn.user_message)).toEqual(["Q1", "Q2"]);
    expect(body.turns[1].answer.answer).toBe("Two");
  });

  it("returns 404 for an unknown conversation and 400 for a malformed id", async () => {
    const { baseUrl } = await start();
    expect((await getJson(`${baseUrl}/conversations/${UNKNOWN_ID}`)).status).toBe(404);
    expect((await getJson(`${baseUrl}/conversations/not-a-real-id`)).status).toBe(400);
  });

  it("skips a damaged saved answer instead of failing the whole conversation", async () => {
    const db = createSeededDb();
    const id = "11111111-2222-4333-8444-555555555555";
    db.prepare("INSERT INTO conversation_turns (conversation_id, user_message, answer_json, created_at) VALUES (?, ?, ?, ?)").run(id, "broken", "{not json", "2026-11-17T00:00:00Z");
    db.prepare("INSERT INTO conversation_turns (conversation_id, user_message, answer_json, created_at) VALUES (?, ?, ?, ?)").run(id, "fine", JSON.stringify(makeAnswer()), "2026-11-17T00:00:01Z");
    const server = await startTestServer(createApp({ db, callModel: scriptedModel([]).callModel }));
    closeServer = server.close;

    const { status, body } = await getJson(`${server.baseUrl}/conversations/${id}`);
    expect(status).toBe(200);
    expect(body.turns.map((turn: any) => turn.user_message)).toEqual(["fine"]);
  });
});

describe("GET /hubs", () => {
  it("still lists the 10 hubs", async () => {
    const { baseUrl } = await start();
    expect((await getJson(`${baseUrl}/hubs`)).body.hubs).toHaveLength(10);
  });
});
