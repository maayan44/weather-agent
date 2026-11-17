import { describe, expect, it } from "vitest";
import { API_TOOLS } from "../src/agent/tools";
import { HUB_IDS } from "../src/config/hubs";
import { EVAL_CASES, type Check } from "../evals/questions";

const allChecks: Check[] = EVAL_CASES.flatMap((evalCase) => evalCase.turns.flatMap((turn) => turn.checks));

// Guards the question file against typos, since a wrong hub id or tool name would make a case unpassable.
describe("eval question spec", () => {
  it("has 10 cases with unique ids", () => {
    expect(EVAL_CASES).toHaveLength(10);
    expect(new Set(EVAL_CASES.map((evalCase) => evalCase.id)).size).toBe(10);
  });

  it("gives every turn a question and at least one check", () => {
    for (const evalCase of EVAL_CASES) {
      expect(evalCase.turns.length).toBeGreaterThan(0);
      for (const turn of evalCase.turns) {
        expect(turn.ask.trim()).not.toBe("");
        expect(turn.checks.length).toBeGreaterThan(0);
      }
    }
  });

  it("only names hubs that exist", () => {
    const hubsNamed = allChecks.flatMap((check) => {
      if (check.kind === "ranking_hubs" || check.kind === "tie_acknowledged") return check.hubs;
      if (check.kind === "quotes_engine_score") return [check.hub];
      return [];
    });
    for (const hub of hubsNamed) expect(HUB_IDS).toContain(hub);
  });

  it("only expects tools that exist, with arguments those tools accept", () => {
    for (const check of allChecks) {
      if (check.kind !== "calls_tool") continue;
      const tool = API_TOOLS.find((candidate) => candidate.name === check.tool);
      expect(tool, `unknown tool ${check.tool}`).toBeDefined();

      const properties = (tool!.input_schema.properties ?? {}) as Record<string, { enum?: string[] }>;
      for (const [key, value] of Object.entries(check.input ?? {})) {
        expect(properties[key], `${check.tool} has no argument ${key}`).toBeDefined();
        if (properties[key].enum) expect(properties[key].enum).toContain(value);
      }
    }
  });
});
