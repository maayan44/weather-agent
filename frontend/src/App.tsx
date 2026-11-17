import { useState } from "react";
import { ChatView } from "@/components/ChatView";
import { Overview } from "@/components/Overview";
import { TabBar, type Tab } from "@/components/TabBar";
import { Toaster } from "@/components/ui/sonner";
import { useChat } from "@/hooks/useChat";
import { useViewport } from "@/hooks/useViewport";

export default function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const chat = useChat();
  const { height, keyboardOpen } = useViewport();

  // Asking from the overview opens the chat and sends the question straight away.
  function ask(question: string) {
    setTab("ask");
    void chat.send(question);
  }

  // Phone: one section at a time with a tab bar. Wide screen: the overview stays pinned beside the chat.
  const showOverview = tab === "overview" ? "flex" : "hidden";
  const showChat = tab === "ask" ? "flex" : "hidden";

  return (
    <div style={height ? { height } : undefined} className="flex h-dvh flex-col bg-background text-foreground lg:flex-row">
      <section aria-label="Hub exposure overview" className={`${showOverview} min-h-0 flex-1 flex-col lg:flex lg:w-[26rem] lg:flex-none lg:border-r`}>
        <Overview onAsk={ask} />
      </section>
      <section aria-label="Chat with the agent" className={`${showChat} min-h-0 flex-1 flex-col lg:flex`}>
        <ChatView
          messages={chat.messages}
          isSending={chat.isSending}
          isRestoring={chat.isRestoring}
          onSend={(text) => void chat.send(text)}
          onNewChat={chat.startNewChat}
        />
      </section>
      <div className={`lg:hidden ${keyboardOpen ? "hidden" : ""}`}>
        <TabBar active={tab} onChange={setTab} />
      </div>
      <Toaster position="top-center" />
    </div>
  );
}
