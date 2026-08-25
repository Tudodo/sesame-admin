import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import * as React from "react";

interface ConfirmOptions {
  title?: string;
  content?: string;
  okText?: string;
  cancelText?: string;
  okVariant?: "default" | "destructive";
}

let confirmContainer: HTMLDivElement | null = null;

function getContainer() {
  if (!confirmContainer) {
    confirmContainer = document.createElement("div");
    document.body.appendChild(confirmContainer);
  }
  return confirmContainer;
}

export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const container = getContainer();
    const root = document.createElement("div");
    container.appendChild(root);

    let reactRoot: import("react-dom/client").Root | null = null;
    const cleanup = () => {
      reactRoot?.unmount();
      reactRoot = null;
      root.remove();
    };

    const handleConfirm = () => {
      cleanup();
      resolve(true);
    };

    const handleCancel = () => {
      cleanup();
      resolve(false);
    };

    import("react-dom/client").then(({ createRoot }) => {
      reactRoot = createRoot(root);
      reactRoot.render(
        <ConfirmDialog
          options={options}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />,
      );
    });
  });
}

function ConfirmDialog({
  options,
  onConfirm,
  onCancel,
}: {
  options: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [open, setOpen] = React.useState(true);
  const resolvedRef = React.useRef(false);

  const handleClose = (result: boolean) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    setOpen(false);
    // Radix Dialog exit animation uses duration-200 (200ms). Waiting the
    // full duration before unmounting ensures the fade-out completes
    // smoothly instead of snapping out of view.
    setTimeout(() => (result ? onConfirm() : onCancel()), 200);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose(false)}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{options.title || "确认操作"}</DialogTitle>
          {options.content && (
            <DialogDescription>{options.content}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            {options.cancelText || "取消"}
          </Button>
          <Button
            variant={
              options.okVariant === "destructive" ? "destructive" : "default"
            }
            onClick={() => handleClose(true)}
          >
            {options.okText || "确定"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
