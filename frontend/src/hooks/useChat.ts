import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError, fetchConversation, sendChat } from "@/api/client";
import type { AgentAnswer } from "@/api/types";
import { friendlyMessage, isRetryable } from "@/lib/friendlyError";

export type ChatMessage =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "agent"; answer: AgentAnswer }
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

  // After a page reload, bring the earlier conversation back from the server.
  useEffect(() => {
    const id = conversationId.current;
    if (!id) return;

    fetchConversation(id)
      .then(({ turns }) =>
        setMessages(
          turns.flatMap((turn): ChatMessage[] => [
            { id: newId(), role: "user", text: turn.user_message },
            { id: newId(), role: "agent", answer: turn.answer },
          ]),
        ),
      )
      .catch(() => {
        conversationId.current = null;
        writeStoredId(null);
      })
      .finally(() => setIsRestoring(false));
  }, []);

  const send = useCallback(async (text: string) => {
    const message = text.trim();
    if (!message) return;

    setIsSending(true);
    // A retry replaces the failed attempt instead of stacking another copy of the question.
    setMessages((current) => [...current.filter((item) => item.role !== "error"), { id: newId(), role: "user", text: message }]);

    try {
      const response = await sendChat(message, conversationId.current);
      conversationId.current = response.conversation_id;
      writeStoredId(response.conversation_id);
      setMessages((current) => [...current, { id: newId(), role: "agent", answer: response.answer }]);
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "not_found") {
        conversationId.current = null;
        writeStoredId(null);
      }
      setMessages((current) => [
        ...current,
        { id: newId(), role: "error", text: friendlyMessage(error), retryText: isRetryable(error) ? message : null },
      ]);
    } finally {
      setIsSending(false);
    }
  }, []);

  const startNewChat = useCallback(() => {
    conversationId.current = null;
    writeStoredId(null);
    setMessages([]);
  }, []);

  return { messages, isSending, isRestoring, send, startNewChat };
}
