import { HAZARD_CONFIG, type Hazard } from "../config/scoring";
import { METRIC_EXTRACTORS } from "./metrics";
import { scaleToScore } from "./normalize";
import type { MetricResult, ScoringInput, SubScore } from "./types";

// The sub-score is the weighted average of its metrics; each metric is kept for the explanation.
export function computeSubScore(hazard: Hazard, input: ScoringInput): SubScore {
  const { weight, metrics: metricConfigs } = HAZARD_CONFIG[hazard];

  const metrics: MetricResult[] = metricConfigs.map((metric) => {
    const rawValue = METRIC_EXTRACTORS[metric.id](input);
    return {
      id: metric.id,
      label: metric.label,
      unit: metric.unit,
      rawValue,
      score: scaleToScore(rawValue, metric.zeroAt, metric.hundredAt),
      weight: metric.weight,
    };
  });

  const score = metrics.reduce((total, metric) => total + metric.score * metric.weight, 0);
  return { hazard, score, weight, metrics };
}
