import { agentAnswerSchema } from "../agent/schemas";
import type { ConversationTurn } from "../agent/runAgent";
import type { Db } from "../data/db";

export interface StoredTurn extends ConversationTurn {
  createdAt: string;
}

interface TurnRow {
  user_message: string;
  answer_json: string;
  created_at: string;
}

export function saveTurn(db: Db, conversationId: string, turn: ConversationTurn, now = new Date()): void {
  db.prepare(
    "INSERT INTO conversation_turns (conversation_id, user_message, answer_json, created_at) VALUES (?, ?, ?, ?)",
  ).run(conversationId, turn.userMessage, JSON.stringify(turn.answer), now.toISOString());
}

function toStoredTurn(row: TurnRow): StoredTurn | null {
  const answer = agentAnswerSchema.safeParse(JSON.parse(row.answer_json));
  // A row from an older answer format is skipped instead of breaking the whole conversation.
  return answer.success ? { userMessage: row.user_message, answer: answer.data, createdAt: row.created_at } : null;
}

// Oldest first, limited to the most recent `limit` turns when given.
export function getTurns(db: Db, conversationId: string, limit = -1): StoredTurn[] {
  const rows = db
    .prepare(
      `SELECT user_message, answer_json, created_at FROM (
         SELECT * FROM conversation_turns WHERE conversation_id = ? ORDER BY id DESC LIMIT ?
       ) ORDER BY id ASC`,
    )
    .all(conversationId, limit) as TurnRow[];
  return rows.map(toStoredTurn).filter((turn): turn is StoredTurn => turn !== null);
}
