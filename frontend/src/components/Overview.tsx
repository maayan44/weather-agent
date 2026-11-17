import { useState } from "react";
import type { ScoreMetric } from "@/api/types";
import { HazardFilter } from "@/components/HazardFilter";
import { HubRow } from "@/components/HubRow";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRanking } from "@/hooks/useRanking";

interface OverviewProps {
  onAsk: (question: string) => void;
}

const HUB_COUNT = 10;

// The client's core question at a glance: which hubs are most exposed, and to what. No AI call, so it loads instantly.
export function Overview({ onAsk }: OverviewProps) {
  const [metric, setMetric] = useState<ScoreMetric>("composite");
  const { state, retry } = useRanking(metric);

  const window = state.status === "ready" ? state.data.data_window : null;
  const subtitle = window ? `Weather history ${window.replace(" to ", " – ")}. Higher score = more exposed.` : "Higher score = more exposed.";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader title="Hub exposure" subtitle={subtitle} />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        <div className="space-y-3">
          <HazardFilter value={metric} onChange={setMetric} />

          {state.status === "loading" && (
            <div aria-busy="true" aria-label="Loading hubs" className="space-y-2">
              {Array.from({ length: HUB_COUNT }, (_, index) => (
                <Skeleton key={index} className="h-16 w-full rounded-2xl" />
              ))}
            </div>
          )}

          {state.status === "error" && (
            <Alert variant="destructive" role="alert">
              <AlertDescription className="space-y-3 text-base">
                <p>{state.message}</p>
                <Button variant="outline" onClick={retry}>
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {state.status === "ready" && (
            <ol className="space-y-2">
              {state.data.ranking.map((row) => (
                <HubRow key={row.hub_id} row={row} metric={metric} onAsk={onAsk} />
              ))}
            </ol>
          )}

          <p className="px-1 pt-2 text-sm text-muted-foreground">
            Exposure scores come from the last 12 months of weather history and FEMA hazard records. They are not forecasts, cost
            estimates or investment advice. Tap a hub to ask why.
          </p>
        </div>
      </div>
    </div>
  );
}
