import * as React from "react";
import { Card } from "./card";
import { Badge } from "./badge";
import { Chip } from "./chip";
import { cn } from "@/lib/utils";
import { formatMMK } from "@/lib/format";

interface Plan {
  name: string;
  price_mmk: number;
  duration_days: number;
  data_limit_gb?: number | null;
  max_devices?: number | null;
  is_active?: boolean;
}

interface PlanCardProps {
  plan: Plan;
  selected?: boolean;
  onSelect?: () => void;
  footer?: React.ReactNode;
}

function PlanCard({ plan, selected, onSelect, footer }: PlanCardProps) {
  return (
    <Card
      className={cn(
        "p-5",
        onSelect && "cursor-pointer",
        selected && "ring-2 ring-primary border-primary"
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-base">{plan.name}</span>
        {plan.is_active === false ? (
          <Badge variant="default">Inactive</Badge>
        ) : (
          <Badge variant="success">Active</Badge>
        )}
      </div>
      <div className="mt-3">
        <span className="text-2xl font-bold text-foreground">{formatMMK(plan.price_mmk)}</span>
        <span className="text-sm text-muted-foreground"> / {plan.duration_days}d</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Chip tone="muted">{plan.data_limit_gb ? `${plan.data_limit_gb} GB` : "Unlimited"}</Chip>
        <Chip tone="muted">
          {plan.max_devices
            ? `${plan.max_devices} device${plan.max_devices > 1 ? "s" : ""}`
            : "Unlimited devices"}
        </Chip>
      </div>
      {footer && <div className="mt-3">{footer}</div>}
    </Card>
  );
}

export { PlanCard };
