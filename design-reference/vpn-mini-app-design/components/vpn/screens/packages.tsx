'use client'

import { Check, Database, Sparkles, Timer } from 'lucide-react'
import {
  BrandBar,
  Chip,
  GlassCard,
  PrimaryButton,
} from '@/components/vpn/shared'
import { cn } from '@/lib/utils'
import { formatPrice, plans, subscription, type Plan } from '@/lib/vpn-data'

export function PackagesScreen({
  onOpenSettings,
  onBuy,
}: {
  onOpenSettings: () => void
  onBuy: (plan: Plan) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <BrandBar onOpenSettings={onOpenSettings} />

      <div>
        <h2 className="text-[18px] font-semibold text-foreground">Choose Your Plan</h2>
        <p className="text-[13px] text-muted-foreground">
          Secure private access with this reseller
        </p>
      </div>

      {/* Current plan compact card */}
      <GlassCard className="flex items-center justify-between p-3.5">
        <div>
          <p className="text-[14px] font-semibold text-foreground">{subscription.plan}</p>
          <p className="text-[12px] text-muted-foreground">
            Valid until {subscription.validUntil}
          </p>
        </div>
        <Chip tone="success" icon={<span className="h-1.5 w-1.5 rounded-full bg-success" />}>
          Active
        </Chip>
      </GlassCard>

      <div className="flex flex-col gap-3">
        {plans.map((plan) => (
          <PackageCard key={plan.id} plan={plan} onBuy={() => onBuy(plan)} />
        ))}
      </div>
    </div>
  )
}

function PackageCard({ plan, onBuy }: { plan: Plan; onBuy: () => void }) {
  return (
    <GlassCard
      glow={plan.popular}
      className={cn(
        'p-4',
        plan.popular ? 'border-primary/40 aurora-glow' : '',
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[16px] font-semibold text-foreground">{plan.name}</h3>
            {plan.popular && (
              <Chip tone="primary" icon={<Sparkles size={12} />}>
                Popular
              </Chip>
            )}
          </div>
          <div className="mt-2 flex items-center gap-3 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Database size={13} /> {plan.dataGb} GB
            </span>
            <span className="inline-flex items-center gap-1">
              <Timer size={13} /> {plan.days} Days
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[18px] font-bold leading-none text-foreground">
            {plan.price.toLocaleString('en-US')}
          </p>
          <p className="text-[11px] text-muted-foreground">{plan.currency}</p>
        </div>
      </div>

      <ul className="my-4 space-y-2">
        {plan.features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-[13px] text-foreground/90">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-success/15 text-success">
              <Check size={11} strokeWidth={3} />
            </span>
            {f}
          </li>
        ))}
      </ul>

      <PrimaryButton
        onClick={onBuy}
        className={cn(
          'h-11',
          !plan.popular &&
            'bg-none border border-border bg-secondary/60 text-foreground shadow-none hover:bg-secondary',
        )}
      >
        Buy Now · {formatPrice(plan.price, plan.currency)}
      </PrimaryButton>
    </GlassCard>
  )
}
