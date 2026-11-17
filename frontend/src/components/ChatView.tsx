import { SquarePen } from "lucide-react";
import { useEffect, useRef, type Ref } from "react";
import { AnswerCard } from "@/components/AnswerCard";
import { ErrorNotice, UserBubble, WorkingIndicator } from "@/components/ChatBubbles";
import { Composer } from "@/components/Composer";
import { Logo } from "@/components/Logo";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChatMessage } from "@/hooks/useChat";
import { STARTER_QUESTIONS } from "@/lib/starterQuestions";

interface ChatViewProps {
  messages: ChatMessage[];
  isSending: boolean;
  isRestoring: boolean;
  onSend: (text: string) => void;
  onNewChat: () => void;
  composerRef: Ref<HTMLTextAreaElement>;
}

// An empty chat: one greeting, the large input, and two quiet example questions. Nothing else competes with the input.
function EmptyState({ onSend, composerRef }: { onSend: (text: string) => void; composerRef: Ref<HTMLTextAreaElement> }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-5 pb-[10vh]">
      <div className="flex items-center justify-center gap-3">
        <Logo size={36} />
        <h2 className="text-2xl font-semibold tracking-tight">Hey, how can we help you today?</h2>
      </div>

      <Composer variant="hero" disabled={false} onSend={onSend} textareaRef={composerRef} />

      <div className="flex flex-col gap-2">
        {STARTER_QUESTIONS.map((question) => (
          <Button
            key={question}
            variant="ghost"
            onClick={() => onSend(question)}
            className="h-auto min-h-11 justify-start rounded-xl px-3 py-2.5 text-left font-normal whitespace-normal text-muted-foreground"
          >
            {question}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function ChatView({ messages, isSending, isRestoring, onSend, onNewChat, composerRef }: ChatViewProps) {
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view; respect the user's Reduce Motion setting.
  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "end" });
  }, [messages, isSending]);

  const isEmpty = messages.length === 0 && !isSending && !isRestoring;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader
        title="WeatherHub"
        subtitle="Prioritize hub resilience before the storm hits."
        action={
          messages.length > 0 ? (
            <Button variant="ghost" size="icon" onClick={onNewChat} aria-label="New chat" className="shrink-0 text-link">
              <SquarePen aria-hidden className="size-6" />
            </Button>
          ) : undefined
        }
      />

      <div role="log" aria-live="polite" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-4">
          {isRestoring && <Skeleton className="h-24 w-full rounded-xl" />}
          {isEmpty && <EmptyState onSend={onSend} composerRef={composerRef} />}
          {messages.map((message) => {
            if (message.role === "user") return <UserBubble key={message.id} text={message.text} />;
            if (message.role === "agent") return <AnswerCard key={message.id} answer={message.answer} toolsUsed={message.toolsUsed} />;
            const retryText = message.retryText;
            return <ErrorNotice key={message.id} text={message.text} onRetry={retryText ? () => onSend(retryText) : null} />;
          })}
          {isSending && <WorkingIndicator />}
          <div ref={endRef} />
        </div>
      </div>

      {/* Once a conversation is running, the input shrinks to a slim bar that stays out of the way. */}
      {!isEmpty && <Composer variant="compact" disabled={isSending} onSend={onSend} textareaRef={composerRef} />}
    </div>
  );
}
