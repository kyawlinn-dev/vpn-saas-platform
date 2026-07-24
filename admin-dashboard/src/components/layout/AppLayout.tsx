import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { cn } from '@/lib/utils';
import { useAdminAuth } from '@/providers/AdminAuthProvider';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const EXPANDED_WIDTH = 188;
const COLLAPSED_WIDTH = 60;

interface Props {
  children: ReactNode;
  onRefresh?: () => Promise<void>;
  refreshing?: boolean;
  error?: string;
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => (typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false)
  );

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isDesktop;
}

export function AppLayout({ children, onRefresh, refreshing, error }: Props) {
  const location = useLocation();
  const { admin, logout } = useAdminAuth();
  const isDesktop = useIsDesktop();

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('admin-sidebar-collapsed') === 'true'
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('admin-sidebar-collapsed', String(next));
      return next;
    });
  };

  const isActive = (to: string) => location.pathname.startsWith(to);
  const sidebarWidth = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  const sharedSidebarProps = {
    isActive,
    adminName: admin?.name,
    adminEmail: admin?.email,
    onSignOut: () => void logout(),
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex fixed left-0 top-0 z-40 h-screen" style={{ width: sidebarWidth }}>
        <Sidebar {...sharedSidebarProps} collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      </div>

      {/* Mobile drawer backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden transition-opacity duration-200',
          drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      {/* Mobile drawer panel */}
      <div
        className={cn(
          'fixed left-0 top-0 z-50 h-screen w-[280px] lg:hidden transition-transform duration-200',
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <Sidebar
          {...sharedSidebarProps}
          collapsed={false}
          forceExpanded
          onNavigate={() => setDrawerOpen(false)}
        />
      </div>

      {/* Main column */}
      <div className="transition-[padding-left] duration-200" style={{ paddingLeft: isDesktop ? sidebarWidth : 0 }}>
        <TopBar
          onMenuClick={() => setDrawerOpen(true)}
          onRefresh={onRefresh ? () => { void onRefresh(); } : undefined}
          refreshing={refreshing}
        />
        <main className="p-4 md:p-6 space-y-6">
          {error && (
            <div className="rounded-md border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
