import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createModelCaller } from "../src/agent/llmClient";
import { HUBS } from "../src/config/hubs";
import { openDatabase } from "../src/data/db";
import { ingestAll } from "../src/data/ingestion";
import { isDataReady } from "../src/data/readiness";
import { EVAL_CASES } from "./questions";
import { formatCase, formatSummary } from "./report";
import { runEvalCase, type CaseResult } from "./runCase";

// Usage: npm run eval [-- --only id1,id2] [-- --repeat 3] [-- --verbose]
function parseArguments(args: string[]) {
  const valueAfter = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const repeat = Number(valueAfter("--repeat") ?? 1);
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 10) throw new Error("--repeat must be a whole number from 1 to 10");
  return { verbose: args.includes("--verbose"), only: valueAfter("--only")?.split(","), repeat };
}

async function main() {
  const { verbose, only, repeat } = parseArguments(process.argv.slice(2));
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY in backend/.env first.");

  const cases = only ? EVAL_CASES.filter((evalCase) => only.includes(evalCase.id)) : EVAL_CASES;
  if (cases.length === 0) throw new Error(`No case matches. Known ids: ${EVAL_CASES.map((evalCase) => evalCase.id).join(", ")}`);

  const db = openDatabase(process.env.DB_PATH ?? "./data/weather.db");
  if (!isDataReady(db, HUBS)) {
    console.log("Cache is empty, downloading weather data first...");
    await ingestAll(db, HUBS);
  }

  const callModel = createModelCaller();
  const results: CaseResult[] = [];
  const times = repeat > 1 ? ` x ${repeat} runs` : "";
  console.log(`Running ${cases.length} eval case(s)${times} with ${process.env.ANTHROPIC_MODEL ?? "the default model"}...\n`);

  // One at a time: cases are few, and this stays well inside API rate limits.
  // Repeats show flakiness: the model's wording varies between runs even when the data does not.
  for (let run = 1; run <= repeat; run++) {
    for (const evalCase of cases) {
      const result = { ...(await runEvalCase(evalCase, { callModel, db })), run: repeat > 1 ? run : undefined };
      results.push(result);
      console.log(formatCase(result, verbose));
    }
  }

  console.log(formatSummary(results));

  // The full answers are saved so a failure can be read in detail without paying for another run.
  const outputPath = path.join(__dirname, "results", "latest.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ ranAt: new Date().toISOString(), model: process.env.ANTHROPIC_MODEL ?? "default", results }, null, 2));
  console.log(`Details saved to ${path.relative(process.cwd(), outputPath)}`);

  if (results.some((result) => !result.passed)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
