import { NavLink } from "react-router-dom";
import { type LucideIcon, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ResellerProfile } from "@/hooks/useResellerProfile";

export interface NavItem {
  label: string;
  to: string;
  Icon: LucideIcon;
}

export interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse?: () => void;
  navItems: NavItem[];
  isActive: (to: string) => boolean;
  onNavigate?: () => void;
  profile: ResellerProfile | null;
  profileLoading: boolean;
  initials: string;
  onSignOut: () => void;
  forceExpanded?: boolean;
}

export function Sidebar({
  collapsed,
  onToggleCollapse,
  navItems,
  isActive,
  onNavigate,
  profile,
  profileLoading,
  initials,
  onSignOut,
  forceExpanded = false,
}: SidebarProps) {
  const expanded = !collapsed || forceExpanded;

  return (
    <div className="bg-sidebar text-sidebar-foreground border-r border-sidebar-border h-screen flex flex-col overflow-hidden">
      {/* Brand header */}
      <div className={cn(
        "h-14 px-2.5 flex items-center gap-2 border-b border-sidebar-border shrink-0",
        !expanded && "justify-center"
      )}>
        {!expanded && onToggleCollapse && !forceExpanded ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground shadow-[0_8px_22px_-12px_rgba(255,121,84,0.9)] transition-transform active:scale-95"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen className="h-5 w-5" />
          </button>
        ) : (
          <div className="h-8 w-8 shrink-0 rounded-lg bg-primary grid place-items-center shadow-[0_8px_22px_-12px_rgba(255,121,84,0.9)]">
            <span className="text-primary-foreground font-display font-black text-sm">R</span>
          </div>
        )}
        {expanded && (
          <span className="text-[13px] font-semibold truncate flex-1 min-w-0 text-white">
            Reseller Dashboard
          </span>
        )}
        {/* Collapse toggle — hidden inside mobile drawer (forceExpanded) */}
        {onToggleCollapse && !forceExpanded && expanded && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="ml-auto shrink-0 text-primary hover:bg-primary/10 hover:text-primary"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Group label — expanded only */}
      {expanded && (
        <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/55 shrink-0">
          Menu
        </p>
      )}

      {/* Nav list */}
      <nav className={cn("flex-1 px-2 space-y-1 overflow-y-auto", expanded ? "pt-1" : "pt-4")}>
        {navItems.map(({ label, to, Icon }) => {
          const active = isActive(to);
          return (
            <NavLink
              key={to}
              to={to}
              onClick={onNavigate}
              title={!expanded ? label : undefined}
              aria-label={!expanded ? label : undefined}
              className={cn(
                "h-9 rounded-md flex items-center gap-2.5 px-2.5 text-[13px] transition-colors",
                active
                  ? "bg-primary text-primary-foreground font-semibold shadow-[0_10px_24px_-16px_rgba(255,121,84,0.95)]"
                  : "text-sidebar-foreground hover:bg-white/8 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {expanded && <span className="truncate">{label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer user block */}
      <div className="border-t border-sidebar-border p-2 shrink-0">
        <div className="flex items-center gap-2 px-1 py-1 min-w-0">
          {/* Avatar */}
          <div className="h-8 w-8 shrink-0 rounded-full bg-primary grid place-items-center">
            <span className="text-primary-foreground text-xs font-bold">{initials}</span>
          </div>
          {expanded && (
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium truncate leading-tight text-white">
                {profileLoading ? "Loading…" : profile?.name || "Reseller"}
              </p>
              <p className="text-[11px] text-sidebar-foreground/60 truncate leading-tight">
                {profile?.email || "Signed in"}
              </p>
            </div>
          )}
        </div>

        {expanded ? (
          <Button
            variant="ghost"
            className="w-full mt-1 justify-start gap-2 text-[13px] text-sidebar-foreground hover:bg-white/6 hover:text-white"
            onClick={onSignOut}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="w-full mt-1 hover:text-destructive"
            onClick={onSignOut}
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
