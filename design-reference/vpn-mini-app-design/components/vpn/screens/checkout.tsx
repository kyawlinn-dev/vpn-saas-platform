'use client'

import { useState } from 'react'
import { Check, Copy, Database, Sparkles, Timer, UploadCloud } from 'lucide-react'
import {
  Chip,
  GlassCard,
  PageHeader,
  PrimaryButton,
} from '@/components/vpn/shared'
import { cn } from '@/lib/utils'
import { formatPrice, paymentMethods, type Plan } from '@/lib/vpn-data'

export function CheckoutScreen({
  plan,
  onBack,
  onSubmit,
}: {
  plan: Plan
  onBack: () => void
  onSubmit: () => void
}) {
  const [method, setMethod] = useState(paymentMethods[0].id)
  const [copied, setCopied] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const [note, setNote] = useState('')

  const selectedMethod = paymentMethods.find((m) => m.id === method)!

  const copyAccount = async () => {
    try {
      await navigator.clipboard.writeText(selectedMethod.account)
    } catch {
      /* clipboard may be unavailable in preview */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Checkout" onBack={onBack} />

      {/* Selected plan summary */}
      <GlassCard glow className="aurora-glow p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-[16px] font-semibold text-foreground">{plan.name}</h3>
            {plan.popular && (
              <Chip tone="primary" icon={<Sparkles size={12} />}>
                Popular
              </Chip>
            )}
          </div>
          <div className="text-right">
            <p className="text-[18px] font-bold leading-none text-foreground">
              {plan.price.toLocaleString('en-US')}
            </p>
            <p className="text-[11px] text-muted-foreground">{plan.currency}</p>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-3 text-[12px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Database size={13} /> {plan.dataGb} GB
          </span>
          <span className="inline-flex items-center gap-1">
            <Timer size={13} /> {plan.days} Days
          </span>
        </div>
      </GlassCard>

      {/* Payment method */}
      <section>
        <h4 className="mb-2 text-[13px] font-semibold text-foreground">Payment Method</h4>
        <div className="grid grid-cols-3 gap-2">
          {paymentMethods.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMethod(m.id)}
              className={cn(
                'rounded-2xl border px-2 py-3 text-[12px] font-medium transition-colors',
                method === m.id
                  ? 'border-primary/50 bg-primary/15 text-primary'
                  : 'border-border bg-secondary/50 text-muted-foreground',
              )}
            >
              {m.name}
            </button>
          ))}
        </div>
      </section>

      {/* Selected account */}
      <GlassCard className="flex items-center justify-between p-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {selectedMethod.label}
          </p>
          <p className="mt-0.5 truncate font-mono text-[15px] font-semibold text-foreground">
            {selectedMethod.account}
          </p>
        </div>
        <button
          type="button"
          onClick={copyAccount}
          className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-[12px] font-semibold text-foreground transition-colors hover:bg-secondary active:scale-95"
        >
          {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </GlassCard>

      {/* Upload screenshot */}
      <button
        type="button"
        onClick={() => setUploaded((v) => !v)}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-[20px] border border-dashed px-4 py-6 text-center transition-colors',
          uploaded
            ? 'border-success/50 bg-success/10'
            : 'border-border bg-secondary/40 hover:bg-secondary/60',
        )}
      >
        <span
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-full',
            uploaded ? 'bg-success/15 text-success' : 'bg-primary/15 text-primary',
          )}
        >
          {uploaded ? <Check size={20} /> : <UploadCloud size={20} />}
        </span>
        <span className="text-[14px] font-medium text-foreground">
          {uploaded ? 'payment-screenshot.png' : 'Tap to upload'}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {uploaded ? 'Tap to replace' : 'PNG, JPG up to 10MB'}
        </span>
      </button>

      {/* Note */}
      <div>
        <label htmlFor="note" className="mb-2 block text-[13px] font-semibold text-foreground">
          Payment Note
        </label>
        <textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Optional note"
          className="w-full resize-none rounded-2xl border border-border bg-secondary/50 px-3.5 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
        />
      </div>

      <PrimaryButton onClick={onSubmit} className="mt-1">
        Submit Payment · {formatPrice(plan.price, plan.currency)}
      </PrimaryButton>
    </div>
  )
}
