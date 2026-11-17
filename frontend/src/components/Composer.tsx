import { ArrowUp } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { MAX_MESSAGE_LENGTH } from "@/config";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const SHOW_COUNTER_FROM = Math.floor(MAX_MESSAGE_LENGTH * 0.8);

interface ComposerProps {
  disabled: boolean;
  onSend: (text: string) => void;
}

export function Composer({ disabled, onSend }: ComposerProps) {
  const [text, setText] = useState("");
  const canSend = text.trim().length > 0 && !disabled;

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

  return (
    <form onSubmit={submit} className="border-t bg-card px-3 pt-2 pb-2">
      <div className="flex items-end gap-2">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={1}
          aria-label="Ask about weather risk"
          placeholder="Ask about weather risk…"
          className="max-h-36 min-h-11 flex-1 resize-none rounded-3xl bg-background px-4 py-2.5"
        />
        <Button type="submit" size="icon-lg" disabled={!canSend} aria-label="Send" className="rounded-full">
          <ArrowUp aria-hidden className="size-6" />
        </Button>
      </div>
      {text.length >= SHOW_COUNTER_FROM && (
        <p aria-live="polite" className="px-4 pt-1 text-right text-sm text-muted-foreground tabular-nums">
          {text.length} / {MAX_MESSAGE_LENGTH}
        </p>
      )}
    </form>
  );
}
