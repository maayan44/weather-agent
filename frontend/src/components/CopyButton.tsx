import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Lets an analyst paste the answer straight into a report or email.
export function CopyButton({ text }: { text: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Answer copied");
    } catch {
      // Clipboard access needs a secure page and the user's permission.
      toast.error("Couldn't copy. Select the text and copy it instead.");
    }
  }

  return (
    <Button variant="ghost" onClick={copy} className="-ml-3 text-muted-foreground">
      <Copy aria-hidden className="size-5" />
      Copy answer
    </Button>
  );
}
