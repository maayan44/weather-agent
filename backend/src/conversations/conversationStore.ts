import { checkedAnswerSchema } from "../agent/schemas";
import type { ConversationTurn } from "../agent/runAgent";
import type { Db } from "../data/db";

// The tools the agent called, so the UI can show them again after a reload.
export interface SavedTurn extends ConversationTurn {
  toolsUsed: string[];
}

export interface StoredTurn extends SavedTurn {
  createdAt: string;
}

interface TurnRow {
  user_message: string;
  answer_json: string;
  tools_json: string;
  created_at: string;
}

export function saveTurn(db: Db, conversationId: string, turn: SavedTurn, now = new Date()): void {
  db.prepare(
    "INSERT INTO conversation_turns (conversation_id, user_message, answer_json, tools_json, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(conversationId, turn.userMessage, JSON.stringify(turn.answer), JSON.stringify(turn.toolsUsed), now.toISOString());
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function toStoredTurn(row: TurnRow): StoredTurn | null {
  const answer = checkedAnswerSchema.safeParse(parseJson(row.answer_json));
  // A damaged row or one from an older answer format is skipped instead of breaking the whole conversation.
  if (!answer.success) return null;
  const tools = parseJson(row.tools_json);
  const toolsUsed = Array.isArray(tools) ? tools.filter((tool): tool is string => typeof tool === "string") : [];
  return { userMessage: row.user_message, answer: answer.data, toolsUsed, createdAt: row.created_at };
}

// Oldest first, limited to the most recent `limit` turns when given.
export function getTurns(db: Db, conversationId: string, limit = -1): StoredTurn[] {
  const rows = db
    .prepare(
      `SELECT user_message, answer_json, tools_json, created_at FROM (
         SELECT * FROM conversation_turns WHERE conversation_id = ? ORDER BY id DESC LIMIT ?
       ) ORDER BY id ASC`,
    )
    .all(conversationId, limit) as TurnRow[];
  return rows.map(toStoredTurn).filter((turn): turn is StoredTurn => turn !== null);
}
