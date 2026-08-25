import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import * as React from "react";

interface TextareaWithCounterProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Show the counter even when close to the limit (default: always when maxLength is set) */
  showCounter?: boolean;
}

/**
 * Textarea wrapper that displays a live character counter when `maxLength` is set.
 * The counter turns destructive when the user is within 10% of the limit.
 */
const TextareaWithCounter = React.forwardRef<
  HTMLTextAreaElement,
  TextareaWithCounterProps
>(
  (
    {
      className,
      showCounter = true,
      maxLength,
      value,
      defaultValue,
      onChange,
      ...props
    },
    ref,
  ) => {
    const isControlled = value !== undefined;
    const [internalValue, setInternalValue] = React.useState<string>(
      typeof defaultValue === "string" ? defaultValue : "",
    );

    const currentValue = isControlled ? String(value ?? "") : internalValue;
    const count = currentValue.length;

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!isControlled) {
        setInternalValue(e.target.value);
      }
      onChange?.(e);
    };

    const showCount = showCounter && maxLength != null;

    return (
      <div className="relative">
        <Textarea
          ref={ref}
          className={cn(showCount && "pb-6", className)}
          maxLength={maxLength}
          value={isControlled ? value : undefined}
          defaultValue={isControlled ? undefined : defaultValue}
          onChange={handleChange}
          {...props}
        />
        {showCount && (
          <span
            className={cn(
              "pointer-events-none absolute bottom-1.5 right-2 text-xs tabular-nums",
              count > (maxLength as number) * 0.9
                ? "text-destructive"
                : "text-muted-foreground",
            )}
            aria-hidden="true"
          >
            {count}
            {maxLength ? `/${maxLength}` : ""}
          </span>
        )}
      </div>
    );
  },
);
TextareaWithCounter.displayName = "TextareaWithCounter";

export { TextareaWithCounter };
