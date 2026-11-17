import { ChevronRight, Sparkles } from "lucide-react";

// A search-field-style entry at the top of the Overview, so the AI agent is visible on the very first screen.
// Hidden on wide screens, where the chat already sits beside the Overview.
export function AskBar({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Ask the agent a question"
      className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-card px-4 text-left text-base text-muted-foreground ring-1 ring-foreground/10 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted lg:hidden"
    >
      <Sparkles aria-hidden className="size-5 shrink-0 text-link" />
      <span className="min-w-0 flex-1 truncate">Ask the agent about any hub…</span>
      <ChevronRight aria-hidden className="size-5 shrink-0" />
    </button>
  );
}
