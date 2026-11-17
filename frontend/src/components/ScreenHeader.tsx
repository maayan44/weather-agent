import type { ReactNode } from "react";

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

// An Apple-style large title. The top padding keeps it clear of the notch.
export function ScreenHeader({ title, subtitle, action }: ScreenHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
      <div className="min-w-0">
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
