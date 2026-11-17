import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeAnswer, stubApi } from "@/test/fixtures";
import { useChat } from "./useChat";

const CONVERSATION_ID = "11111111-2222-4333-8444-555555555555";

// Replies only when the test says so, to hold a request "in flight".
function heldReply() {
  let release: (text: string) => void = () => {};
  const reply = new Promise<{ body: unknown }>((resolve) => {
    release = (text) => resolve({ body: { conversation_id: CONVERSATION_ID, answer: makeAnswer({ answer: text }) } });
  });
  return { reply, release: (text: string) => release(text) };
}

const transcript = (messages: ReturnType<typeof useChat>["messages"]) =>
  messages.map((message) => (message.role === "agent" ? `A: ${message.answer.answer}` : `${message.role}: ${message.text}`));

describe("useChat send guard", () => {
  it("ignores a second question while the first is still being answered (a fast double tap)", async () => {
    const held = heldReply();
    const calls = stubApi({ "/chat": () => held.reply });
    const { result } = renderHook(() => useChat());

    act(() => {
      void result.current.send("Question 1");
      void result.current.send("Question 2");
    });
    expect(result.current.isSending).toBe(true);

    await act(async () => held.release("Answer 1"));
    await waitFor(() => expect(result.current.isSending).toBe(false));

    expect(calls.filter((call) => call.path === "/chat")).toHaveLength(1);
    expect(transcript(result.current.messages)).toEqual(["user: Question 1", "A: Answer 1"]);
  });

  it("keeps question and answer pairs in order: Q1, A1, then Q2, A2", async () => {
    const first = heldReply();
    const second = heldReply();
    let call = 0;
    stubApi({ "/chat": () => (++call === 1 ? first.reply : second.reply) });
    const { result } = renderHook(() => useChat());

    await act(async () => {
      const sending = result.current.send("Question 1");
      first.release("Answer 1");
      await sending;
    });
    await act(async () => {
      const sending = result.current.send("Question 2");
      second.release("Answer 2");
      await sending;
    });

    expect(transcript(result.current.messages)).toEqual(["user: Question 1", "A: Answer 1", "user: Question 2", "A: Answer 2"]);
  });

  it("accepts a new question once the previous one failed", async () => {
    let call = 0;
    stubApi({
      "/chat": () =>
        ++call === 1
          ? { status: 503, body: { error: "x", code: "ai_busy" } }
          : { body: { conversation_id: CONVERSATION_ID, answer: makeAnswer({ answer: "Worked." }) } },
    });
    const { result } = renderHook(() => useChat());

    await act(() => result.current.send("Question 1"));
    await act(() => result.current.send("Question 1"));

    expect(transcript(result.current.messages)).toEqual(["user: Question 1", "A: Worked."]);
  });
});

describe("useChat with New chat and restore", () => {
  it("drops an answer that arrives after New chat, and keeps the new chat separate", async () => {
    const held = heldReply();
    const calls = stubApi({ "/chat": () => held.reply });
    const { result } = renderHook(() => useChat());

    act(() => void result.current.send("Old question"));
    act(() => result.current.startNewChat());
    expect(result.current.isSending).toBe(false);

    await act(async () => held.release("Late answer"));
    expect(transcript(result.current.messages)).toEqual([]);
    expect(localStorage.getItem("weatherhub.conversationId")).toBeNull();

    // The next question starts a fresh conversation, not the old one.
    stubApi({ "/chat": () => ({ body: { conversation_id: "22222222-2222-4333-8444-555555555555", answer: makeAnswer({ answer: "New answer" }) } }) });
    await act(() => result.current.send("New question"));
    expect(transcript(result.current.messages)).toEqual(["user: New question", "A: New answer"]);
    expect(calls.filter((call) => call.path === "/chat")).toHaveLength(1);
  });

  it("keeps a question sent while an earlier conversation is still loading, after the earlier turns", async () => {
    localStorage.setItem("weatherhub.conversationId", CONVERSATION_ID);
    let releaseRestore: () => void = () => {};
    const restore = new Promise<{ body: unknown }>((resolve) => {
      releaseRestore = () =>
        resolve({ body: { conversation_id: CONVERSATION_ID, turns: [{ user_message: "Earlier", answer: makeAnswer({ answer: "Earlier answer" }), created_at: "x" }] } });
    });
    stubApi({
      "/conversations/": () => restore,
      "/chat": () => ({ body: { conversation_id: CONVERSATION_ID, answer: makeAnswer({ answer: "New answer" }) } }),
    });
    const { result } = renderHook(() => useChat());

    await act(() => result.current.send("New question"));
    await act(async () => releaseRestore());
    await waitFor(() => expect(result.current.isRestoring).toBe(false));

    expect(transcript(result.current.messages)).toEqual(["user: Earlier", "A: Earlier answer", "user: New question", "A: New answer"]);
    localStorage.clear();
  });
});
