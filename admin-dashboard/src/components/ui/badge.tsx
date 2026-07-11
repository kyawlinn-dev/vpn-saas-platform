import { type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'bg-secondary text-muted-foreground',
        success: 'bg-success/15 text-success',
        warning: 'bg-warning/15 text-warning',
        destructive: 'bg-destructive/15 text-destructive',
        info: 'bg-primary/15 text-primary',
        outline: 'border border-border bg-transparent text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

interface Props extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: Props) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, 'success' | 'warning' | 'destructive' | 'info' | 'default'> = {
    active: 'success',
    paid: 'success',
    pending: 'warning',
    pending_review: 'warning',
    stopped: 'default',
    deleted: 'default',
    unpaid: 'default',
    overdue: 'destructive',
    expired: 'destructive',
    rejected: 'destructive',
    confirmed: 'success',
    provisioning: 'info',
    failed: 'destructive',
    error: 'destructive',
  };
  return (
    <Badge variant={variantMap[status] ?? 'default'}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}
