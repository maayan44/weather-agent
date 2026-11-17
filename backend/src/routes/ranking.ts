import { Router } from "express";
import { z } from "zod";
import { HUBS, REGIONS } from "../config/hubs";
import { HAZARDS } from "../config/scoring";
import type { Db } from "../data/db";
import { isDataReady } from "../data/readiness";
import { ApiError } from "../middleware/apiError";
import { buildRankingView } from "../scoring/rankingView";

const rankingQuerySchema = z.object({
  region: z.enum(REGIONS).optional(),
  hazard: z.enum(HAZARDS).optional(),
});

// The same ranking the agent uses, with no AI call: instant and free, so a screen can show it on load.
export function createRankingRouter(db: Db) {
  const router = Router();

  router.get("/ranking", (req, res) => {
    const { region, hazard } = rankingQuerySchema.parse(req.query);
    if (!isDataReady(db, HUBS)) {
      throw new ApiError(503, "data_loading", "Weather data is still loading. Try again in a minute.");
    }
    res.json(buildRankingView(db, region, hazard));
  });

  return router;
}
