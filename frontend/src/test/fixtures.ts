import { vi } from "vitest";
import type { AgentAnswer, HubRanking, RankingResponse } from "@/api/types";

export function makeAnswer(overrides: Partial<AgentAnswer> = {}): AgentAnswer {
  return {
    in_scope: true,
    answer: "Minneapolis is the most exposed Midwest hub.",
    ranking: [],
    figures: [],
    reasoning: [],
    assumptions: [],
    confidence: "high",
    data_gaps: [],
    ...overrides,
  };
}

function hub(rank: number, id: string, name: string, region: string, score: number, dominant: HubRanking["dominant_hazard"]): HubRanking {
  return {
    rank,
    hub_id: id,
    hub: name,
    region,
    score,
    composite_score: score,
    dominant_hazard: dominant,
    hazard_scores: { winter: 0, flood: 0, hurricane: 0, heat: 0, wind: 0 },
  };
}

export const RANKING: RankingResponse = {
  ranked_by: "composite",
  region: "all regions",
  data_window: "2025-11-13 to 2026-11-12",
  ranking: [
    hub(1, "chicago", "Chicago", "Midwest", 36.3, "wind"),
    hub(2, "houston", "Houston", "Gulf Coast", 31.9, "flood"),
    hub(3, "atlanta", "Atlanta", "Southeast", 10.4, null),
  ],
};

type Reply = { status?: number; body: unknown };
// A route may answer later (a Promise), to test what happens while a request is still running.
type Route = (request: { body: any }) => Reply | Promise<Reply>;

// Replaces fetch with a fake backend. Routes match by path prefix; every call is recorded.
export function stubApi(routes: Record<string, Route>) {
  const calls: { path: string; body: any }[] = [];

  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const path = url.pathname + url.search;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, body });

    const key = Object.keys(routes).find((prefix) => path.startsWith(prefix));
    const reply: Reply = key ? await routes[key]({ body }) : { status: 404, body: { error: "not found", code: "not_found" } };
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { "content-type": "application/json" } });
  });

  return calls;
}
