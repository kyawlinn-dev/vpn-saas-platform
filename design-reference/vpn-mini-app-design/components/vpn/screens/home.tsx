'use client'

import { ArrowRight, ChevronRight, Download, LifeBuoy, Share2, Wifi } from 'lucide-react'
import {
  BrandBar,
  Chip,
  GlassCard,
  LatencyBadge,
  PrimaryButton,
  tagTone,
} from '@/components/vpn/shared'
import { currentServer, subscription } from '@/lib/vpn-data'

function DataRing({ percent }: { percent: number }) {
  const size = 132
  const stroke = 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (percent / 100) * c

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--cyan)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--secondary)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[26px] font-semibold leading-none text-foreground">{percent}%</span>
        <span className="mt-1 text-[12px] font-medium text-muted-foreground">
          {subscription.dataUsedGb} / {subscription.dataTotalGb} GB
        </span>
      </div>
    </div>
  )
}

export function HomeScreen({
  onOpenSettings,
  onChangeServer,
  onAddKey,
  onShareKey,
  onSupport,
}: {
  onOpenSettings: () => void
  onChangeServer: () => void
  onAddKey: () => void
  onShareKey: () => void
  onSupport: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <BrandBar onOpenSettings={onOpenSettings} />

      {/* Main VPN access card */}
      <GlassCard glow className="aurora-glow">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success/15 text-success">
              <Wifi size={20} />
            </span>
            <div>
              <p className="text-[15px] font-semibold text-foreground">VPN Access Active</p>
              <p className="text-[12px] text-muted-foreground">{subscription.plan}</p>
            </div>
          </div>
          <Chip tone="success" icon={<span className="h-1.5 w-1.5 rounded-full bg-success" />}>
            Active
          </Chip>
        </div>

        <div className="my-4 flex flex-col items-center">
          <DataRing percent={subscription.usedPercent} />
          <p className="mt-3 text-[12px] text-muted-foreground">Data used this month</p>
        </div>

        <div className="mb-4 flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground">
          <span className="h-1 w-1 rounded-full bg-muted-foreground" />
          Valid until {subscription.validUntil}
        </div>

        <PrimaryButton onClick={onAddKey}>
          <Download size={18} />
          Add Key to Outline
        </PrimaryButton>
      </GlassCard>

      {/* Current server card */}
      <GlassCard className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
            Current Server
          </span>
          <button
            type="button"
            onClick={onChangeServer}
            className="flex items-center gap-0.5 text-[12px] font-semibold text-primary"
          >
            Change <ChevronRight size={14} />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">
            {currentServer.flag}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-foreground">
              {currentServer.country} / {currentServer.city}
            </p>
            <p className="text-[12px] text-muted-foreground">Server #{currentServer.number}</p>
          </div>
          <LatencyBadge ms={currentServer.latency} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {currentServer.tags.map((t) => (
            <Chip key={t} tone={tagTone(t)}>
              {t}
            </Chip>
          ))}
        </div>
      </GlassCard>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <QuickAction icon={<Share2 size={18} />} label="Share Key" onClick={onShareKey} />
        <QuickAction icon={<LifeBuoy size={18} />} label="Support" onClick={onSupport} />
      </div>
    </div>
  )
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass flex items-center justify-between rounded-[20px] px-4 py-3.5 text-left transition-all hover:brightness-110 active:scale-[0.98]"
    >
      <span className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary">
          {icon}
        </span>
        <span className="text-[14px] font-medium text-foreground">{label}</span>
      </span>
      <ArrowRight size={16} className="text-muted-foreground" />
    </button>
  )
}
