import { CircleAlert, CircleCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import { EXPOSURE_LABEL, type ExposureLevel } from "@/lib/exposure";

const CONFIG: Record<ExposureLevel, { Icon: LucideIcon; color: string }> = {
  high: { Icon: TriangleAlert, color: "text-bad" },
  moderate: { Icon: CircleAlert, color: "text-warn" },
  low: { Icon: CircleCheck, color: "text-muted-foreground" },
};

// A hazard's level as icon plus word, so it is never conveyed by color alone.
export function ExposureChip({ level }: { level: ExposureLevel }) {
  const { Icon, color } = CONFIG[level];
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium ${color}`}>
      <Icon aria-hidden className="size-4" />
      {EXPOSURE_LABEL[level]}
    </span>
  );
}
