import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const chipVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        primary: "bg-primary/10 text-primary border-primary/25",
        blue: "bg-brand-blue/10 text-[color:var(--brand-blue)] border-[color:var(--brand-blue)]/25",
        success: "bg-success/10 text-[color:var(--success)] border-success/25",
        warning: "bg-warning/10 text-[color:var(--warning)] border-warning/25",
        muted: "bg-secondary text-muted-foreground border-border",
      },
    },
    defaultVariants: {
      tone: "muted",
    },
  }
);

export interface ChipProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof chipVariants> {
  icon?: React.ReactNode;
}

function Chip({ className, tone, icon, children, ...props }: ChipProps) {
  return (
    <span className={cn(chipVariants({ tone }), className)} {...props}>
      {icon && icon}
      {children}
    </span>
  );
}

export { Chip, chipVariants };
