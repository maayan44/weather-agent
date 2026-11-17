import { randomUUID } from "node:crypto";
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { runAgent } from "../agent/runAgent";
import type { ModelCaller } from "../agent/types";
import { API_CONFIG } from "../config/api";
import { HUBS } from "../config/hubs";
import { withConversationLock } from "../conversations/conversationLock";
import { getTurns, saveTurn } from "../conversations/conversationStore";
import type { Db } from "../data/db";
import { isDataReady } from "../data/readiness";
import { ApiError } from "../middleware/apiError";

// Ids are random UUIDs issued by the server, so they cannot be guessed or chosen by a client.
export const conversationIdSchema = z.uuid({ message: "conversation_id must be an id returned by a previous /chat call" });

const chatRequestSchema = z.object({
  message: z.string().trim().min(1, "message is required").max(API_CONFIG.maxMessageLength),
  conversation_id: conversationIdSchema.optional(),
});

interface ChatDeps {
  db: Db;
  callModel: ModelCaller;
  limits: RequestHandler[];
}

export function createChatRouter({ db, callModel, limits }: ChatDeps) {
  const router = Router();

  router.post("/chat", ...limits, async (req, res) => {
    const { message, conversation_id } = chatRequestSchema.parse(req.body);

    if (!isDataReady(db, HUBS)) {
      throw new ApiError(503, "data_loading", "Weather data is still loading. Try again in a minute.");
    }

    // No id starts a new conversation; an id must belong to a conversation this server created.
    const conversationId = conversation_id ?? randomUUID();

    const result = await withConversationLock(conversationId, async () => {
      const history = getTurns(db, conversationId, API_CONFIG.maxHistoryTurns);
      if (conversation_id && history.length === 0) {
        throw new ApiError(404, "not_found", "Conversation not found. Send the message without conversation_id to start a new one.");
      }
      const run = await runAgent({ message, history, callModel, context: { db } });
      saveTurn(db, conversationId, { userMessage: message, answer: run.answer, toolsUsed: run.toolCalls.map((call) => call.name) });
      return run;
    });

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
