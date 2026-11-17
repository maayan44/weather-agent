import { Router } from "express";
import { HUBS } from "../config/hubs";

export const hubsRouter = Router();

hubsRouter.get("/hubs", (_req, res) => {
  res.json({ hubs: HUBS });
});
