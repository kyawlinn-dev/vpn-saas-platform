import { useEffect, useState } from "react";
import { Server as ServerIcon, AlertTriangle, Check } from "lucide-react";
import {
  Dialog, DialogHeader, DialogTitle, DialogDescription,
  DialogBody, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { FlagIcon } from "@/lib/flag";
import { api } from "@/lib/api";
import type { EligibleServer, EligibleServersResponse, Order } from "../types/api";

// Mirrors how the miniapp presents servers to customers (ServersPage.jsx):
// city as the title, country as the subtitle, real flag — never the raw
// internal server name/slug. The backend fills display_city/display_country
// from the server's DigitalOcean region as a fallback when they aren't set
// directly, so this is never a raw slug like "sgp1-3111".
function serverLabel(s: { display_city: string | null; display_country: string | null; name: string }) {
  const title = s.display_city || s.name;
  const subtitle = s.display_country && s.display_country !== title ? s.display_country : null;
  return { title, subtitle };
}

export interface ServerSwitchDialogProps {
  order: Order | null;
  open: boolean;
  onClose: () => void;
  onSwitched: (order: Order, server: EligibleServer) => void;
}

// Paid-orders-only server switch. Eligible list is any active, healthy
// server with spare capacity — trial-tier included, any region — per the
// 2026-08-16 "paid customers get emergency access to any server" decision.
// No rate limit, no automatic customer notification (reseller's call).
export function ServerSwitchDialog({ order, open, onClose, onSwitched }: ServerSwitchDialogProps) {
  const [currentServer, setCurrentServer] = useState<EligibleServersResponse["current_server"]>(null);
  const [servers, setServers] = useState<EligibleServer[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !order) {
      setCurrentServer(null);
      setServers(null);
      setSelectedId(null);
      setError("");
      return;
    }

    let active = true;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const res = await api.get<EligibleServersResponse>(`/reseller/orders/${order.id}/eligible-servers`);
        if (!active) return;
        setCurrentServer(res.data?.current_server ?? null);
        setServers(res.data?.servers ?? []);
      } catch (err: any) {
        if (active) setError(err?.response?.data?.error || "Failed to load servers");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [open, order]);

  const handleConfirm = async () => {
    if (!order || !selectedId) return;
    setSwitching(true);
    setError("");
    try {
      await api.post(`/reseller/orders/${order.id}/switch-server`, {
        new_server_id: selectedId,
      });
      const server = servers?.find((s) => s.id === selectedId);
      if (server) onSwitched(order, server);
      onClose();
    } catch (err: any) {
      const code = err?.response?.data?.error;
      const messages: Record<string, string> = {
        SERVER_NOT_AVAILABLE: "That server is no longer available.",
        SERVER_UNHEALTHY: "That server is currently unhealthy — pick another.",
        SERVER_FULL: "That server just filled up — pick another.",
        SAME_SERVER: "Customer is already on that server.",
        NO_ACTIVE_KEY: "This order has no active key to switch.",
      };
      setError(messages[code] || err?.response?.data?.error || "Failed to switch server");
    } finally {
      setSwitching(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} size="sm">
      <DialogHeader>
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <ServerIcon size={18} />
          </div>
          <div>
            <DialogTitle>Switch Server</DialogTitle>
            <DialogDescription>
              Move {order?.customer?.full_name || "this customer"} to a different server
            </DialogDescription>
          </div>
        </div>
        <DialogClose />
      </DialogHeader>

      <DialogBody className="space-y-3">
        {loading ? (
          <div className="h-14 animate-pulse rounded-lg bg-secondary/50" />
        ) : currentServer ? (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
            <FlagIcon flagEmoji={currentServer.flag_emoji} size={22} />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Currently connected
              </div>
              <div className="truncate text-sm font-medium text-foreground">
                {serverLabel(currentServer).title}
                {serverLabel(currentServer).subtitle ? (
                  <span className="text-muted-foreground"> · {serverLabel(currentServer).subtitle}</span>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning/10 p-2.5 text-xs text-warning">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            The customer's connection will briefly drop while they reconnect. Their key link
            stays the same — no need to resend it.
          </span>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-secondary/50" />
            ))}
          </div>
        ) : error && !servers?.length ? (
          <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : servers && servers.length === 0 ? (
          <div className="rounded-md border border-border bg-secondary/40 px-3 py-4 text-center text-sm text-muted-foreground">
            No other healthy server has spare capacity right now.
          </div>
        ) : (
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {servers?.map((s) => {
              const { title, subtitle } = serverLabel(s);
              const selected = selectedId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border hover:bg-secondary/50"
                  }`}
                >
                  <FlagIcon flagEmoji={s.flag_emoji} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-foreground">{title}</div>
                    {subtitle ? (
                      <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>
                    ) : null}
                  </div>
                  {s.server_tier === "trial" ? <Chip tone="warning">Trial server</Chip> : null}
                  <div
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                      selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
                    }`}
                  >
                    {selected ? <Check size={12} /> : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {error && servers?.length ? (
          <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
      </DialogBody>

      <DialogFooter>
        <Button variant="outline" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button
          className="flex-1"
          onClick={() => void handleConfirm()}
          loading={switching}
          disabled={!selectedId || switching || loading}
        >
          {switching ? "Switching…" : "Confirm Switch"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
