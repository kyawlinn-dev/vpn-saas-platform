import * as React from "react";
import { cn } from "@/lib/utils";
import { formatUsageGb } from "@/lib/format";

interface UsageBarProps {
  used: number;
  limit: number;
  remaining?: number | null;
  connections?: number;
  showMeta?: boolean;
}

function UsageBar({ used, limit, remaining, connections, showMeta = true }: UsageBarProps) {
  const percent = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;

  const fillClass =
    percent >= 90
      ? "bg-destructive"
      : percent >= 70
        ? "bg-warning"
        : "bg-primary";

  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <span className="font-semibold text-sm">{formatUsageGb(used)}</span>
        <span className="text-sm text-muted-foreground">/ {formatUsageGb(limit)}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-secondary">
        <div
          className={cn("h-full rounded-full", fillClass)}
          style={{ width: `${percent}%` }}
        />
      </div>
      {showMeta && (
        <p className="text-xs text-muted-foreground">
          {percent.toFixed(0)}% • Rem: {remaining == null ? "-" : formatUsageGb(remaining)} • Conn:{" "}
          {Number(connections || 0).toLocaleString()}
        </p>
      )}
    </div>
  );
}

export { UsageBar };
