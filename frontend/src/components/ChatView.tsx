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

// An empty chat: the large input is the main thing on the screen, with example questions underneath.
function EmptyState({ onSend, composerRef }: { onSend: (text: string) => void; composerRef: Ref<HTMLTextAreaElement> }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 pt-2">
      <div className="space-y-2 text-center">
        <div className="flex justify-center">
          <Logo size={64} />
        </div>
        <h2 className="text-xl font-semibold">Which hubs need resilience investment?</h2>
        <p className="text-base text-muted-foreground">
          Ask in plain English. Every number comes from a fixed scoring formula on weather history, not from the AI's memory.
        </p>
      </div>

      <Composer variant="hero" disabled={false} onSend={onSend} textareaRef={composerRef} />

      <div className="flex flex-col gap-2">
        <p className="px-1 text-sm font-medium text-muted-foreground">Or try one of these</p>
        {STARTER_QUESTIONS.map((question) => (
          <Button key={question} variant="outline" onClick={() => onSend(question)} className="h-auto min-h-11 justify-start py-3 text-left whitespace-normal">
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
        title="Ask the agent"
        subtitle="Answers come with confidence, assumptions and data gaps."
        action={
          messages.length > 0 ? (
            <Button variant="ghost" size="icon" onClick={onNewChat} aria-label="New chat" className="shrink-0 text-link">
              <SquarePen aria-hidden className="size-6" />
            </Button>
          ) : undefined
        }
      />

      <div role="log" aria-live="polite" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {isRestoring && <Skeleton className="h-24 w-full rounded-xl" />}
          {isEmpty && <EmptyState onSend={onSend} composerRef={composerRef} />}
          {messages.map((message) => {
            if (message.role === "user") return <UserBubble key={message.id} text={message.text} />;
            if (message.role === "agent") return <AnswerCard key={message.id} answer={message.answer} />;
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
