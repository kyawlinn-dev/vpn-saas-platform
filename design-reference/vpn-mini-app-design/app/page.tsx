'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { BottomNav, type MainTab } from '@/components/vpn/bottom-nav'
import { HomeScreen } from '@/components/vpn/screens/home'
import { ServersScreen } from '@/components/vpn/screens/servers'
import { PackagesScreen } from '@/components/vpn/screens/packages'
import { CheckoutScreen } from '@/components/vpn/screens/checkout'
import {
  PaymentApprovedScreen,
  PaymentPendingScreen,
} from '@/components/vpn/screens/payment-status'
import { SettingsScreen } from '@/components/vpn/screens/settings'
import { plans, type Plan } from '@/lib/vpn-data'

type Screen =
  | 'home'
  | 'servers'
  | 'packages'
  | 'checkout'
  | 'pending'
  | 'approved'
  | 'settings'

const mainTabs: MainTab[] = ['home', 'servers', 'packages']

export default function Page() {
  const [screen, setScreen] = useState<Screen>('home')
  const [selectedPlan, setSelectedPlan] = useState<Plan>(
    plans.find((p) => p.popular) ?? plans[0],
  )
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => setToast(msg)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(t)
  }, [toast])

  const isMainTab = mainTabs.includes(screen as MainTab)

  return (
    <main className="aurora-stage flex min-h-dvh w-full items-center justify-center p-0 sm:p-6">
      {/* Telegram Mini App content area (below Telegram's native header) */}
      <div className="relative flex h-dvh w-full max-w-[390px] flex-col overflow-hidden bg-background sm:h-[820px] sm:rounded-[32px] sm:border sm:border-border sm:shadow-2xl">
        <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-6 pt-4">
          <div className={isMainTab ? 'pb-20' : ''}>
            {screen === 'home' && (
              <HomeScreen
                onOpenSettings={() => setScreen('settings')}
                onChangeServer={() => setScreen('servers')}
                onAddKey={() => showToast('Outline key added')}
                onShareKey={() => showToast('Key link copied')}
                onSupport={() => setScreen('settings')}
              />
            )}

            {screen === 'servers' && (
              <ServersScreen onOpenSettings={() => setScreen('settings')} />
            )}

            {screen === 'packages' && (
              <PackagesScreen
                onOpenSettings={() => setScreen('settings')}
                onBuy={(plan) => {
                  setSelectedPlan(plan)
                  setScreen('checkout')
                }}
              />
            )}

            {screen === 'checkout' && (
              <CheckoutScreen
                plan={selectedPlan}
                onBack={() => setScreen('packages')}
                onSubmit={() => setScreen('pending')}
              />
            )}

            {screen === 'pending' && (
              <PaymentPendingScreen
                plan={selectedPlan}
                onBack={() => setScreen('checkout')}
                onHome={() => setScreen('home')}
                onSupport={() => setScreen('settings')}
              />
            )}

            {screen === 'approved' && (
              <PaymentApprovedScreen
                plan={selectedPlan}
                onBack={() => setScreen('home')}
                onAddKey={() => showToast('Outline key added')}
                onShareKey={() => showToast('Key link copied')}
              />
            )}

            {screen === 'settings' && (
              <SettingsScreen onBack={() => setScreen('home')} />
            )}
          </div>
        </div>

        {isMainTab && (
          <BottomNav active={screen as MainTab} onChange={(tab) => setScreen(tab)} />
        )}

        {/* Prototype-only helper: preview the payment approved flow */}
        {screen === 'pending' && (
          <button
            type="button"
            onClick={() => setScreen('approved')}
            className="absolute bottom-4 right-4 z-30 rounded-full border border-border bg-secondary/80 px-3 py-1.5 text-[11px] font-medium text-muted-foreground backdrop-blur"
          >
            Simulate approval →
          </button>
        )}

        {/* Toast */}
        {toast && (
          <div className="pointer-events-none absolute inset-x-0 bottom-24 z-40 flex justify-center px-4">
            <div className="flex items-center gap-2 rounded-full border border-border bg-popover/90 px-4 py-2 text-[13px] font-medium text-popover-foreground shadow-lg backdrop-blur">
              <Check size={15} className="text-success" />
              {toast}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
