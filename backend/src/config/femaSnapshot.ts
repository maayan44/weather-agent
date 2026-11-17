import type { HubHazards } from "../data/types";

// FEMA NRI annualized frequencies, copied from the live service on 2026-11-17.
// Used only when FEMA cannot be reached and nothing is stored yet, so a fresh server never stays stuck.
export const FEMA_SNAPSHOT: HubHazards[] = [
  { hubId: "chicago", hurricaneAnnualFrequency: 0.00929, coastalFloodAnnualFrequency: 0.01209, inlandFloodAnnualFrequency: 5.89286 },
  { hubId: "minneapolis", hurricaneAnnualFrequency: 0, coastalFloodAnnualFrequency: 0, inlandFloodAnnualFrequency: 1.53571 },
  { hubId: "detroit", hurricaneAnnualFrequency: 0.01094, coastalFloodAnnualFrequency: 0.01459, inlandFloodAnnualFrequency: 3.14286 },
  { hubId: "denver", hurricaneAnnualFrequency: 0, coastalFloodAnnualFrequency: 0, inlandFloodAnnualFrequency: 0.82143 },
  { hubId: "dallas", hurricaneAnnualFrequency: 0.01153, coastalFloodAnnualFrequency: 0, inlandFloodAnnualFrequency: 4.60714 },
  { hubId: "houston", hurricaneAnnualFrequency: 0.18361, coastalFloodAnnualFrequency: 3.76067, inlandFloodAnnualFrequency: 5.14286 },
  { hubId: "miami", hurricaneAnnualFrequency: 0.30497, coastalFloodAnnualFrequency: 2.25024, inlandFloodAnnualFrequency: 4 },
  { hubId: "atlanta", hurricaneAnnualFrequency: 0.038, coastalFloodAnnualFrequency: 0, inlandFloodAnnualFrequency: 2.71429 },
  { hubId: "phoenix", hurricaneAnnualFrequency: 0.01154, coastalFloodAnnualFrequency: 0, inlandFloodAnnualFrequency: 8.46429 },
  { hubId: "los-angeles", hurricaneAnnualFrequency: 0, coastalFloodAnnualFrequency: 2.16944, inlandFloodAnnualFrequency: 3.96429 },
];
