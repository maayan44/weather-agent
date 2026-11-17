import { useCallback, useEffect, useState } from "react";
import { fetchRanking } from "@/api/client";
import type { RankingResponse, ScoreMetric } from "@/api/types";
import { friendlyMessage } from "@/lib/friendlyError";

type RankingState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: RankingResponse };

// A finished request, tagged with the request it answered, so an old answer is never shown for a newer choice.
type Result = { key: string } & ({ data: RankingResponse } | { message: string });

// Loads the overview ranking whenever the chosen score changes. This calls no AI, so it is instant and free.
export function useRanking(metric: ScoreMetric) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const key = `${metric}:${attempt}`;

  useEffect(() => {
    let cancelled = false;

    fetchRanking(metric)
      .then((data) => !cancelled && setResult({ key, data }))
      .catch((error) => !cancelled && setResult({ key, message: friendlyMessage(error) }));

    return () => {
      cancelled = true;
    };
  }, [metric, key]);

  // Loading is simply "no finished result for the current request yet".
  let state: RankingState = { status: "loading" };
  if (result?.key === key) state = "data" in result ? { status: "ready", data: result.data } : { status: "error", message: result.message };

  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  return { state, retry };
}
