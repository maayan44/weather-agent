import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError, fetchConversation, sendChat } from "@/api/client";
import type { AgentAnswer } from "@/api/types";
import { friendlyMessage, isRetryable } from "@/lib/friendlyError";

export type ChatMessage =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "agent"; answer: AgentAnswer; toolsUsed: string[] }
  // `retryText` is set when sending the same message again could succeed.
  | { id: number; role: "error"; text: string; retryText: string | null };

const STORAGE_KEY = "weatherhub.conversationId";

// Storage can be blocked (private mode), so a failure just means the chat is not remembered.
function readStoredId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredId(id: string | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not remembered; the chat still works.
  }
}

let nextMessageId = 1;
const newId = () => nextMessageId++;

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [storedId] = useState(readStoredId);
  const conversationId = useRef<string | null>(storedId);
  const [isRestoring, setIsRestoring] = useState(storedId !== null);
  // A ref, not state: two quick taps can land before React re-renders, and both would still see isSending = false.
  const inFlight = useRef(false);
  // Bumped by New chat. A reply or restore that started before it belongs to the old chat and is dropped.
  const chatGeneration = useRef(0);

  // After a page reload, bring the earlier conversation back from the server.
  useEffect(() => {
    const id = conversationId.current;
    if (!id) return;
    const generation = chatGeneration.current;

    fetchConversation(id)
      .then(({ turns }) => {
        if (generation !== chatGeneration.current) return;
        const restored = turns.flatMap((turn): ChatMessage[] => [
          { id: newId(), role: "user", text: turn.user_message },
          { id: newId(), role: "agent", answer: turn.answer, toolsUsed: turn.tools_used ?? [] },
        ]);
        // A question sent while this loaded belongs after the earlier turns, so it is kept, not overwritten.
        setMessages((current) => [...restored, ...current]);
      })
      .catch(() => {
        if (generation !== chatGeneration.current) return;
        conversationId.current = null;
        writeStoredId(null);
      })
      .finally(() => setIsRestoring(false));
  }, []);

  const send = useCallback(async (text: string) => {
    const message = text.trim();
    // One question at a time, so answers always appear under the question they answer.
    if (!message || inFlight.current) return;

    inFlight.current = true;
    setIsSending(true);
    const generation = chatGeneration.current;
    const isCurrentChat = () => generation === chatGeneration.current;
    // A retry replaces the failed attempt (its question and the error) instead of stacking another copy of the question.
    setMessages((current) => {
      const last = current.at(-1);
      const isRetry = last?.role === "error" && last.retryText === message;
      const kept = isRetry ? current.slice(0, -2) : current.filter((item) => item.role !== "error");
      return [...kept, { id: newId(), role: "user", text: message }];
    });

    try {
      const response = await sendChat(message, conversationId.current);
      if (!isCurrentChat()) return;
      conversationId.current = response.conversation_id;
      writeStoredId(response.conversation_id);
      setMessages((current) => [...current, { id: newId(), role: "agent", answer: response.answer, toolsUsed: response.meta?.tools_used ?? [] }]);
    } catch (error) {
      if (!isCurrentChat()) return;
      if (error instanceof ApiRequestError && error.code === "not_found") {
        conversationId.current = null;
        writeStoredId(null);
      }
      setMessages((current) => [
        ...current,
        { id: newId(), role: "error", text: friendlyMessage(error), retryText: isRetryable(error) ? message : null },
      ]);
    } finally {
      // New chat already reset these, and a newer question may now be in flight.
      if (isCurrentChat()) {
        inFlight.current = false;
        setIsSending(false);
      }
    }
  }, []);

  // Starts clean even while an answer is still coming: that answer is dropped when it arrives.
  const startNewChat = useCallback(() => {
    chatGeneration.current++;
    inFlight.current = false;
    setIsSending(false);
    setIsRestoring(false);
    conversationId.current = null;
    writeStoredId(null);
    setMessages([]);
  }, []);

  return { messages, isSending, isRestoring, send, startNewChat };
}
