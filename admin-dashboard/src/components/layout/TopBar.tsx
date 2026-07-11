import { Menu, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdminAuth } from '@/providers/AdminAuthProvider';

interface Props {
  onMenuClick: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function TopBar({ onMenuClick, onRefresh, refreshing }: Props) {
  const { admin, logout } = useAdminAuth();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors lg:hidden"
        >
          <Menu size={18} />
        </button>
      </div>

      <div className="flex items-center gap-2">
        {onRefresh && (
          <Button variant="ghost" size="icon" onClick={onRefresh} disabled={refreshing} title="Refresh data">
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </Button>
        )}
        <div className="hidden sm:block text-sm text-muted-foreground">
          {admin?.name || admin?.email}
        </div>
        <Button variant="outline" size="sm" leftIcon={<LogOut size={14} />} onClick={() => void logout()}>
          Sign out
        </Button>
      </div>
    </header>
  );
}
