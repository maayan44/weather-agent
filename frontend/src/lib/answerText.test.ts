import { describe, expect, it } from "vitest";
import { makeAnswer } from "@/test/fixtures";
import { formatAnswerAsText, groupRanking } from "./answerText";

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

describe("formatAnswerAsText", () => {
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
