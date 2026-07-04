import { Menu, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface TopbarProps {
  onOpenDrawer: () => void;
  loading: boolean;
  onRefresh: () => void;
}

export function Topbar({ onOpenDrawer, loading, onRefresh }: TopbarProps) {
  return (
    <div className="sticky top-0 z-30 h-16 flex items-center gap-2 border-b border-border bg-card/80 backdrop-blur px-4 md:px-6">
      {/* Mobile: hamburger + compact brand */}
      <div className="flex items-center gap-2 md:hidden">
        <Button variant="ghost" size="icon" onClick={onOpenDrawer} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 shrink-0 rounded-lg bg-gradient-to-br from-[#7c3aed] to-[#2563eb] grid place-items-center">
            <span className="text-white font-display font-black text-xs">R</span>
          </div>
          <span className="text-sm font-semibold truncate">Reseller Dashboard</span>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right cluster */}
      <div className="flex items-center gap-2">
        {/* Live / sync pill */}
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs">
          <span
            className={cn(
              "h-2 w-2 rounded-full shrink-0",
              loading ? "bg-warning animate-pulse" : "bg-[color:var(--success)]"
            )}
          />
          <span className="hidden sm:inline text-muted-foreground">
            {loading ? "Syncing" : "Live"}
          </span>
        </div>

        {/* Refresh */}
        <Button
          variant="ghost"
          size="icon"
          disabled={loading}
          onClick={onRefresh}
          title="Refresh data"
          aria-label="Refresh data"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>
    </div>
  );
}
