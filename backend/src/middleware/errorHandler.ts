import Anthropic from "@anthropic-ai/sdk";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AgentError, AiUnavailableError } from "../agent/types";
import { ApiError } from "./apiError";

interface ErrorBody {
  status: number;
  code: string;
  message: string;
}

// Plain wording for the UI, e.g. "message: Too big: expected string to have <=1000 characters".
function describeValidation(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`).join("; ");
}

// Express's own errors (body too large, bad JSON, unsupported encoding) carry a safe status and message.
function isClientHttpError(error: unknown): error is { status: number; message: string; expose: boolean } {
  if (!error || typeof error !== "object") return false;
  const { status, expose } = error as { status?: unknown; expose?: unknown };
  return typeof status === "number" && status >= 400 && status < 500 && expose === true;
}

// Internal details stay in the server log; the client only gets a safe message and a code.
function describeError(error: unknown): ErrorBody {
  if (error instanceof ApiError) return { status: error.status, code: error.code, message: error.message };
  if (error instanceof z.ZodError) return { status: 400, code: "invalid_request", message: describeValidation(error) };
  if (error instanceof SyntaxError && isClientHttpError(error)) return { status: 400, code: "invalid_request", message: "Request body is not valid JSON." };
  if (isClientHttpError(error)) {
    return { status: error.status, code: error.status === 413 ? "payload_too_large" : "invalid_request", message: error.message };
  }
  if (error instanceof AgentError) return { status: 502, code: "agent_failed", message: `The agent could not answer: ${error.message}` };
  if (error instanceof Anthropic.RateLimitError) return { status: 503, code: "ai_busy", message: "The AI service is busy. Try again in a moment." };
  // Covers API errors and setup problems such as a missing key: the server log has the detail.
  if (error instanceof Anthropic.AnthropicError || error instanceof AiUnavailableError) {
    return { status: 502, code: "ai_unavailable", message: "The AI service is unavailable. Try again later." };
  }
  return { status: 500, code: "internal_error", message: "Internal server error." };
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  const { status, code, message } = describeError(error);
  // Errors we raise on purpose (like "data still loading") are expected; only surprises are logged.
  if (status >= 500 && !(error instanceof ApiError)) console.error(error);
  res.status(status).json({ error: message, code });
}
