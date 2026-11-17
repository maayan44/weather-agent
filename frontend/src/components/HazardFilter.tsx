import { Gauge } from "lucide-react";
import { HAZARDS, type ScoreMetric } from "@/api/types";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { HAZARD_ICON, metricLabel } from "@/lib/hazards";

interface HazardFilterProps {
  value: ScoreMetric;
  onChange: (metric: ScoreMetric) => void;
}

const OPTIONS: ScoreMetric[] = ["composite", ...HAZARDS];

// A segmented control that scrolls sideways on a narrow phone. One choice is always selected.
export function HazardFilter({ value, onChange }: HazardFilterProps) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      <ToggleGroup
        type="single"
        variant="outline"
        value={value}
        onValueChange={(next) => next && onChange(next as ScoreMetric)}
        aria-label="Rank hubs by"
      >
        {OPTIONS.map((option) => {
          const Icon = option === "composite" ? Gauge : HAZARD_ICON[option];
          return (
            <ToggleGroupItem key={option} value={option} className="shrink-0 gap-2">
              <Icon aria-hidden className="size-5" />
              {metricLabel(option)}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </div>
  );
}
