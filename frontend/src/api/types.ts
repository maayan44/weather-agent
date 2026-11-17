// The shapes the backend returns (backend/src/agent/schemas.ts and backend/src/scoring/rankingView.ts).
// Copied on purpose, not imported: reaching into the backend folder can break a Vercel build, which only sees this folder.

export const HAZARDS = ["winter", "flood", "hurricane", "heat", "wind"] as const;
export type Hazard = (typeof HAZARDS)[number];
export type ScoreMetric = Hazard | "composite";
export type Confidence = "high" | "medium" | "low";

export interface RankingEntry {
  rank: number;
  hub_id: string;
  metric: ScoreMetric;
  score: number;
  note: string;
}

export interface Figure {
  label: string;
  value: number;
  unit: string;
}

export interface AgentAnswer {
  in_scope: boolean;
  answer: string;
  ranking: RankingEntry[];
  figures: Figure[];
  reasoning: string[];
  assumptions: string[];
  confidence: Confidence;
  data_gaps: string[];
}

export interface ChatResponse {
  conversation_id: string;
  answer: AgentAnswer;
}

export interface ConversationResponse {
  conversation_id: string;
  turns: { user_message: string; answer: AgentAnswer; created_at: string }[];
}

export interface HubRanking {
  rank: number;
  hub_id: string;
  hub: string;
  region: string;
  score: number;
  composite_score: number;
  dominant_hazard: Hazard | null;
  hazard_scores: Record<Hazard, number>;
}

export interface RankingResponse {
  ranked_by: ScoreMetric;
  region: string;
  data_window: string | null;
  ranking: HubRanking[];
}
