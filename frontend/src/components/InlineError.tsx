import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertCircle, RefreshCw } from "lucide-react";

interface InlineErrorProps {
  title: string;
  description?: string;
  loading?: boolean;
  onRetry?: () => void;
}

export function InlineError({
  title,
  description,
  loading = false,
  onRetry,
}: InlineErrorProps) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
    >
      <div className="flex min-w-0 items-center gap-2 text-destructive">
        <AlertCircle className="size-4 shrink-0" />
        <div>
          <p className="min-w-0 break-words font-medium">{title}</p>
          {description && (
            <p className="mt-0.5 min-w-0 break-words text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onRetry?.()}
          disabled={loading}
        >
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          重试
        </Button>
      )}
    </div>
  );
}
