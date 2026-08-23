import * as React from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export interface ActionMenuItem {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

interface ActionMenuProps {
  items: ActionMenuItem[];
  align?: "left" | "right";
  label?: string;
  className?: string;
}

export function ActionMenu({
  items,
  align = "right",
  label = "More actions",
  className,
}: ActionMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState({ top: 0, left: 0 });
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  const enabledItems = items.filter((item) => !item.disabled);
  const hasEnabledItems = enabledItems.length > 0;

  // Flip the menu above the trigger when there isn't room to open below —
  // without this, a menu button on the last/bottom row (e.g. the pending
  // orders list in a short mobile viewport) always opened downward and got
  // clipped by the screen edge, making the lower items (Reject, etc.)
  // impossible to reach.
  const updatePosition = React.useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const width = 196;
    const left =
      align === "right"
        ? Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width))
        : Math.max(8, Math.min(window.innerWidth - width - 8, rect.left));

    // menuRef isn't mounted yet on the very first call that opens the menu
    // (this runs before the portal commits) — falls back to opening below,
    // then the layout effect below re-measures the real height and flips
    // it upward before paint if it doesn't actually fit, so there's no
    // visible jump.
    const menuHeight = menuRef.current?.getBoundingClientRect().height ?? 0;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const margin = 8;

    const top =
      menuHeight > 0 && spaceBelow < menuHeight + margin && spaceAbove > spaceBelow
        ? Math.max(margin, rect.top - menuHeight - 6)
        : Math.min(window.innerHeight - margin, rect.bottom + 6);

    setPosition({ top, left });
  }, [align]);

  // Re-measure with the layout effect (runs synchronously before the
  // browser paints) once the menu is actually in the DOM, so the flip
  // decision above uses the real rendered height instead of the 0 fallback.
  React.useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  React.useEffect(() => {
    if (!open) return;
    updatePosition();

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, updatePosition]);

  const menu = open
    ? createPortal(
        <div
          ref={menuRef}
          className="fixed z-[90] w-[196px] rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-[0_18px_48px_rgba(15,23,42,0.18)]"
          style={{ top: position.top, left: position.left }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                "flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-xs font-medium transition-colors",
                item.destructive
                  ? "text-destructive hover:bg-destructive/10"
                  : "text-foreground hover:bg-secondary",
                item.disabled && "cursor-not-allowed opacity-45 hover:bg-transparent"
              )}
            >
              {item.icon ? <span className="grid h-4 w-4 shrink-0 place-items-center">{item.icon}</span> : null}
              <span className="truncate">{item.label}</span>
            </button>
          ))}
          {!hasEnabledItems ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No actions available</div>
          ) : null}
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        className={cn(
          "relative h-7 w-7 before:absolute before:-inset-1.5 before:content-['']",
          className
        )}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          updatePosition();
          setOpen((prev) => !prev);
        }}
      >
        <MoreVertical className="h-4 w-4" />
      </Button>
      {menu}
    </>
  );
}
