import * as React from "react";
import { Badge } from "./badge";
import type { BadgeProps } from "./badge";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

const STATUS_MAP: Record<string, { variant: BadgeVariant; label: string }> = {
  active:         { variant: "success",     label: "Active" },
  paid:           { variant: "success",     label: "Paid" },
  confirmed:      { variant: "success",     label: "Confirmed" },
  pending:        { variant: "info",        label: "Pending" },
  pending_review: { variant: "warning",     label: "Pending Review" },
  overdue:        { variant: "warning",     label: "Overdue" },
  expired:        { variant: "destructive", label: "Expired" },
  rejected:       { variant: "destructive", label: "Rejected" },
  stopped:        { variant: "default",     label: "Stopped" },
  deleted:        { variant: "default",     label: "Deleted" },
  unpaid:         { variant: "default",     label: "Unpaid" },
  refunded:       { variant: "default",     label: "Refunded" },
  trial:          { variant: "primary",     label: "Trial" },
  purchase:       { variant: "default",     label: "Purchase" },
};

export function statusVariant(status: string): BadgeVariant {
  return STATUS_MAP[status]?.variant ?? "default";
}

function toLabel(status: string): string {
  if (STATUS_MAP[status]) return STATUS_MAP[status].label;
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StatusBadge({ status }: { status: string }) {
  const variant = statusVariant(status);
  return <Badge variant={variant}>{toLabel(status)}</Badge>;
}
