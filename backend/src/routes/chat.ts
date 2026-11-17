import { randomUUID } from "node:crypto";
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { runAgent } from "../agent/runAgent";
import type { ModelCaller } from "../agent/types";
import { API_CONFIG } from "../config/api";
import { HUBS } from "../config/hubs";
import { getTurns, saveTurn } from "../conversations/conversationStore";
import type { Db } from "../data/db";
import { isDataReady } from "../data/readiness";
import { ApiError } from "../middleware/apiError";

export const conversationIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "conversation_id must be 8-64 letters, digits, - or _");

const chatRequestSchema = z.object({
  message: z.string().trim().min(1, "message is required").max(API_CONFIG.maxMessageLength),
  conversation_id: conversationIdSchema.optional(),
});

interface ChatDeps {
  db: Db;
  callModel: ModelCaller;
  rateLimiter: RequestHandler;
}

export function createChatRouter({ db, callModel, rateLimiter }: ChatDeps) {
  const router = Router();

  router.post("/chat", rateLimiter, async (req, res) => {
    const { message, conversation_id } = chatRequestSchema.parse(req.body);

    if (!isDataReady(db, HUBS)) {
      throw new ApiError(503, "data_loading", "Weather data is still loading. Try again in a minute.");
    }

    // The client may start a conversation by sending no id; we create one and return it.
    const conversationId = conversation_id ?? randomUUID();
    const history = getTurns(db, conversationId, API_CONFIG.maxHistoryTurns);
    const result = await runAgent({ message, history, callModel, context: { db } });
    saveTurn(db, conversationId, { userMessage: message, answer: result.answer });

    res.json({
      conversation_id: conversationId,
      answer: result.answer,
      meta: {
        tools_used: result.toolCalls.map((call) => call.name),
        corrections: result.corrections,
        usage: result.usage,
      },
    });
  });

  return router;
}
