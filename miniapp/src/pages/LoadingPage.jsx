import { cn } from "@/lib/utils";

function Shimmer({ className }) {
  return (
    <div className={cn("animate-pulse rounded-2xl bg-secondary/60", className)} />
  );
}

export default function LoadingPage() {
  return (
    <div className="flex flex-col gap-4 px-4 pb-6">

      {/* ── Header — exact mirror of the sticky BrandBar wrapper ─────────── */}
      <div className="sticky top-[var(--app-safe-top)] z-20 -mx-4 px-4 py-3 glass">
        <div className="flex items-center gap-3">
          {/* BrandLogo — h-10 w-10 rounded-2xl */}
          <Shimmer className="h-10 w-10 shrink-0 rounded-2xl" />
          {/* Brand name + subtitle text bars */}
          <div className="flex-1 space-y-1.5">
            <Shimmer className="h-[14px] w-28 rounded-lg" />
            <Shimmer className="h-[11px] w-20 rounded-lg" />
          </div>
          {/* LanguagePill — rounded-full pill shape */}
          <Shimmer className="h-7 w-[62px] shrink-0 rounded-full" />
          {/* Gear button — h-10 w-10 rounded-full */}
          <Shimmer className="h-10 w-10 shrink-0 rounded-full" />
        </div>
      </div>

      {/* ── AccessHero — GlassCard glow + aurora-glow ────────────────────── */}
      <div className="glass aurora-glow relative overflow-hidden rounded-[22px] p-4 shadow-[0_10px_40px_-12px_var(--primary)]">
        {/* Status row: icon + two text lines / Active chip */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <Shimmer className="h-10 w-10 shrink-0 rounded-full" />
            <div className="space-y-1.5">
              <Shimmer className="h-[14px] w-32 rounded-lg" />
              <Shimmer className="h-[11px] w-20 rounded-lg" />
            </div>
          </div>
          {/* Chip — "Active" */}
          <Shimmer className="h-5 w-14 rounded-full" />
        </div>

        {/* DataRing — 136 × 136 circle + caption */}
        <div className="my-4 flex flex-col items-center gap-3">
          <Shimmer className="h-[136px] w-[136px] rounded-full" />
          {/* "Data used this month" */}
          <Shimmer className="h-[11px] w-36 rounded-lg" />
        </div>

        {/* "Valid until …" expiry row */}
        <div className="mb-4 flex justify-center">
          <Shimmer className="h-[11px] w-28 rounded-lg" />
        </div>

        {/* "Add Key to Outline" button — h-12 full-width */}
        <Shimmer className="h-12 w-full" />
      </div>

      {/* ── CurrentServerCard — GlassCard ────────────────────────────────── */}
      <div className="glass relative overflow-hidden rounded-[22px] p-4">
        {/* "Current Server" label / "Change" link */}
        <div className="mb-3 flex items-center justify-between">
          <Shimmer className="h-[10px] w-24 rounded-lg" />
          <Shimmer className="h-[10px] w-10 rounded-lg" />
        </div>
        {/* Flag square + server name + sub-text */}
        <div className="flex items-center gap-3">
          <Shimmer className="h-8 w-8 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Shimmer className="h-[14px] w-36 rounded-lg" />
            <Shimmer className="h-[11px] w-24 rounded-lg" />
          </div>
        </div>
        {/* Chip row — "Premium" / "High Speed" */}
        <div className="mt-3 flex gap-1.5">
          <Shimmer className="h-5 w-16 rounded-full" />
          <Shimmer className="h-5 w-[72px] rounded-full" />
        </div>
      </div>

      {/* ── Quick Actions — section label + 2-col grid ───────────────────── */}
      <div>
        {/* "Quick Actions" label */}
        <Shimmer className="mb-3 h-[13px] w-24 rounded-lg" />
        {/* Tile grid — QuickAction is rounded-[20px] py-3.5 with h-9 icon ≈ 64px */}
        <div className="grid grid-cols-2 gap-3">
          <Shimmer className="h-16 rounded-[20px]" />
          <Shimmer className="h-16 rounded-[20px]" />
        </div>
      </div>

    </div>
  );
}
