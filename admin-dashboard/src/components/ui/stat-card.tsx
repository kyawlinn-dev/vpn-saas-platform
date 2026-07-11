import { type ReactNode } from 'react';
import { Card } from './card';
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  value: string | number;
  icon?: ReactNode;
  accent?: 'default' | 'success' | 'warning' | 'destructive' | 'info';
  className?: string;
}

const accentMap = {
  default: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
  info: 'text-primary',
};

export function StatCard({ label, value, icon, accent = 'default', className }: Props) {
  return (
    <Card className={cn('p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={cn('mt-1 text-2xl font-bold font-display tracking-tight', accentMap[accent])}>
            {value}
          </p>
        </div>
        {icon && (
          <div className="shrink-0 rounded-lg bg-secondary p-2 text-muted-foreground">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
