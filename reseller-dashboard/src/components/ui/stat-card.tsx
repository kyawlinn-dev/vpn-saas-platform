import * as React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Card } from "./card";
import { cn } from "@/lib/utils";

type Accent = "violet" | "blue" | "emerald" | "amber" | "slate";

const ACCENT_STYLES: Record<Accent, { bg: string; text: string }> = {
  violet:  { bg: "#f5f3ff", text: "#7c3aed" },
  blue:    { bg: "#eff6ff", text: "#2563eb" },
  emerald: { bg: "#ecfdf5", text: "#059669" },
  amber:   { bg: "#fffbeb", text: "#d97706" },
  slate:   { bg: "#f1f5f9", text: "#475569" },
};

interface StatCardProps {
  label: string;
  value: string | number;
  caption?: string;
  delta?: { label: string; trend: "up" | "down" | "neutral" };
  icon?: React.ReactNode;
  accent?: Accent;
}

function StatCard({ label, value, caption, delta, icon, accent = "violet" }: StatCardProps) {
  const accentStyle = ACCENT_STYLES[accent];

  return (
    <Card className="p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon && (
          <div
            className="h-9 w-9 rounded-md grid place-items-center shrink-0"
            style={{ backgroundColor: accentStyle.bg, color: accentStyle.text }}
          >
            {icon}
          </div>
        )}
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-foreground font-display">{value}</p>
      {(delta || caption) && (
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {delta && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-medium",
                delta.trend === "up" && "text-[color:var(--success)]",
                delta.trend === "down" && "text-destructive",
                delta.trend === "neutral" && "text-muted-foreground"
              )}
            >
              {delta.trend === "up" && <TrendingUp className="h-3 w-3" />}
              {delta.trend === "down" && <TrendingDown className="h-3 w-3" />}
              {delta.label}
            </span>
          )}
          {caption && <span className="text-xs text-muted-foreground">{caption}</span>}
        </div>
      )}
    </Card>
  );
}

export { StatCard };
