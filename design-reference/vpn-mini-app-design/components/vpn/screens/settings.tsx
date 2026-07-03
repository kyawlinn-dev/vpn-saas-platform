'use client'

import {
  ChevronRight,
  FileText,
  HelpCircle,
  Info,
  Languages,
  LifeBuoy,
  ShieldCheck,
} from 'lucide-react'
import {
  BrandLogo,
  Chip,
  GlassCard,
  PageHeader,
} from '@/components/vpn/shared'
import { reseller, subscription } from '@/lib/vpn-data'

type Row = { icon: typeof Info; label: string; value?: string }

const supportRows: Row[] = [
  { icon: LifeBuoy, label: 'Contact Support' },
  { icon: HelpCircle, label: 'FAQ' },
]

const generalRows: Row[] = [
  { icon: Languages, label: 'Language', value: 'English' },
  { icon: ShieldCheck, label: 'Privacy Policy' },
  { icon: FileText, label: 'Terms of Service' },
  { icon: Info, label: 'About this Mini App' },
]

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Settings" onBack={onBack} />

      {/* Brand profile */}
      <GlassCard className="flex items-center gap-3 p-4">
        <BrandLogo size="lg" />
        <div>
          <p className="text-[16px] font-semibold text-foreground">{reseller.brandName}</p>
          <p className="text-[12px] text-muted-foreground">{reseller.subtitle}</p>
        </div>
      </GlassCard>

      {/* Subscription */}
      <GlassCard className="aurora-glow p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Current Plan
          </span>
          <Chip tone="success" icon={<span className="h-1.5 w-1.5 rounded-full bg-success" />}>
            Active
          </Chip>
        </div>
        <p className="text-[16px] font-semibold text-foreground">{subscription.plan}</p>
        <p className="text-[12px] text-muted-foreground">
          Valid until {subscription.validUntil}
        </p>
      </GlassCard>

      <Section title="Support" rows={supportRows} />
      <Section title="General" rows={generalRows} />

      <p className="pt-1 text-center text-[11px] text-muted-foreground">
        {reseller.brandName} · Mini App v1.0.0
      </p>
    </div>
  )
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section>
      <h4 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <div className="glass divide-y divide-border overflow-hidden rounded-[20px]">
        {rows.map(({ icon: Icon, label, value }) => (
          <button
            key={label}
            type="button"
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-secondary/40 active:bg-secondary/60"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/12 text-primary">
              <Icon size={17} />
            </span>
            <span className="flex-1 text-[14px] font-medium text-foreground">{label}</span>
            {value && <span className="text-[13px] text-muted-foreground">{value}</span>}
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
        ))}
      </div>
    </section>
  )
}
