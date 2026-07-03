'use client'

import { Clock, Download, LifeBuoy, Home as HomeIcon, Share2, ShieldCheck } from 'lucide-react'
import {
  GlassCard,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
} from '@/components/vpn/shared'
import { formatPrice, subscription, type Plan } from '@/lib/vpn-data'

function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className={`text-[13px] font-semibold ${accent ?? 'text-foreground'}`}>{value}</span>
    </div>
  )
}

export function PaymentPendingScreen({
  plan,
  onBack,
  onHome,
  onSupport,
}: {
  plan: Plan
  onBack: () => void
  onHome: () => void
  onSupport: () => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Payment Status" onBack={onBack} />

      <div className="flex flex-col items-center pt-2 text-center">
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-warning/15 text-warning shadow-[0_0_40px_-6px_var(--warning)]">
          <Clock size={36} />
          <span className="absolute inset-0 animate-ping rounded-full border border-warning/40" />
        </div>
        <h2 className="mt-4 text-[19px] font-semibold text-foreground">Payment Submitted</h2>
        <p className="mt-1 max-w-[15rem] text-[13px] text-muted-foreground">
          Your payment is waiting for approval.
        </p>
      </div>

      <GlassCard className="px-4 py-1">
        <SummaryRow label="Plan" value={plan.name} />
        <div className="h-px bg-border" />
        <SummaryRow label="Amount" value={formatPrice(plan.price, plan.currency)} />
        <div className="h-px bg-border" />
        <SummaryRow label="Transaction ID" value="#PMT-250601-9821" />
        <div className="h-px bg-border" />
        <SummaryRow label="Status" value="Pending" accent="text-warning" />
      </GlassCard>

      <p className="rounded-2xl border border-border bg-secondary/40 px-4 py-3 text-center text-[12px] text-muted-foreground">
        You will be notified when your payment is approved.
      </p>

      <div className="flex flex-col gap-3">
        <PrimaryButton onClick={onHome}>
          <HomeIcon size={18} />
          Back to Home
        </PrimaryButton>
        <SecondaryButton onClick={onSupport}>
          <LifeBuoy size={18} />
          Contact Support
        </SecondaryButton>
      </div>
    </div>
  )
}

export function PaymentApprovedScreen({
  plan,
  onBack,
  onAddKey,
  onShareKey,
}: {
  plan: Plan
  onBack: () => void
  onAddKey: () => void
  onShareKey: () => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Payment Status" onBack={onBack} />

      <div className="flex flex-col items-center pt-2 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/15 text-success shadow-[0_0_40px_-6px_var(--success)]">
          <ShieldCheck size={38} />
        </div>
        <h2 className="mt-4 text-[19px] font-semibold text-foreground">Payment Approved</h2>
        <p className="mt-1 max-w-[15rem] text-[13px] text-muted-foreground">
          Your VPN key is ready to use.
        </p>
      </div>

      <GlassCard className="px-4 py-1">
        <SummaryRow label="Plan" value={plan.name} />
        <div className="h-px bg-border" />
        <SummaryRow label="Amount" value={formatPrice(plan.price, plan.currency)} />
        <div className="h-px bg-border" />
        <SummaryRow label="Valid Until" value={subscription.validUntil} />
        <div className="h-px bg-border" />
        <SummaryRow label="Status" value="Approved" accent="text-success" />
      </GlassCard>

      <div className="flex flex-col gap-3">
        <PrimaryButton onClick={onAddKey}>
          <Download size={18} />
          Add Key to Outline
        </PrimaryButton>
        <SecondaryButton onClick={onShareKey}>
          <Share2 size={18} />
          Share Key
        </SecondaryButton>
      </div>
    </div>
  )
}
