import Anthropic from "@anthropic-ai/sdk";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AgentError } from "../agent/types";
import { ApiError } from "./apiError";

interface ErrorBody {
  status: number;
  code: string;
  message: string;
}

// Internal details stay in the server log; the client only gets a safe message and a code.
function describeError(error: unknown): ErrorBody {
  if (error instanceof ApiError) return { status: error.status, code: error.code, message: error.message };
  if (error instanceof z.ZodError) return { status: 400, code: "invalid_request", message: z.prettifyError(error) };
  // express.json() throws this for a body that is not valid JSON.
  if (error instanceof SyntaxError && "status" in error) return { status: 400, code: "invalid_request", message: "Request body is not valid JSON." };
  if (error instanceof AgentError) return { status: 502, code: "agent_failed", message: `The agent could not answer: ${error.message}` };
  if (error instanceof Anthropic.RateLimitError) return { status: 503, code: "ai_busy", message: "The AI service is busy. Try again in a moment." };
  if (error instanceof Anthropic.APIError) return { status: 502, code: "ai_unavailable", message: "The AI service returned an error. Try again later." };
  return { status: 500, code: "internal_error", message: "Internal server error." };
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  const { status, code, message } = describeError(error);
  // Errors we raise on purpose (like "data still loading") are expected; only surprises are logged.
  if (status >= 500 && !(error instanceof ApiError)) console.error(error);
  res.status(status).json({ error: message, code });
}
