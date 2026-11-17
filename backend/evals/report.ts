import type { CheckResult } from "./checks";
import type { CaseResult } from "./runCase";

function label(passed: boolean): string {
  return passed ? "PASS" : "FAIL";
}

function checkLabel(check: CheckResult): string {
  if (check.skipped) return "skip";
  return check.passed ? "ok  " : "FAIL";
}

// Failing and skipped checks are always shown; passing ones only with --verbose, to keep the output readable.
export function formatCase(result: CaseResult, verbose: boolean): string {
  const tokens = result.turns.reduce((total, turn) => total + turn.tokens, 0);
  const run = result.run ? ` [run ${result.run}]` : "";
  const lines = [`[${label(result.passed)}] ${result.id}${run} - ${result.title}  (${result.source}, ${tokens} tokens)`];

  result.turns.forEach((turn, index) => {
    const shown = turn.checks.filter((check) => verbose || !check.passed || check.skipped);
    if (result.turns.length > 1 && shown.length > 0) lines.push(`     turn ${index + 1}: "${turn.ask}"`);
    if (turn.error) lines.push(`     agent error: ${turn.error}`);
    for (const check of shown) {
      lines.push(`     ${checkLabel(check)} ${check.description}`);
      lines.push(`          ${check.detail}`);
    }
    if (turn.corrections.length > 0) lines.push(`     note: code corrected the model: ${turn.corrections.join("; ")}`);
  });

  return lines.join("\n");
}

// With --repeat, one line per case shows how stable it is across runs.
function formatStability(results: CaseResult[]): string[] {
  const byCase = new Map<string, { passed: number; runs: number }>();
  for (const result of results) {
    const entry = byCase.get(result.id) ?? { passed: 0, runs: 0 };
    entry.runs++;
    if (result.passed) entry.passed++;
    byCase.set(result.id, entry);
  }
  if ([...byCase.values()].every((entry) => entry.runs === 1)) return [];
  return ["", "Stability per case:", ...[...byCase].map(([id, { passed, runs }]) => `  ${passed === runs ? "stable" : "FLAKY "} ${id}: ${passed}/${runs} runs passed`)];
}

export function formatSummary(results: CaseResult[]): string {
  const allChecks = results.flatMap((result) => result.turns.flatMap((turn) => turn.checks));
  const skipped = allChecks.filter((check) => check.skipped).length;
  const checksPassed = allChecks.filter((check) => check.passed && !check.skipped).length;
  const casesPassed = results.filter((result) => result.passed).length;
  const corrected = results.filter((result) => result.turns.some((turn) => turn.corrections.length > 0)).length;
  const tokens = results.reduce((total, result) => total + result.turns.reduce((sum, turn) => sum + turn.tokens, 0), 0);

  return [
    ...formatStability(results),
    "",
    `Cases:  ${casesPassed}/${results.length} passed`,
    `Checks: ${checksPassed}/${allChecks.length - skipped} passed${skipped > 0 ? `, ${skipped} skipped (precondition no longer true)` : ""}`,
    `Cases where code corrected the model: ${corrected}`,
    `Tokens used: ${tokens}`,
  ].join("\n");
}
