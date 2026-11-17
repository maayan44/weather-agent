import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { openDatabase } from "../src/data/db";
import { AgentError } from "../src/agent/types";
import { createSeededDb } from "./helpers/seedDatabase";
import { answerTurn, makeAnswer, scriptedModel, toolUseTurn } from "./helpers/scriptedModel";
import { getJson, postJson, startTestServer } from "./helpers/testServer";

let closeServer: (() => Promise<void>) | undefined;
afterEach(async () => {
  await closeServer?.();
  closeServer = undefined;
});

async function start(options: { turns?: Parameters<typeof scriptedModel>[0]; emptyDb?: boolean; rateLimit?: number } = {}) {
  const model = scriptedModel(options.turns ?? []);
  const db = options.emptyDb ? openDatabase(":memory:") : createSeededDb();
  const server = await startTestServer(createApp({ db, callModel: model.callModel, chatRateLimitPerMinute: options.rateLimit ?? 1000 }));
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

  it("keeps different conversations separate", async () => {
    const { baseUrl, requests } = await start({ turns: [answerTurn(makeAnswer()), answerTurn(makeAnswer())] });
    await postJson(`${baseUrl}/chat`, { message: "A", conversation_id: "conversation-a" });
    await postJson(`${baseUrl}/chat`, { message: "B", conversation_id: "conversation-b" });
    expect(requests[1].messages).toHaveLength(1);
  });

  it("rejects bad requests with a 400 and a clear message", async () => {
    const { baseUrl } = await start();
    const empty = await postJson(`${baseUrl}/chat`, { message: "   " });
    const tooLong = await postJson(`${baseUrl}/chat`, { message: "x".repeat(1001) });
    const badId = await postJson(`${baseUrl}/chat`, { message: "hi", conversation_id: "no spaces!" });
    const missing = await postJson(`${baseUrl}/chat`, {});

    for (const response of [empty, tooLong, badId, missing]) {
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("invalid_request");
    }
  });

  it("rejects a body that is not JSON", async () => {
    const { baseUrl } = await start();
    const response = await fetch(`${baseUrl}/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: "{oops" });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("invalid_request");
  });

  it("answers 503 while data is still loading instead of failing in the agent", async () => {
    const { baseUrl, requests } = await start({ emptyDb: true });
    const { status, body } = await postJson(`${baseUrl}/chat`, { message: "hi" });
    expect(status).toBe(503);
    expect(body.code).toBe("data_loading");
    expect(requests).toHaveLength(0); // no money spent
  });

  it("does not save a turn when the agent fails", async () => {
    const { baseUrl } = await start({ turns: [answerTurn({ answer: "wrong shape" })] });
    const failed = await postJson(`${baseUrl}/chat`, { message: "hi", conversation_id: "conversation-x" });
    expect(failed.status).toBe(502);
    expect(failed.body.code).toBe("agent_failed");
    expect((await getJson(`${baseUrl}/conversations/conversation-x`)).status).toBe(404);
  });

  it("limits how often one client can call it", async () => {
    const { baseUrl } = await start({ rateLimit: 2, turns: [answerTurn(makeAnswer()), answerTurn(makeAnswer())] });
    await postJson(`${baseUrl}/chat`, { message: "1" });
    await postJson(`${baseUrl}/chat`, { message: "2" });
    const third = await postJson(`${baseUrl}/chat`, { message: "3" });
    expect(third.status).toBe(429);
    expect(third.body.code).toBe("rate_limited");
  });
});

describe("errors from the AI service", () => {
  it("hides provider details from the client", async () => {
    const model = async () => {
      throw new Anthropic.APIError(400, { error: { message: "credit balance is too low" } }, "credit balance is too low", new Headers());
    };
    const server = await startTestServer(createApp({ db: createSeededDb(), callModel: model, chatRateLimitPerMinute: 100 }));
    closeServer = server.close;

    const { status, body } = await postJson(`${server.baseUrl}/chat`, { message: "hi" });
    expect(status).toBe(502);
    expect(body.code).toBe("ai_unavailable");
    expect(JSON.stringify(body)).not.toContain("credit");
  });

  it("tells the client to retry when the provider is rate limited", async () => {
    const model = async () => {
      throw new Anthropic.RateLimitError(429, { error: { message: "slow down" } }, "slow down", new Headers());
    };
    const server = await startTestServer(createApp({ db: createSeededDb(), callModel: model, chatRateLimitPerMinute: 100 }));
    closeServer = server.close;

    const { status, body } = await postJson(`${server.baseUrl}/chat`, { message: "hi" });
    expect(status).toBe(503);
    expect(body.code).toBe("ai_busy");
  });

  it("exposes agent errors with a stable code", async () => {
    const model = async () => {
      throw new AgentError("too many tool rounds");
    };
    const server = await startTestServer(createApp({ db: createSeededDb(), callModel: model, chatRateLimitPerMinute: 100 }));
    closeServer = server.close;
    expect((await postJson(`${server.baseUrl}/chat`, { message: "hi" })).body.code).toBe("agent_failed");
  });
});

describe("GET /conversations/:id", () => {
  it("returns the saved turns in order", async () => {
    const { baseUrl } = await start({ turns: [answerTurn(makeAnswer({ answer: "One" })), answerTurn(makeAnswer({ answer: "Two" }))] });
    await postJson(`${baseUrl}/chat`, { message: "Q1", conversation_id: "conversation-1" });
    await postJson(`${baseUrl}/chat`, { message: "Q2", conversation_id: "conversation-1" });

    const { status, body } = await getJson(`${baseUrl}/conversations/conversation-1`);
    expect(status).toBe(200);
    expect(body.turns.map((turn: any) => turn.user_message)).toEqual(["Q1", "Q2"]);
    expect(body.turns[1].answer.answer).toBe("Two");
  });

  it("returns 404 for an unknown conversation and 400 for a malformed id", async () => {
    const { baseUrl } = await start();
    expect((await getJson(`${baseUrl}/conversations/does-not-exist`)).status).toBe(404);
    expect((await getJson(`${baseUrl}/conversations/x`)).status).toBe(400);
  });
});

describe("GET /hubs", () => {
  it("still lists the 10 hubs", async () => {
    const { baseUrl } = await start();
    expect((await getJson(`${baseUrl}/hubs`)).body.hubs).toHaveLength(10);
  });
});
