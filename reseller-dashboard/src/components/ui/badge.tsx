import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground border-border",
        primary: "bg-primary/10 text-primary border-primary/25",
        success: "bg-success/10 text-[color:var(--success)] border-success/25",
        warning: "bg-warning/10 text-[color:var(--warning)] border-warning/25",
        destructive: "bg-destructive/10 text-destructive border-destructive/25",
        info: "bg-brand-blue/10 text-[color:var(--brand-blue)] border-[color:var(--brand-blue)]/25",
        outline: "border-border text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
