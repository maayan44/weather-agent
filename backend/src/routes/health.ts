import { Router } from "express";
import { HUBS } from "../config/hubs";
import type { Db } from "../data/db";
import { isDataReady } from "../data/readiness";

export function createHealthRouter(db: Db) {
  const router = Router();

  // The server is "ok" as soon as it listens; data_ready says whether chat can answer yet.
  router.get("/health", (_req, res) => {
    res.json({ status: "ok", data_ready: isDataReady(db, HUBS) });
  });

  return router;
}
