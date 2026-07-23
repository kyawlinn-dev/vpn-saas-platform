import * as React from "react";
import { cn } from "@/lib/utils";

interface FilterChipOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface FilterChipsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: FilterChipOption<T>[];
}

function FilterChips<T extends string>({ value, onChange, options }: FilterChipsProps<T>) {
  return (
    <div className="flex gap-1.5 overflow-x-auto">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs whitespace-nowrap transition-colors",
              active
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-card text-muted-foreground border-border hover:bg-secondary"
            )}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span className={cn("ml-1 text-[11px]", active ? "text-primary/70" : "text-muted-foreground/70")}>
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export { FilterChips };
