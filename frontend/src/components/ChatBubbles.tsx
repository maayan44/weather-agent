import { RotateCcw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// The user's own message, on the right in the accent color like Messages.
export function UserBubble({ text }: { text: string }) {
  return (
    <div className="ml-auto max-w-[85%] rounded-3xl rounded-br-lg bg-primary px-4 py-2.5 text-[1.0625rem] leading-snug text-primary-foreground">
      {text}
    </div>
  );
}

// Shown while the agent works. A reply can take several seconds, so the page must visibly be doing something.
export function WorkingIndicator() {
  return (
    <Card role="status" aria-live="polite">
      <CardContent className="space-y-3">
        <p className="text-base text-muted-foreground">Checking the weather data…</p>
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-2 w-2/3 rounded-full" />
      </CardContent>
    </Card>
  );
}

interface ErrorNoticeProps {
  text: string;
  onRetry: (() => void) | null;
}

export function ErrorNotice({ text, onRetry }: ErrorNoticeProps) {
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription className="space-y-3 text-base">
        <p>{text}</p>
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            <RotateCcw aria-hidden className="size-5" />
            Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
