import { PARTIAL_YEAR_PERIODS } from "../scoring/weatherStats";

export const PARTIAL_PERIOD_NOTE =
  "Note: this period is shorter than a year, so it can leave out seasons such as winter; the 3-year average scores show the full picture.";

// Any sign in the answer that the reader is told about missing seasons or looking at a full year.
const ALREADY_WARNS = /season|winter|full year|12[- ]month|3[- ]year|twelve months/i;

interface ToolCall {
  input: unknown;
}

// A window like "the past six months" can hold no winter at all, and the reader on a phone sees only the first
// paragraph. If a short period was used and that paragraph does not mention it, code adds the warning, so it
// never depends on the model remembering.
export function needsPartialPeriodNote(toolCalls: ToolCall[], answerText: string): boolean {
  const usedShortPeriod = toolCalls.some((call) => {
    const period = (call.input as { period?: unknown } | null)?.period;
    return typeof period === "string" && (PARTIAL_YEAR_PERIODS as readonly string[]).includes(period);
  });
  return usedShortPeriod && !ALREADY_WARNS.test(answerText);
}
