import "dotenv/config";
import { createModelCaller } from "../agent/llmClient";
import { runAgent } from "../agent/runAgent";
import { openDatabase } from "../data/db";

// Try the agent from the terminal: npm run ask -- "Which Midwest hubs face the most winter risk?"
async function main() {
  const message = process.argv.slice(2).join(" ").trim();
  if (!message) throw new Error('Usage: npm run ask -- "your question"');
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY in backend/.env first.");

  const db = openDatabase(process.env.DB_PATH ?? "./data/weather.db");
  const result = await runAgent({ message, callModel: createModelCaller(), context: { db } });

  console.log(JSON.stringify(result.answer, null, 2));
  console.log(`\nTools used: ${result.toolCalls.map((call) => call.name).join(", ") || "none"}`);
  if (result.corrections.length > 0) console.log(`Corrections: ${result.corrections.join("; ")}`);
  console.log(`Tokens: ${result.usage.inputTokens} in, ${result.usage.outputTokens} out`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
