import { API_URL, CHAT_TIMEOUT_MS } from "@/config";
import type { ChatResponse, ConversationResponse, RankingResponse, ScoreMetric } from "./types";

// Every failure carries the backend's stable `code`, so the screen can show a helpful message for each.
export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new ApiRequestError("network", "Cannot reach the server.", 0);
  }

  const body = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
  if (!response.ok) throw new ApiRequestError(body?.code ?? "unknown", body?.error ?? response.statusText, response.status);
  return body as T;
}

export function fetchRanking(metric: ScoreMetric): Promise<RankingResponse> {
  const query = metric === "composite" ? "" : `?hazard=${metric}`;
  return request<RankingResponse>(`/ranking${query}`);
}

export function sendChat(message: string, conversationId: string | null): Promise<ChatResponse> {
  return request<ChatResponse>(
    "/chat",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, ...(conversationId ? { conversation_id: conversationId } : {}) }),
    },
    CHAT_TIMEOUT_MS,
  );
}

export function fetchConversation(conversationId: string): Promise<ConversationResponse> {
  return request<ConversationResponse>(`/conversations/${conversationId}`);
}
