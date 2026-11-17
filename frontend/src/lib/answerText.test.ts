import { describe, expect, it } from "vitest";
import { makeAnswer } from "@/test/fixtures";
import { asHubProfile, formatAnswerAsText, groupRanking } from "./answerText";

const entry = (hub_id: string, metric: "winter" | "flood", score: number, rank: number) => ({ rank, hub_id, metric, score, note: "" });

describe("groupRanking", () => {
  it("groups entries by score and keeps the order the model gave", () => {
    const groups = groupRanking([entry("miami", "flood", 46.5, 2), entry("houston", "winter", 0, 1), entry("houston", "flood", 83.9, 1)]);
    expect(groups.map((group) => group.metric)).toEqual(["flood", "winter"]);
    expect(groups[0].entries.map((item) => item.hub_id)).toEqual(["miami", "houston"]);
  });

  it("returns no groups for an answer without a ranking", () => {
    expect(groupRanking([])).toEqual([]);
  });
});

const scoreEntry = (hub_id: string, metric: "composite" | "winter" | "flood" | "wind", score: number) => ({ rank: 1, hub_id, metric, score, note: "" });

describe("asHubProfile", () => {
  const chicago = [scoreEntry("chicago", "wind", 79.2), scoreEntry("chicago", "composite", 36.3), scoreEntry("chicago", "flood", 44), scoreEntry("chicago", "winter", 59.9)];

  it("treats one hub shown for several scores as a profile: overall first, then hazards from highest to lowest", () => {
    const profile = asHubProfile(groupRanking(chicago));
    expect(profile?.hubId).toBe("chicago");
    expect(profile?.entries.map((entry) => entry.metric)).toEqual(["composite", "wind", "winter", "flood"]);
  });

  it("is not a profile when two hubs share a score (a normal ranking)", () => {
    expect(asHubProfile(groupRanking([entry("houston", "flood", 83.9, 1), entry("miami", "flood", 46.5, 2)]))).toBeNull();
  });

  it("is not a profile when different hubs appear across scores (a comparison)", () => {
    expect(asHubProfile(groupRanking([entry("houston", "flood", 83.9, 1), scoreEntry("miami", "wind", 6.7)]))).toBeNull();
  });

  it("is not a profile for a single score", () => {
    expect(asHubProfile(groupRanking([scoreEntry("chicago", "composite", 36.3)]))).toBeNull();
  });

  it("is not a profile when a hub appears twice under one score", () => {
    expect(asHubProfile(groupRanking([scoreEntry("chicago", "wind", 1), scoreEntry("chicago", "wind", 2), scoreEntry("chicago", "flood", 3)]))).toBeNull();
  });
});

describe("formatAnswerAsText", () => {
  it("writes a hub profile as one list of scores", () => {
    const text = formatAnswerAsText(makeAnswer({ answer: "Chicago is mostly exposed to wind.", ranking: [scoreEntry("chicago", "wind", 79.2), scoreEntry("chicago", "composite", 36.3)] }));
    expect(text).toContain("Chicago scores:\n- Overall: 36.3\n- Wind: 79.2");
    expect(text).not.toContain("Wind score:");
  });

  it("writes a plain-text version with every section that has content", () => {
    const text = formatAnswerAsText(
      makeAnswer({
        answer: "Houston is most exposed to flooding.",
        ranking: [entry("houston", "flood", 83.9, 1), entry("los-angeles", "flood", 44.5, 2)],
        figures: [{ label: "Rain days", value: 26, unit: "days" }],
        reasoning: ["Heavy rain on 26 days."],
        assumptions: ["Last 12 months."],
        data_gaps: ["County-level FEMA data."],
        confidence: "medium",
      }),
    );

    expect(text).toContain("Houston is most exposed to flooding.");
    expect(text).toContain("Flood score:");
    expect(text).toContain("1. Houston: 83.9");
    expect(text).toContain("2. Los Angeles: 44.5");
    expect(text).toContain("- Rain days: 26 days");
    expect(text).toContain("Why:\n- Heavy rain on 26 days.");
    expect(text).toContain("Assumptions:\n- Last 12 months.");
    expect(text).toContain("Data gaps and limits:\n- County-level FEMA data.");
    expect(text).toContain("Confidence: medium");
  });

  it("leaves out sections that are empty", () => {
    const text = formatAnswerAsText(makeAnswer({ answer: "Short answer." }));
    expect(text).not.toContain("Why:");
    expect(text).not.toContain("Assumptions:");
    expect(text).toBe("Short answer.\n\nConfidence: high");
  });
});
