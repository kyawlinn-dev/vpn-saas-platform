import * as React from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZE_CLASSES = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

interface DialogProps {
  open: boolean;
  onClose: () => void;
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

function Dialog({ open, onClose, size = "md", children }: DialogProps) {
  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <BaseDialog.Popup
          className={cn(
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "w-full mx-4 bg-card text-card-foreground rounded-2xl border border-border shadow-xl",
            "max-sm:inset-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:left-0 max-sm:top-0 max-sm:rounded-none max-sm:mx-0",
            SIZE_CLASSES[size]
          )}
        >
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pb-3", className)} {...props} />;
}

function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <BaseDialog.Title
      className={cn("text-lg font-semibold pr-8", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <BaseDialog.Description
      className={cn("text-sm text-muted-foreground mt-1", className)}
      {...props}
    />
  );
}

function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("px-5 py-4 max-h-[70vh] overflow-auto", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex justify-end gap-2 p-5 pt-3", className)}
      {...props}
    />
  );
}

function DialogClose({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <BaseDialog.Close
      className={cn(
        "absolute top-4 right-4 h-7 w-7 rounded-lg inline-flex items-center justify-center",
        "text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      {...props}
    >
      <X className="h-4 w-4" />
    </BaseDialog.Close>
  );
}

export { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter, DialogClose };
