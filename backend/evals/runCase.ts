import { runAgent, type ConversationTurn } from "../src/agent/runAgent";
import type { AgentAnswer } from "../src/agent/schemas";
import type { ModelCaller } from "../src/agent/types";
import type { Db } from "../src/data/db";
import { describeCheck, evaluateCheck, type CheckResult } from "./checks";
import type { EvalCase } from "./questions";

export interface TurnResult {
  ask: string;
  answer?: AgentAnswer;
  toolsUsed: string[];
  corrections: string[];
  tokens: number;
  checks: CheckResult[];
  // Set when the agent itself failed; every check of that turn then counts as failed.
  error?: string;
}

export interface CaseResult {
  id: string;
  title: string;
  source: string;
  passed: boolean;
  turns: TurnResult[];
}

interface Dependencies {
  callModel: ModelCaller;
  db: Db;
  today?: Date;
}

// Runs one case. Conversation history lives in memory, so evals never touch the saved chats.
export async function runEvalCase(evalCase: EvalCase, { callModel, db, today }: Dependencies): Promise<CaseResult> {
  const history: ConversationTurn[] = [];
  const turns: TurnResult[] = [];

  for (const turn of evalCase.turns) {
    try {
      const run = await runAgent({ message: turn.ask, history, callModel, context: { db }, today });
      history.push({ userMessage: turn.ask, answer: run.answer });
      turns.push({
        ask: turn.ask,
        answer: run.answer,
        toolsUsed: run.toolCalls.map((call) => call.name),
        corrections: run.corrections,
        tokens: run.usage.inputTokens + run.usage.outputTokens,
        checks: turn.checks.map((check) => evaluateCheck(check, run, db)),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      turns.push({
        ask: turn.ask,
        toolsUsed: [],
        corrections: [],
        tokens: 0,
        error: message,
        checks: turn.checks.map((check) => ({ description: describeCheck(check), passed: false, detail: `agent failed: ${message}` })),
      });
      break; // later turns of this case depend on this one
    }
  }

  const passed = turns.length === evalCase.turns.length && turns.every((turn) => turn.checks.every((check) => check.passed));
  return { id: evalCase.id, title: evalCase.title, source: evalCase.source, passed, turns };
}
