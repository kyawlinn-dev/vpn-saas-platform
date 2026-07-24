import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type StatTone = 'cyan' | 'success' | 'warning' | 'rose' | 'violet' | 'blue';

// Maps each tone to the CSS custom property already defined (with separate
// light/dark values) in index.css, so the glow color and the surrounding
// glass tint both adapt correctly when the theme toggles instead of being
// hardcoded to one look.
const TONE_VAR: Record<StatTone, string> = {
  cyan: '--primary',
  success: '--success',
  warning: '--warning',
  rose: '--destructive',
  violet: '--brand-violet',
  blue: '--brand-blue',
};

interface GlowStatCardProps {
  label: string;
  icon?: ReactNode;
  value: string | number;
  unit?: string;
  caption?: string;
  tone?: StatTone;
  className?: string;
}

// The cyan "data limit" glass/glow treatment from the Mini App's PackageCard
// hero spec block, generalized into every Overview stat card. Built entirely
// from color-mix() against theme tokens (not literal rgba values like the
// Mini App's original) specifically so it looks right in both light and
// dark mode instead of always rendering a dark panel.
export function GlowStatCard({ label, icon, value, unit, caption, tone = 'cyan', className }: GlowStatCardProps) {
  const c = TONE_VAR[tone];
  const style: CSSProperties = {
    borderColor: `color-mix(in oklch, var(${c}) 30%, transparent)`,
    backgroundImage: [
      `radial-gradient(circle at 18% 20%, color-mix(in oklch, var(${c}) 20%, transparent), transparent 45%)`,
      `linear-gradient(135deg, color-mix(in oklch, var(${c}) 12%, transparent), color-mix(in oklch, var(--card) 92%, transparent))`,
    ].join(', '),
  };

  return (
    <div className={cn('overflow-hidden rounded-2xl border px-3.5 py-2.5', className)} style={style}>
      <span
        className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide"
        style={{ color: `color-mix(in oklch, var(${c}) 85%, var(--foreground))` }}
      >
        {icon}
        {label}
      </span>
      <p className="flex items-baseline gap-1 leading-none">
        <span className="truncate text-[24px] font-black tracking-normal" style={{ color: `var(${c})` }}>
          {value}
        </span>
        {unit && (
          <span className="text-[12px] font-black" style={{ color: `color-mix(in oklch, var(${c}) 90%, transparent)` }}>
            {unit}
          </span>
        )}
      </p>
      {caption && <p className="mt-1 truncate text-[10px] text-muted-foreground">{caption}</p>}
    </div>
  );
}
