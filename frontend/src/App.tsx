import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ChatView } from "@/components/ChatView";
import { Overview } from "@/components/Overview";
import { TabBar, type Tab } from "@/components/TabBar";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { useChat } from "@/hooks/useChat";
import { useViewport } from "@/hooks/useViewport";

export default function App() {
  const [tab, setTab] = useState<Tab>("ask");
  const chat = useChat();
  const { height, keyboardOpen } = useViewport();
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Asking from the overview opens the chat and sends the question straight away.
  function ask(question: string) {
    setTab("ask");
    // One question at a time; say so rather than drop the tap silently.
    if (chat.isSending) {
      toast("Wait for the current answer, then ask about this hub.");
      return;
    }
    void chat.send(question);
  }

  // The "Ask the agent" bar: open the chat with the keyboard ready. iPhone Safari only raises the keyboard when the
  // focus happens inside the tap itself, so the chat is drawn synchronously first and focused right after.
  function openAsk() {
    flushSync(() => setTab("ask"));
    composerRef.current?.focus();
  }

  // Phone: one section at a time with a tab bar. Wide screen: the overview stays pinned beside the chat.
  const showOverview = tab === "overview" ? "flex" : "hidden";
  const showChat = tab === "ask" ? "flex" : "hidden";

  return (
    <div style={height ? { height } : undefined} className="flex h-dvh flex-col bg-background text-foreground lg:flex-row">
      <section aria-label="Hub exposure overview" className={`${showOverview} min-h-0 flex-1 flex-col lg:flex lg:w-[26rem] lg:flex-none lg:border-r`}>
        <Overview onAsk={ask} onOpenAsk={openAsk} />
      </section>
      <section aria-label="Chat with the agent" className={`${showChat} min-h-0 flex-1 flex-col lg:flex`}>
        <ChatView
          messages={chat.messages}
          isSending={chat.isSending}
          isRestoring={chat.isRestoring}
          onSend={(text) => void chat.send(text)}
          onNewChat={chat.startNewChat}
          composerRef={composerRef}
        />
      </section>
      <div className={`lg:hidden ${keyboardOpen ? "hidden" : ""}`}>
        <TabBar active={tab} onChange={setTab} />
      </div>
      <Toaster position="top-center" />
    </div>
  );
}
