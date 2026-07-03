'use client'

import { Home, Server, Package } from 'lucide-react'
import { cn } from '@/lib/utils'

export type MainTab = 'home' | 'servers' | 'packages'

const tabs: { id: MainTab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'servers', label: 'Servers', icon: Server },
  { id: 'packages', label: 'Packages', icon: Package },
]

export function BottomNav({
  active,
  onChange,
}: {
  active: MainTab
  onChange: (tab: MainTab) => void
}) {
  return (
    <nav
      className="absolute inset-x-0 bottom-0 z-20 h-16 border-t border-border bg-background/80 backdrop-blur-xl"
      aria-label="Main navigation"
    >
      <ul className="mx-auto flex h-full max-w-md items-stretch justify-around px-2">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = active === id
          return (
            <li key={id} className="flex flex-1">
              <button
                type="button"
                onClick={() => onChange(id)}
                aria-current={isActive ? 'page' : undefined}
                className="flex flex-1 flex-col items-center justify-center gap-1"
              >
                <span
                  className={cn(
                    'flex h-8 w-14 items-center justify-center rounded-full transition-colors',
                    isActive ? 'bg-primary/15 text-primary' : 'text-muted-foreground',
                  )}
                >
                  <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                </span>
                <span
                  className={cn(
                    'text-[11px] font-medium',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {label}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
