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
    <div className="sticky top-0 z-30 h-10 flex items-center gap-1.5 border-b border-border bg-card/85 backdrop-blur px-2.5 md:h-11 md:px-4">
      {/* Mobile: hamburger + compact brand */}
      <div className="flex items-center gap-2 md:hidden">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenDrawer} aria-label="Open menu">
          <Menu className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-6 w-6 shrink-0 rounded-md bg-primary grid place-items-center">
            <span className="text-primary-foreground font-display font-black text-[11px]">R</span>
          </div>
          <span className="text-xs font-semibold truncate">Reseller Dashboard</span>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right cluster */}
      <div className="flex items-center gap-1.5">
        {/* Live / sync pill */}
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-[11px]">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full shrink-0",
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
          className="h-8 w-8"
          disabled={loading}
          onClick={onRefresh}
          title="Refresh data"
          aria-label="Refresh data"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>
    </div>
  );
}
