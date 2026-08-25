import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import * as React from "react";

interface RequiredLabelProps
  extends React.ComponentPropsWithoutRef<typeof Label> {
  /** Whether the field is required (renders the asterisk) */
  required?: boolean;
}

/**
 * Label wrapper that renders a visible asterisk for required fields
 * and communicates "required" to screen readers via sr-only text.
 */
const RequiredLabel = React.forwardRef<
  React.ElementRef<typeof Label>,
  RequiredLabelProps
>(({ className, required = false, children, ...props }, ref) => (
  <Label ref={ref} className={cn(className)} {...props}>
    {children}
    {required && (
      <>
        <span className="text-destructive" aria-hidden="true">
          {" *"}
        </span>
        <span className="sr-only">（必填）</span>
      </>
    )}
  </Label>
));
RequiredLabel.displayName = "RequiredLabel";

export { RequiredLabel };
