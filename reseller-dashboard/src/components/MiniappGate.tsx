import { Lock } from "lucide-react";
import { useDashboardContext } from "@/providers/DashboardDataProvider";

/**
 * MiniappGate
 *
 * Wraps any page that is only meaningful for resellers with a connected
 * Telegram bot (has_miniapp = true).  Shows a neutral lock screen instead of
 * the real page content when the reseller doesn't have access, so typing the
 * URL directly never reveals the page structure.
 *
 * Profile is already fetched by DashboardDataProvider — no extra network call.
 */
export function MiniappGate({ children }: { children: React.ReactNode }) {
  const { profile, profileLoading } = useDashboardContext();

  if (profileLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!profile?.has_miniapp) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="rounded-full bg-secondary p-4">
          <Lock size={26} className="text-muted-foreground" />
        </div>
        <div>
          <h2 className="font-display text-base font-black text-foreground">
            Feature not available
          </h2>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            This page requires a connected Telegram bot. Contact your admin to
            set up your mini app.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
