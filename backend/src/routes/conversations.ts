import { Router } from "express";
import { getTurns } from "../conversations/conversationStore";
import type { Db } from "../data/db";
import { ApiError } from "../middleware/apiError";
import { conversationIdSchema } from "./chat";

// Lets the UI restore a conversation after a page reload.
export function createConversationsRouter(db: Db) {
  const router = Router();

  router.get("/conversations/:id", (req, res) => {
    const conversationId = conversationIdSchema.parse(req.params.id);
    const turns = getTurns(db, conversationId);
    if (turns.length === 0) throw new ApiError(404, "not_found", "Conversation not found.");

    res.json({
      conversation_id: conversationId,
      turns: turns.map((turn) => ({
        user_message: turn.userMessage,
        answer: turn.answer,
        tools_used: turn.toolsUsed,
        created_at: turn.createdAt,
      })),
    });
  });

  return router;
}
