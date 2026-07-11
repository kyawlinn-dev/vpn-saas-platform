import { useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

interface Props {
  children: ReactNode;
  adminName?: string;
  onRefresh?: () => Promise<void>;
  refreshing?: boolean;
  error?: string;
}

export function AppLayout({ children, onRefresh, refreshing, error }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          onMenuClick={() => setSidebarOpen(true)}
          onRefresh={onRefresh ? () => { void onRefresh(); } : undefined}
          refreshing={refreshing}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
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
