import { CircleAlert, CircleCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import type { Confidence } from "@/api/types";

const CONFIDENCE: Record<Confidence, { Icon: LucideIcon; label: string; hint: string; color: string }> = {
  high: { Icon: CircleCheck, label: "High confidence", hint: "A direct lookup with complete data.", color: "text-good" },
  medium: { Icon: CircleAlert, label: "Medium confidence", hint: "Depends on close scores or judgement.", color: "text-warn" },
  low: { Icon: TriangleAlert, label: "Low confidence", hint: "Data is missing or only partly answers this.", color: "text-bad" },
};

// Icon, words and an explanation together: the level is never conveyed by color alone.
export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const { Icon, label, hint, color } = CONFIDENCE[confidence];

  return (
    <div className="flex items-start gap-2.5">
      <Icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${color}`} />
      <p className="text-sm leading-snug">
        <span className="font-semibold">{label}</span>
        <span className="block text-muted-foreground">{hint}</span>
      </p>
    </div>
  );
}
