import { useScopedDashboard } from "../hooks/useScopedDashboard";
import { PlanCard } from "@/components/ui/plan-card";

export function PlansPage() {
  const { plans, loading } = useScopedDashboard();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight font-display text-foreground">
          Plans
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reference page for plans that resellers can use when creating or renewing orders.
        </p>
      </div>

      {loading && plans.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 rounded-lg bg-secondary animate-pulse" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          No plans available yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>
      )}
    </div>
  );
}
