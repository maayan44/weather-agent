import { ChevronRight } from "lucide-react";
import type { HubRanking, ScoreMetric } from "@/api/types";
import { formatScore, HAZARD_ICON, HAZARD_LABEL } from "@/lib/hazards";

interface HubRowProps {
  row: HubRanking;
  metric: ScoreMetric;
  onAsk: (question: string) => void;
}

// What a tap asks the agent: a plain "why" question, so the explanation is one tap away from the ranking.
function questionFor(row: HubRanking, metric: ScoreMetric): string {
  const what = metric === "composite" ? "weather risk score" : `${HAZARD_LABEL[metric].toLowerCase()} risk score`;
  return `Why is ${row.hub}'s ${what} what it is?`;
}

function SecondLine({ row, metric }: { row: HubRanking; metric: ScoreMetric }) {
  if (metric !== "composite") {
    return <span>{row.region} · Overall {formatScore(row.composite_score)}</span>;
  }
  if (!row.dominant_hazard) return <span>{row.region} · No notable hazard</span>;

  const Icon = HAZARD_ICON[row.dominant_hazard];
  return (
    <span className="inline-flex items-center gap-1.5">
      {row.region} ·
      <Icon aria-hidden className="size-4" />
      Main: {HAZARD_LABEL[row.dominant_hazard]}
    </span>
  );
}

export function HubRow({ row, metric, onAsk }: HubRowProps) {
  const width = Math.min(100, Math.max(0, row.score));

  return (
    <li>
      <button
        type="button"
        onClick={() => onAsk(questionFor(row, metric))}
        aria-label={`${row.hub}, rank ${row.rank}, score ${formatScore(row.score)}. Ask the agent why.`}
        className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left ring-1 ring-foreground/10 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted"
      >
        <span aria-hidden className="w-6 shrink-0 text-center text-lg font-semibold text-muted-foreground tabular-nums">
          {row.rank}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[1.0625rem] font-semibold">{row.hub}</span>
            <span className="font-semibold tabular-nums">{formatScore(row.score)}</span>
          </span>
          <span className="mt-0.5 block text-sm text-muted-foreground">
            <SecondLine row={row} metric={metric} />
          </span>
          <span aria-hidden className="mt-2 block h-2 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-series" style={{ width: `${width}%` }} />
          </span>
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
}
