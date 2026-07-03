'use client'

import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { ChevronLeft, Settings, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { reseller } from '@/lib/vpn-data'

/* ---------- Brand logo placeholder ---------- */
export function BrandLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'h-12 w-12' : size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'
  const icon = size === 'lg' ? 24 : size === 'sm' ? 16 : 20
  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-2xl',
        'bg-gradient-to-br from-primary to-cyan text-primary-foreground',
        'shadow-[0_0_20px_-2px_var(--primary)]',
        dims,
      )}
      aria-hidden="true"
    >
      <ShieldCheck size={icon} strokeWidth={2.4} />
    </div>
  )
}

/* ---------- Brand top bar (main tabs) ---------- */
export function BrandBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <header className="flex items-center gap-3">
      <BrandLogo />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-semibold leading-tight text-foreground">
          {reseller.brandName}
        </h1>
        <p className="truncate text-[12px] leading-tight text-muted-foreground">
          {reseller.subtitle}
        </p>
      </div>
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="Open settings"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-secondary/60 text-muted-foreground transition-colors hover:text-foreground active:scale-95"
      >
        <Settings size={18} />
      </button>
    </header>
  )
}

/* ---------- Sub-page header with back button ---------- */
export function PageHeader({
  title,
  onBack,
}: {
  title: string
  onBack: () => void
}) {
  return (
    <header className="flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="Go back"
        className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-secondary/60 text-foreground transition-colors hover:bg-secondary active:scale-95"
      >
        <ChevronLeft size={20} />
      </button>
      <h1 className="text-[18px] font-semibold text-foreground">{title}</h1>
    </header>
  )
}

/* ---------- Glass card ---------- */
export function GlassCard({
  className,
  children,
  glow = false,
  ...props
}: ComponentPropsWithoutRef<'div'> & { glow?: boolean }) {
  return (
    <div
      className={cn(
        'glass relative overflow-hidden rounded-[22px] p-4',
        glow && 'shadow-[0_10px_40px_-12px_var(--primary)]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/* ---------- Chip / tag ---------- */
const chipTones: Record<string, string> = {
  primary: 'bg-primary/15 text-primary border-primary/25',
  cyan: 'bg-cyan/15 text-cyan border-cyan/25',
  violet: 'bg-violet/15 text-violet border-violet/30',
  success: 'bg-success/15 text-success border-success/25',
  warning: 'bg-warning/15 text-warning border-warning/25',
  muted: 'bg-secondary/70 text-muted-foreground border-border',
}

export function Chip({
  children,
  tone = 'muted',
  className,
  icon,
}: {
  children: ReactNode
  tone?: keyof typeof chipTones
  className?: string
  icon?: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        chipTones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

export function tagTone(tag: string): keyof typeof chipTones {
  if (tag === 'Premium') return 'violet'
  if (tag === 'High Speed') return 'cyan'
  if (tag === 'Streaming') return 'primary'
  return 'muted'
}

/* ---------- Buttons ---------- */
export function PrimaryButton({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'flex h-12 w-full items-center justify-center gap-2 rounded-2xl',
        'bg-gradient-to-r from-primary to-cyan text-[15px] font-semibold text-primary-foreground',
        'shadow-[0_8px_24px_-8px_var(--primary)] transition-all',
        'hover:brightness-105 active:scale-[0.98] disabled:opacity-60',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'flex h-12 w-full items-center justify-center gap-2 rounded-2xl',
        'border border-border bg-secondary/60 text-[15px] font-semibold text-foreground',
        'transition-all hover:bg-secondary active:scale-[0.98]',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

/* ---------- Latency indicator ---------- */
export function LatencyBadge({ ms }: { ms: number }) {
  const tone = ms <= 28 ? 'text-success' : ms <= 38 ? 'text-cyan' : 'text-warning'
  const dot = ms <= 28 ? 'bg-success' : ms <= 38 ? 'bg-cyan' : 'bg-warning'
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[12px] font-medium', tone)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
      {ms} ms
    </span>
  )
}
