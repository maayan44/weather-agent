import { describe, expect, it } from "vitest";
import { runAgent } from "../src/agent/runAgent";
import { needsPartialPeriodNote, PARTIAL_PERIOD_NOTE } from "../src/agent/periodWarning";
import { createSeededDb } from "./helpers/seedDatabase";
import { answerTurn, makeAnswer, scriptedModel, toolUseTurn } from "./helpers/scriptedModel";

const call = (period: string) => ({ input: { hub: "chicago", period } });

describe("needsPartialPeriodNote", () => {
  it("is needed when a period under a year was used and the paragraph says nothing about seasons", () => {
    expect(needsPartialPeriodNote([call("last_6_months")], "Chicago had little weather stress.")).toBe(true);
    for (const period of ["last_30_days", "last_3_months", "last_6_months", "year_to_date"]) {
      expect(needsPartialPeriodNote([call(period)], "A calm stretch.")).toBe(true);
    }
  });

  it("is not needed when the paragraph already warns", () => {
    expect(needsPartialPeriodNote([call("last_6_months")], "This window misses winter.")).toBe(false);
    expect(needsPartialPeriodNote([call("last_6_months")], "Only half the seasons are covered.")).toBe(false);
    expect(needsPartialPeriodNote([call("last_3_months")], "Compared with the full year, it is calm.")).toBe(false);
    expect(needsPartialPeriodNote([call("last_30_days")], "The 12-month score is higher.")).toBe(false);
  });

  it("is not needed for a full-year period, or when no period was used", () => {
    expect(needsPartialPeriodNote([call("last_12_months")], "All fine.")).toBe(false);
    expect(needsPartialPeriodNote([call("last_calendar_year")], "All fine.")).toBe(false);
    expect(needsPartialPeriodNote([call("last_winter")], "All fine.")).toBe(false);
    expect(needsPartialPeriodNote([{ input: { hub: "chicago" } }], "All fine.")).toBe(false);
    expect(needsPartialPeriodNote([], "All fine.")).toBe(false);
  });

  it("copes with odd tool inputs", () => {
    expect(needsPartialPeriodNote([{ input: null }, { input: "text" }, { input: { period: 5 } }], "x")).toBe(false);
  });
});

describe("the warning in a finished answer", () => {
  const context = { db: createSeededDb() };
  const today = new Date("2026-11-17T12:00:00Z");
  const sixMonths = toolUseTurn([{ id: "t1", name: "get_snowfall_total", input: { hub: "chicago", period: "last_6_months" } }]);

  it("is appended to the answer text when the model left it out, and recorded", async () => {
    const { callModel } = scriptedModel([sixMonths, answerTurn(makeAnswer({ answer: "Chicago had little weather stress." }))]);
    const result = await runAgent({ message: "past half year in Chicago?", callModel, context, today });
    expect(result.answer.answer).toBe(`Chicago had little weather stress. ${PARTIAL_PERIOD_NOTE}`);
    expect(result.corrections).toContain("added a warning that the period leaves out seasons");
  });

  it("is left out when the model already said it", async () => {
    const { callModel } = scriptedModel([sixMonths, answerTurn(makeAnswer({ answer: "That window misses winter, so look at the 12-month score." }))]);
    const result = await runAgent({ message: "past half year in Chicago?", callModel, context, today });
    expect(result.answer.answer).toBe("That window misses winter, so look at the 12-month score.");
    expect(result.corrections).not.toContain("added a warning that the period leaves out seasons");
  });

  it("is not added to an answer that used no short period", async () => {
    const fullYear = toolUseTurn([{ id: "t1", name: "get_snowfall_total", input: { hub: "chicago", period: "last_12_months" } }]);
    const { callModel } = scriptedModel([fullYear, answerTurn(makeAnswer({ answer: "A full year of data." }))]);
    const result = await runAgent({ message: "past year?", callModel, context, today });
    expect(result.answer.answer).toBe("A full year of data.");
  });
});
