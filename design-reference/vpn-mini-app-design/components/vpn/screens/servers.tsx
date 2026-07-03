'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import {
  BrandBar,
  Chip,
  GlassCard,
  LatencyBadge,
  tagTone,
} from '@/components/vpn/shared'
import { cn } from '@/lib/utils'
import { countries, currentServer, type Country } from '@/lib/vpn-data'

type Filter = 'All' | 'Premium' | 'Low Latency'
const filters: Filter[] = ['All', 'Premium', 'Low Latency']

export function ServersScreen({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('All')
  const [expanded, setExpanded] = useState<string | null>('in')
  const [selectedId, setSelectedId] = useState<string>('in-91')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return countries
      .map((c) => {
        const servers = c.servers.filter((s) => {
          const matchesQuery =
            !q ||
            c.name.toLowerCase().includes(q) ||
            s.city.toLowerCase().includes(q) ||
            String(s.number).includes(q)
          const matchesFilter =
            filter === 'All' ||
            (filter === 'Premium' && s.tags.includes('Premium')) ||
            (filter === 'Low Latency' && s.latency <= 30)
          return matchesQuery && matchesFilter
        })
        return { ...c, servers }
      })
      .filter((c) => c.servers.length > 0)
  }, [query, filter])

  return (
    <div className="flex flex-col gap-4">
      <BrandBar onOpenSettings={onOpenSettings} />

      <div>
        <h2 className="text-[18px] font-semibold text-foreground">Choose Server</h2>
        <p className="text-[13px] text-muted-foreground">Select the best server for you</p>
      </div>

      {/* Current server */}
      <GlassCard className="aurora-glow p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Current
          </span>
          <LatencyBadge ms={currentServer.latency} />
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
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {currentServer.tags.map((t) => (
            <Chip key={t} tone={tagTone(t)}>
              {t}
            </Chip>
          ))}
        </div>
      </GlassCard>

      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search country or server"
          className="h-11 w-full rounded-2xl border border-border bg-secondary/50 pl-10 pr-4 text-[14px] text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
        />
      </div>

      {/* Filter chips */}
      <div className="flex gap-2">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors',
              filter === f
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'border-border bg-secondary/50 text-muted-foreground',
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Grouped list */}
      <div className="flex flex-col gap-3">
        {filtered.map((country) => (
          <CountryGroup
            key={country.code}
            country={country}
            expanded={expanded === country.code}
            onToggle={() =>
              setExpanded((prev) => (prev === country.code ? null : country.code))
            }
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        ))}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-[13px] text-muted-foreground">No servers found</p>
        )}
      </div>
    </div>
  )
}

function CountryGroup({
  country,
  expanded,
  onToggle,
  selectedId,
  onSelect,
}: {
  country: Country
  expanded: boolean
  onToggle: () => void
  selectedId: string
  onSelect: (id: string) => void
}) {
  const best = Math.min(...country.servers.map((s) => s.latency))

  return (
    <div className="glass overflow-hidden rounded-[20px]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="text-2xl" aria-hidden="true">
          {country.flag}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-foreground">{country.name}</p>
          <p className="text-[12px] text-muted-foreground">
            {country.servers.length} servers
          </p>
        </div>
        <LatencyBadge ms={best} />
        <ChevronDown
          size={18}
          className={cn(
            'text-muted-foreground transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {expanded && (
        <div className="space-y-1 border-t border-border px-2 pb-2 pt-2">
          {country.servers.map((s) => {
            const isSelected = selectedId === s.id
            return (
              <div
                key={s.id}
                className={cn(
                  'flex items-center gap-3 rounded-2xl px-2.5 py-2.5',
                  isSelected && 'bg-primary/10',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] font-medium text-foreground">
                      {s.city} #{s.number}
                    </p>
                    <LatencyBadge ms={s.latency} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {s.tags.map((t) => (
                      <Chip key={t} tone={tagTone(t)}>
                        {t}
                      </Chip>
                    ))}
                  </div>
                </div>
                {isSelected ? (
                  <span className="flex items-center gap-1 rounded-full bg-primary/20 px-2.5 py-1 text-[11px] font-semibold text-primary">
                    <Check size={13} /> Current
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelect(s.id)}
                    className="rounded-full border border-border bg-secondary/60 px-3.5 py-1.5 text-[12px] font-semibold text-foreground transition-colors hover:bg-secondary active:scale-95"
                  >
                    Select
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
