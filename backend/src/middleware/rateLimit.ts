import rateLimit from "express-rate-limit";

// Limits per client address, because every /chat call costs real money.
export function createChatRateLimiter(limitPerMinute: number) {
  return rateLimit({
    windowMs: 60_000,
    limit: limitPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: "Too many requests. Please wait a minute.", code: "rate_limited" });
    },
  });
}
