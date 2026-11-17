// US units throughout (inches, mph, °F) since the analysts are US-based.

export interface DailyWeather {
  hubId: string;
  date: string; // local calendar day, YYYY-MM-DD
  snowfallInches: number;
  precipitationInches: number;
  windGustMph: number;
  tempMaxF: number;
  tempMinF: number;
}

// Events per year from FEMA's historical record. 0 means FEMA lists the hazard as not applicable.
export interface HubHazards {
  hubId: string;
  hurricaneAnnualFrequency: number;
  coastalFloodAnnualFrequency: number;
  inlandFloodAnnualFrequency: number;
}
