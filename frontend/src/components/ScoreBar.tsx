import { formatScore } from "@/lib/hazards";

interface ScoreBarProps {
  label: string;
  value: number; // 0-100
}

// One hub's score as a thin bar anchored at zero. The number is printed too, so color is never the only signal.
export function ScoreBar({ label, value }: ScoreBarProps) {
  const width = Math.min(100, Math.max(0, value));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-base font-medium">{label}</span>
        <span className="font-semibold tabular-nums">{formatScore(value)}</span>
      </div>
      <div
        role="meter"
        aria-label={`${label}: ${formatScore(value)} out of 100`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-series" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
