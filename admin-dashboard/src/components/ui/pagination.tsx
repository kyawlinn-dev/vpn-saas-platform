import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  page: number;
  totalPages: number;
  total: number;
  label: string;
  onPageChange: (page: number) => void;
  loading?: boolean;
  className?: string;
}

function getPageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | '…')[] = [1];

  if (current > 3) pages.push('…');

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push('…');

  pages.push(total);
  return pages;
}

export function Pagination({ page, totalPages, total, label, onPageChange, loading, className }: Props) {
  const pages = getPageNumbers(page, totalPages);

  return (
    <div className={cn('flex items-center justify-between gap-4 px-5 py-3 border-t border-border', className)}>
      <p className="text-sm text-muted-foreground">
        {total.toLocaleString()} {label}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || loading}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40 transition-colors"
        >
          <ChevronLeft size={15} />
        </button>

        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`ellipsis-${i}`} className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground text-sm">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              disabled={loading}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors disabled:pointer-events-none',
                p === page
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || loading}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40 transition-colors"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
