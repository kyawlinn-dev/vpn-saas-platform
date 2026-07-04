import { NavLink } from "react-router-dom";
import { type LucideIcon, ChevronsLeft, ChevronsRight, LogOut } from "lucide-react";
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
      <div className="h-16 px-3 flex items-center gap-2 border-b border-sidebar-border shrink-0">
        <div className="h-9 w-9 shrink-0 rounded-lg bg-gradient-to-br from-[#7c3aed] to-[#2563eb] grid place-items-center">
          <span className="text-white font-display font-black text-sm">R</span>
        </div>
        {expanded && (
          <span className="text-sm font-semibold truncate flex-1 min-w-0">
            Reseller Dashboard
          </span>
        )}
        {/* Collapse toggle — hidden inside mobile drawer (forceExpanded) */}
        {onToggleCollapse && !forceExpanded && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="ml-auto shrink-0"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <ChevronsLeft className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {/* Group label — expanded only */}
      {expanded && (
        <p className="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
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
                "h-10 rounded-md flex items-center gap-3 px-3 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                  : "text-sidebar-foreground hover:bg-secondary"
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {expanded && <span className="truncate">{label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer user block */}
      <div className="border-t border-sidebar-border p-2 shrink-0">
        <div className="flex items-center gap-2 px-1 py-1 min-w-0">
          {/* Avatar */}
          <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-[#7c3aed] to-[#2563eb] grid place-items-center">
            <span className="text-white text-xs font-bold">{initials}</span>
          </div>
          {expanded && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate leading-tight">
                {profileLoading ? "Loading…" : profile?.name || "Reseller"}
              </p>
              <p className="text-xs text-muted-foreground truncate leading-tight">
                {profile?.email || "Signed in"}
              </p>
            </div>
          )}
        </div>

        {expanded ? (
          <Button
            variant="ghost"
            className="w-full mt-1 justify-start gap-2 text-sm hover:text-destructive"
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
