import type { RequestHandler } from "express";
import { toIsoDate } from "../data/dateRange";

// A ceiling on paid chat calls across ALL clients per UTC day, so one abuser with many addresses
// cannot drain the credits. Kept in memory: a restart resets it, which errs on the side of availability.
export function createDailyLimit(limitPerDay: number, now: () => Date = () => new Date()): RequestHandler {
  let day = "";
  let used = 0;

  return (_req, res, next) => {
    const today = toIsoDate(now());
    if (today !== day) {
      day = today;
      used = 0;
    }
    if (used >= limitPerDay) {
      res.status(429).json({ error: "The daily chat limit for this demo has been reached. Try again tomorrow.", code: "daily_limit_reached" });
      return;
    }
    used++;
    next();
  };
}
