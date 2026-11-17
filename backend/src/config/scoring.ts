// Every number that shapes a risk score lives here, so the logic can be reviewed and tuned in one file.
// Each metric turns into 0-100 on a straight line: `zeroAt` scores 0, `hundredAt` scores 100, values beyond are clamped.
// Fixed anchors (not relative to other hubs) keep a hub's score stable when the others change.

// Also the tie-break order when two hazards score the same.
export const HAZARDS = ["winter", "flood", "hurricane", "heat", "wind"] as const;

export type Hazard = (typeof HAZARDS)[number];

export type MetricId =
  | "snowDays"
  | "totalSnowfall"
  | "freezingDays"
  | "inlandFloodFrequency"
  | "coastalFloodFrequency"
  | "heavyRainDays"
  | "hurricaneFrequency"
  | "hotDays"
  | "extremeHotDays"
  | "gustDays"
  | "severeGustDays";

export interface MetricConfig {
  id: MetricId;
  label: string;
  unit: string;
  zeroAt: number;
  hundredAt: number;
  weight: number; // share inside its hazard; shares of one hazard sum to 1
}

export interface HazardConfig {
  weight: number; // share of the composite; shares across hazards sum to 1
  metrics: MetricConfig[];
}

// What counts as "a day" for each metric.
export const DAY_THRESHOLDS = {
  snowDayInches: 1,
  freezingMaxTempF: 32,
  heavyRainInches: 1,
  hotMaxTempF: 95,
  extremeHotMaxTempF: 105,
  gustMph: 40,
  severeGustMph: 50,
};

// For "what % of days had snow" questions; filters out trace amounts.
export const SNOWFALL_DAY_MIN_INCHES = 0.1;
export const MEASURABLE_RAIN_INCHES = 0.01;

export const SCORING_WINDOW_DAYS = 365;
// Below this share of the window we still score, but flag the gap.
export const MIN_DATA_COVERAGE = 0.9;

export const HAZARD_CONFIG: Record<Hazard, HazardConfig> = {
  winter: {
    weight: 0.25,
    metrics: [
      { id: "snowDays", label: "Days with snow of 1 in or more", unit: "days", zeroAt: 0, hundredAt: 12, weight: 1 / 3 },
      { id: "totalSnowfall", label: "Total snowfall", unit: "in", zeroAt: 0, hundredAt: 40, weight: 1 / 3 },
      { id: "freezingDays", label: "Days that never rose above 32°F", unit: "days", zeroAt: 0, hundredAt: 70, weight: 1 / 3 },
    ],
  },
  flood: {
    weight: 0.2,
    metrics: [
      { id: "inlandFloodFrequency", label: "FEMA inland flood frequency", unit: "events/yr", zeroAt: 0, hundredAt: 8, weight: 0.4 },
      { id: "coastalFloodFrequency", label: "FEMA coastal flood frequency", unit: "events/yr", zeroAt: 0, hundredAt: 4, weight: 0.3 },
      { id: "heavyRainDays", label: "Days with 1 in of rain or more", unit: "days", zeroAt: 0, hundredAt: 25, weight: 0.3 },
    ],
  },
  hurricane: {
    weight: 0.2,
    metrics: [
      { id: "hurricaneFrequency", label: "FEMA hurricane frequency", unit: "events/yr", zeroAt: 0, hundredAt: 0.3, weight: 1 },
    ],
  },
  heat: {
    weight: 0.2,
    metrics: [
      { id: "hotDays", label: "Days at or above 95°F", unit: "days", zeroAt: 0, hundredAt: 120, weight: 0.5 },
      { id: "extremeHotDays", label: "Days at or above 105°F", unit: "days", zeroAt: 0, hundredAt: 40, weight: 0.5 },
    ],
  },
  wind: {
    weight: 0.15,
    metrics: [
      { id: "gustDays", label: "Days with gusts of 40 mph or more", unit: "days", zeroAt: 0, hundredAt: 30, weight: 0.5 },
      { id: "severeGustDays", label: "Days with gusts of 50 mph or more", unit: "days", zeroAt: 0, hundredAt: 8, weight: 0.5 },
    ],
  },
};
