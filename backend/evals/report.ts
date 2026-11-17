import type { CaseResult } from "./runCase";

function label(passed: boolean): string {
  return passed ? "PASS" : "FAIL";
}

// Failing checks are always shown; passing ones only with --verbose, to keep the output readable.
export function formatCase(result: CaseResult, verbose: boolean): string {
  const tokens = result.turns.reduce((total, turn) => total + turn.tokens, 0);
  const lines = [`[${label(result.passed)}] ${result.id} - ${result.title}  (${result.source}, ${tokens} tokens)`];

  result.turns.forEach((turn, index) => {
    const failed = turn.checks.filter((check) => !check.passed);
    if (result.turns.length > 1 && (verbose || failed.length > 0)) lines.push(`     turn ${index + 1}: "${turn.ask}"`);
    if (turn.error) lines.push(`     agent error: ${turn.error}`);
    for (const check of verbose ? turn.checks : failed) {
      lines.push(`     ${check.passed ? "ok  " : "FAIL"} ${check.description}`);
      if (!check.passed || verbose) lines.push(`          ${check.detail}`);
    }
    if (turn.corrections.length > 0) lines.push(`     note: model needed corrections: ${turn.corrections.join("; ")}`);
  });

  return lines.join("\n");
}

export function formatSummary(results: CaseResult[]): string {
  const allChecks = results.flatMap((result) => result.turns.flatMap((turn) => turn.checks));
  const casesPassed = results.filter((result) => result.passed).length;
  const checksPassed = allChecks.filter((check) => check.passed).length;
  const corrected = results.filter((result) => result.turns.some((turn) => turn.corrections.length > 0)).length;
  const tokens = results.reduce((total, result) => total + result.turns.reduce((sum, turn) => sum + turn.tokens, 0), 0);

  return [
    "",
    `Cases:  ${casesPassed}/${results.length} passed`,
    `Checks: ${checksPassed}/${allChecks.length} passed`,
    `Cases where code had to correct the model: ${corrected}`,
    `Tokens used: ${tokens}`,
  ].join("\n");
}
