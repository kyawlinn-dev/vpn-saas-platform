import * as React from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export interface ActionMenuItem {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

interface ActionMenuProps {
  items: ActionMenuItem[];
  align?: 'left' | 'right';
  label?: string;
  className?: string;
}

export function ActionMenu({
  items,
  align = 'right',
  label = 'More actions',
  className,
}: ActionMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState({ top: 0, left: 0 });
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  const hasEnabledItems = items.some((item) => !item.disabled);

  const updatePosition = React.useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const width = 196;
    const left =
      align === 'right'
        ? Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width))
        : Math.max(8, Math.min(window.innerWidth - width - 8, rect.left));
    const top = Math.min(window.innerHeight - 12, rect.bottom + 6);
    setPosition({ top, left });
  }, [align]);

  React.useEffect(() => {
    if (!open) return;
    updatePosition();

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, updatePosition]);

  const menu = open
    ? createPortal(
        <div
          ref={menuRef}
          className="fixed z-[90] w-[196px] rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-[0_18px_48px_rgba(0,0,0,0.35)]"
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
                'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-medium transition-colors',
                item.destructive
                  ? 'text-destructive hover:bg-destructive/10'
                  : 'text-foreground hover:bg-secondary',
                item.disabled && 'cursor-not-allowed opacity-45 hover:bg-transparent',
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
        document.body,
      )
    : null;

  return (
    <>
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        className={cn('h-7 w-7', className)}
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
