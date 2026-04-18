import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose: () => void;
};

export function UpdateToast({
  title,
  description,
  actionLabel,
  onAction,
  onClose,
}: Props) {
  return (
    <div className="fixed bottom-6 right-6 z-50 w-[360px] rounded-lg border bg-card p-4 shadow-card-hover">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-semibold">{title}</div>
            <button
              onClick={onClose}
              aria-label="Закрыть"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="text-xs text-muted-foreground">{description}</div>
          {actionLabel && onAction && (
            <div className="pt-2">
              <Button size="sm" onClick={onAction}>
                {actionLabel}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
