import { useMemo, useState } from "react";
import { CalendarDays, Database, Layers, Smartphone } from "lucide-react";
import { useScopedDashboard } from "../hooks/useScopedDashboard";
import { formatMMK } from "../lib/format";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Plan } from "../types/api";

function PlanMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/55 px-2.5 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="truncate text-sm font-black text-foreground">{value}</div>
    </div>
  );
}

function PlanRow({ plan }: { plan: Plan }) {
  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-display text-base font-black text-foreground">
              {plan.name}
            </h2>
            <Badge variant={plan.is_active === false ? "default" : "success"}>
              {plan.is_active === false ? "Inactive" : "Active"}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatMMK(plan.price_mmk)} package for manual orders and Telegram purchases.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-lg font-black text-foreground">
            {formatMMK(plan.price_mmk)}
          </div>
          <div className="text-[10px] text-muted-foreground">{plan.duration_days} days</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <PlanMetric
          icon={<Database size={12} />}
          label="Data"
          value={plan.data_limit_gb ? `${plan.data_limit_gb} GB` : "Unlimited"}
        />
        <PlanMetric
          icon={<CalendarDays size={12} />}
          label="Duration"
          value={`${plan.duration_days} days`}
        />
        <PlanMetric
          icon={<Smartphone size={12} />}
          label="Devices"
          value={
            plan.max_devices
              ? `${plan.max_devices} device${plan.max_devices > 1 ? "s" : ""}`
              : "Unlimited"
          }
        />
      </div>
    </Card>
  );
}

export function PlansPage() {
  const { plans, loading } = useScopedDashboard();
  const durations = useMemo(
    () => Array.from(new Set(plans.map((plan) => plan.duration_days))).sort((a, b) => a - b),
    [plans]
  );
  const [duration, setDuration] = useState<number | "all">("all");

  const filteredPlans = useMemo(
    () => plans.filter((plan) => duration === "all" || plan.duration_days === duration),
    [plans, duration]
  );

  const activeCount = plans.filter((plan) => plan.is_active !== false).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[18px] font-black tracking-tight text-foreground">
            Plans
          </h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Active packages available for orders and Telegram Mini App purchases.
          </p>
        </div>
        <Badge variant="default" className="w-fit gap-1">
          <Layers size={13} />
          {activeCount} active / {plans.length} total
        </Badge>
      </div>

      {durations.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={duration === "all" ? "primary" : "outline"}
            size="sm"
            onClick={() => setDuration("all")}
          >
            All
          </Button>
          {durations.map((days) => (
            <Button
              key={days}
              variant={duration === days ? "primary" : "outline"}
              size="sm"
              onClick={() => setDuration(days)}
            >
              {days} days
            </Button>
          ))}
        </div>
      ) : null}

      {loading && plans.length === 0 ? (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-36 rounded-lg bg-secondary animate-pulse" />
          ))}
        </div>
      ) : filteredPlans.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
          No plans match this duration.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {filteredPlans.map((plan) => (
            <PlanRow key={plan.id} plan={plan} />
          ))}
        </div>
      )}
    </div>
  );
}
