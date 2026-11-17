import { ListOrdered, MessageCircle, type LucideIcon } from "lucide-react";

export type Tab = "overview" | "ask";

const TABS: { id: Tab; label: string; Icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", Icon: ListOrdered },
  { id: "ask", label: "Ask", Icon: MessageCircle },
];

interface TabBarProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

// A bottom tab bar like iOS. Each tab is well over 44 pt tall and the bar stays clear of the home indicator.
export function TabBar({ active, onChange }: TabBarProps) {
  return (
    <nav aria-label="Sections" className="flex border-t bg-card pb-[env(safe-area-inset-bottom)]">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-current={active === id ? "page" : undefined}
          className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            active === id ? "text-link" : "text-muted-foreground"
          }`}
        >
          <Icon aria-hidden className="size-6" />
          {label}
        </button>
      ))}
    </nav>
  );
}
