import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, CreditCard, ShoppingCart,
  Key, Server, UserCheck, X, Shield, Calculator, BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/overview',  label: 'Overview',   icon: LayoutDashboard, exact: true },
  { to: '/analytics', label: 'Analytics',  icon: BarChart3 },
  { to: '/resellers', label: 'Resellers',  icon: UserCheck },
  { to: '/plans',     label: 'Plans',      icon: CreditCard },
  { to: '/orders',    label: 'Orders',     icon: ShoppingCart },
  { to: '/settlements', label: 'Settlements', icon: Calculator },
  { to: '/customers', label: 'Customers',  icon: Users },
  { to: '/keys',      label: 'VPN Keys',   icon: Key },
  { to: '/servers',   label: 'Servers',    icon: Server },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

function NavItem({ to, label, icon: Icon, exact }: (typeof NAV)[number]) {
  return (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
        )
      }
    >
      <Icon size={16} className="shrink-0" />
      {label}
    </NavLink>
  );
}

export function Sidebar({ open, onClose }: Props) {
  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <Shield size={14} className="text-white" />
            </div>
            <span className="text-sm font-bold text-foreground tracking-tight">NovaNet Admin</span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-sidebar-foreground hover:bg-sidebar-accent lg:hidden"
          >
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {NAV.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border px-4 py-3">
          <p className="text-xs text-sidebar-foreground/60">NovaNet MM · Super Admin</p>
        </div>
      </aside>
    </>
  );
}
