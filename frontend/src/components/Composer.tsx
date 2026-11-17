import { ArrowUp } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent, type Ref } from "react";
import { MAX_MESSAGE_LENGTH } from "@/config";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const SHOW_COUNTER_FROM = Math.floor(MAX_MESSAGE_LENGTH * 0.8);

interface ComposerProps {
  disabled: boolean;
  onSend: (text: string) => void;
  // "hero" is the large, inviting box on an empty chat; "compact" is the slim bar docked under a running conversation.
  variant?: "hero" | "compact";
  // Lets another screen focus the box, e.g. the Overview's "Ask the agent" bar.
  textareaRef?: Ref<HTMLTextAreaElement>;
}

export function Composer({ disabled, onSend, variant = "compact", textareaRef }: ComposerProps) {
  const [text, setText] = useState("");
  const canSend = text.trim().length > 0 && !disabled;
  const isHero = variant === "hero";

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSend) return;
    onSend(text);
    setText("");
  }

  // With a mouse and keyboard Enter sends. On a phone the keyboard's return key adds a new line, as in Messages.
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const hasKeyboard = window.matchMedia("(pointer: fine)").matches;
    if (event.key === "Enter" && !event.shiftKey && hasKeyboard) submit(event);
  }

  const field = (
    <Textarea
      ref={textareaRef}
      data-variant={variant}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={handleKeyDown}
      maxLength={MAX_MESSAGE_LENGTH}
      rows={isHero ? 3 : 1}
      aria-label="Ask about weather risk"
      placeholder={isHero ? "Ask anything about weather risk, for example which hubs to prioritize…" : "Ask about weather risk…"}
      className={
        isHero
          ? "max-h-56 min-h-24 resize-none border-0 bg-transparent px-1 py-1 text-[1.0625rem] shadow-none focus-visible:ring-0"
          : "max-h-36 min-h-11 flex-1 resize-none rounded-3xl bg-background px-4 py-2.5"
      }
    />
  );

  const send = (
    <Button type="submit" size="icon-lg" disabled={!canSend} aria-label="Send" className="rounded-full">
      <ArrowUp aria-hidden className="size-6" />
    </Button>
  );

  const counter = text.length >= SHOW_COUNTER_FROM ? `${text.length} / ${MAX_MESSAGE_LENGTH}` : "";

  if (isHero) {
    return (
      <form onSubmit={submit} className="rounded-3xl bg-card p-3 shadow-sm ring-1 ring-foreground/15 focus-within:ring-2 focus-within:ring-ring">
        {field}
        <div className="mt-2 flex items-center justify-between gap-3">
          <span aria-live="polite" className="px-1 text-sm text-muted-foreground tabular-nums">
            {counter}
          </span>
          {send}
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="border-t bg-card px-3 pt-2 pb-2">
      <div className="flex items-end gap-2">
        {field}
        {send}
      </div>
      {counter && (
        <p aria-live="polite" className="px-4 pt-1 text-right text-sm text-muted-foreground tabular-nums">
          {counter}
        </p>
      )}
    </form>
  );
}
