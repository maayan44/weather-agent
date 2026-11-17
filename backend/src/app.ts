import cors from "cors";
import express from "express";
import type { ModelCaller } from "./agent/types";
import { API_CONFIG } from "./config/api";
import type { Db } from "./data/db";
import { createDailyLimit } from "./middleware/dailyLimit";
import { errorHandler } from "./middleware/errorHandler";
import { createChatRateLimiter } from "./middleware/rateLimit";
import { createChatRouter } from "./routes/chat";
import { createConversationsRouter } from "./routes/conversations";
import { createHealthRouter } from "./routes/health";
import { createRankingRouter } from "./routes/ranking";
import { hubsRouter } from "./routes/hubs";

export interface AppDependencies {
  db: Db;
  callModel: ModelCaller;
  chatRateLimitPerMinute?: number;
  chatDailyLimit?: number;
}

// Built from its dependencies (not globals) so tests can plug in a scripted model and an in-memory DB.
export function createApp({
  db,
  callModel,
  chatRateLimitPerMinute = API_CONFIG.chatRateLimitPerMinute,
  chatDailyLimit = API_CONFIG.chatDailyLimit,
}: AppDependencies) {
  const app = express();
  // Railway sits behind a proxy; without this every client would look like the same address to the rate limiter.
  app.set("trust proxy", 1);
  app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? "*" }));
  app.use(express.json({ limit: "10kb" }));

  app.use(createHealthRouter(db));
  app.use(hubsRouter);
  app.use(createRankingRouter(db));
  // Per-client limit first, so one noisy client cannot use up the shared daily budget.
  const limits = [createChatRateLimiter(chatRateLimitPerMinute), createDailyLimit(chatDailyLimit)];
  app.use(createChatRouter({ db, callModel, limits }));
  app.use(createConversationsRouter(db));

  app.use(errorHandler);
  return app;
}
